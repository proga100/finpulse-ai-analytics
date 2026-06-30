from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from typing import Any

from .analytics_templates import AnalyticsTemplate, load_templates, parse_template, save_new_template
from .config import Settings
from .query_normalizer import QueryNormalizer, build_query_normalizer
from .schemas import ClarificationOption, ClarificationQuestion
from .sql_guard import SqlGuard, SqlGuardError
from .template_vector_index import TemplateVectorIndex

logger = logging.getLogger(__name__)


class TemplateSqlAgent:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.templates: list[AnalyticsTemplate] = []
        self.index: TemplateVectorIndex | None = None
        self.normalizer: QueryNormalizer = build_query_normalizer(settings)
        self._schema_info: str | None = None

    def _send_progress(self, user_context: dict[str, Any], message: str) -> None:
        on_progress = user_context.get("on_progress")
        if on_progress:
            try:
                on_progress(message)
            except Exception as e:
                logger.warning(f"Failed to send progress: {e}")

    async def initialize(self) -> None:
        self.templates = load_templates(self.settings.template_file)
        self._validate_templates()
        self.index = TemplateVectorIndex(self.settings, self.templates)
        self.index.initialize()

    async def generate_sql(self, question: str, user_context: dict[str, Any]) -> str:
        if self.index is None:
            raise RuntimeError("Template SQL agent has not been initialized.")

        # Reuse the normalize + search already done by the clarification gate
        # for the same question, instead of repeating those Gemini calls.
        cache = user_context.pop("_match_cache", None)
        if cache and cache.get("question") == question:
            normalized = cache["normalized"]
            result = cache["result"]
            cache_hit = True
        else:
            self._send_progress(user_context, "🔍 Normalizing and translating query...")
            normalized = await asyncio.to_thread(
                self._normalize_question,
                question,
                user_context.get("language"),
            )
            result = None
            cache_hit = False

        # Check for exact case-insensitive matches on examples
        cleaned_question = question.strip().lower()
        cleaned_corrected = normalized.corrected_text.strip().lower()
        exact_match = None
        for template in self.index.templates.values():
            if any(ex.strip().lower() == cleaned_question for ex in template.examples) or \
               any(ex.strip().lower() == cleaned_corrected for ex in template.examples):
                exact_match = template
                break

        if exact_match:
            self._send_progress(user_context, f"✅ Template matched: {exact_match.title} (Confidence: 1.00)")
            user_context["show_table"] = exact_match.show_table
            return exact_match.sql

        if not cache_hit:
            self._send_progress(user_context, "🔍 Checking templates in vector index...")
            result = await asyncio.to_thread(self.index.search, normalized.search_text)
        if result is None or result.confidence < self.settings.template_match_threshold:
            self._send_progress(user_context, "⚠️ No template matched. Falling back to dynamic Text-to-SQL builder...")
            # Fallback to dynamic SQL generation
            db = user_context.get("database")
            if db is not None:
                return await self._generate_fallback_sql(question, user_context, db)
            return _clarification_response(user_context.get("language"))

        self._send_progress(user_context, f"✅ Template matched: {result.template.title} (Confidence: {result.confidence:.2f})")
        user_context["show_table"] = result.template.show_table
        return result.template.sql

    async def assess_clarification(
        self,
        question: str,
        user_context: dict[str, Any],
        history: list[dict[str, Any]],
        round: int,
    ) -> ClarificationQuestion | None:
        """Decide whether the user's intent is too ambiguous to answer.

        Returns the next clarifying question (with generated options) when the
        AI is uncertain, or ``None`` when the question is clear enough to proceed
        to SQL generation. Only triggers when template matching is low-confidence
        (the genuine hesitation point) so confident queries are never interrupted.
        """
        if not self.settings.clarification_enabled:
            return None
        if not self.settings.gemini_api_key:
            return None
        if round >= self.settings.clarification_max_rounds:
            return None
        if self.index is None:
            return None

        language = user_context.get("language")

        # Re-use the existing template-match signal: if a template matches with
        # high confidence (or exactly), the intent is clear -> no clarification.
        normalized = await asyncio.to_thread(self._normalize_question, question, language)
        result = await asyncio.to_thread(self.index.search, normalized.search_text)
        # Cache so generate_sql can skip the identical normalize + search pass.
        user_context["_match_cache"] = {
            "question": question,
            "normalized": normalized,
            "result": result,
        }

        cleaned_question = question.strip().lower()
        cleaned_corrected = normalized.corrected_text.strip().lower()
        for template in self.index.templates.values():
            if any(ex.strip().lower() == cleaned_question for ex in template.examples) or \
               any(ex.strip().lower() == cleaned_corrected for ex in template.examples):
                return None

        if result is not None and result.confidence >= self.settings.template_match_threshold:
            return None

        # Genuine hesitation: ask the Gemini intent judge. Cap how long the user
        # waits — if the model is slow/overloaded, skip clarification and answer.
        conversation_history = user_context.get("conversation_history")
        self._send_progress(user_context, "🤔 Clarifying your intent...")
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(
                    self._build_clarification,
                    question,
                    history,
                    round,
                    language,
                    conversation_history,
                ),
                timeout=self.settings.clarification_timeout_ms / 1000,
            )
        except asyncio.TimeoutError:
            logger.warning("Clarification judge timed out; proceeding without clarification.")
            return None

    def _build_clarification(
        self,
        question: str,
        history: list[dict[str, Any]],
        round: int,
        language: str | None,
        conversation_history: list[dict[str, Any]] | None = None,
    ) -> ClarificationQuestion | None:
        try:
            from google import genai
            from google.genai import types

            # NB: no http_options timeout here — Gemini rejects deadlines < 10s.
            # The user-facing cap is enforced by asyncio.wait_for in the caller.
            client = genai.Client(api_key=self.settings.gemini_api_key)
            prompt = _clarification_prompt(
                question,
                history,
                language,
                schema_hint=self._schema_info,
                conversation_history=conversation_history,
            )
            response = client.models.generate_content(
                model=self.settings.clarification_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                ),
            )
            payload = json.loads(response.text.strip())
        except Exception as e:
            logger.warning(f"Clarification judge failed: {e}")
            return None

        if payload.get("answerable") is True:
            return None

        raw_question = (payload.get("question") or "").strip()
        raw_options = payload.get("options") or []
        if not raw_question or not isinstance(raw_options, list):
            return None

        options: list[ClarificationOption] = []
        for idx, label in enumerate(raw_options[:4]):
            text = str(label).strip()
            if text:
                options.append(ClarificationOption(id=f"opt-{idx}", label=text))
        if not options:
            return None

        return ClarificationQuestion(
            question=raw_question,
            options=options,
            allow_multi=True,
            allow_other=True,
            round=round,
            max_rounds=self.settings.clarification_max_rounds,
        )

    async def summarize_result(
        self,
        question: str,
        rows: list[dict[str, Any]],
        columns: list[str],
        language: str | None = None,
    ) -> str:
        if not rows:
            return "No matching analytics rows were returned."

        if self.settings.gemini_api_key:
            try:
                from google import genai
                from google.genai import types

                client = genai.Client(
                    api_key=self.settings.gemini_api_key,
                    http_options=types.HttpOptions(timeout=self.settings.gemini_request_timeout_ms),
                )

                lang_name = "Russian"
                if language == "en":
                    lang_name = "English"
                elif language == "uz":
                    lang_name = "Uzbek (either Latin or Cyrillic matching the script of the user question)"

                prompt = f"""
You are FinPulse, a helpful analytics copilot for a fintech / neobank database.
Write a concise, professional summary/answer to the user's question based on the database query results.
Format money figures with thousands separators and a currency hint where relevant.
Do not mention SQL or technical database columns unless asked. Write like a human assistant explaining the numbers.
CRITICAL: You MUST write the entire response in {lang_name}. Do NOT respond in any other language.

User Question: {question}
Data Columns: {columns}
Data Rows: {rows}
"""
                # Try a light model first, then fall back to a stronger one if it
                # is overloaded (Gemini 503 UNAVAILABLE) or errors — so a transient
                # capacity spike doesn't drop the summary to a generic line.
                seen: set[str] = set()
                models = [
                    m
                    for m in (self.settings.query_normalizer_model, self.settings.sql_generation_model_fast)
                    if m and not (m in seen or seen.add(m))
                ]
                for model in models:
                    try:
                        response = await asyncio.to_thread(
                            lambda m=model: client.models.generate_content(
                                model=m,
                                contents=prompt,
                                config=types.GenerateContentConfig(temperature=0.2),
                            )
                        )
                        text = (response.text or "").strip()
                        if text:
                            return text
                    except Exception as e:
                        logger.warning(f"Summary model {model} failed: {e}")
                        continue
            except Exception as e:
                logger.warning(f"Failed to use LLM to summarize results: {e}")

        return f"Returned {len(rows)} row(s) for: {question}"

    async def rewrite_standalone_question(
        self,
        question: str,
        conversation_history: list[dict[str, Any]],
        language: str | None,
        generated_sql: str | None = None,
    ) -> str:
        """Fold a follow-up + prior turns into one self-contained question.

        The result, asked on its own with no conversation context, should
        reproduce the same answer. The actual SQL that answered this turn is the
        ground truth for which columns/filters to describe (so a "only name and
        phone" refinement is preserved). Falls back to the raw question on error.
        """
        prior = [t for t in (conversation_history or []) if (t.get("question") or "").strip()]
        if not prior or not self.settings.gemini_api_key:
            return question

        try:
            from google import genai
            from google.genai import types

            client = genai.Client(
                api_key=self.settings.gemini_api_key,
                http_options=types.HttpOptions(timeout=self.settings.gemini_request_timeout_ms),
            )

            lang_name = "Russian"
            if language == "en":
                lang_name = "English"
            elif language == "uz":
                lang_name = "Uzbek (match the script — Latin or Cyrillic — of the user's message)"

            history_lines = "\n".join(
                f'- "{(t.get("question") or "").strip()}"' for t in prior[-3:]
            )
            sql_block = ""
            if (generated_sql or "").strip():
                sql_block = (
                    "\nThe query that actually produced the answer (GROUND TRUTH for which "
                    "columns and filters to describe):\n"
                    f"{generated_sql.strip()}\n"
                )
            prompt = f"""
You rewrite a short follow-up analytics request into ONE self-contained question.
The rewritten question, asked on its own with NO prior context, must reproduce the
SAME result as this turn.

Previous question(s) in this conversation (most recent last):
{history_lines}

Follow-up message from the user: "{question}"
{sql_block}
Rules:
- Describe EXACTLY what the query returns: the SAME columns and ONLY those, plus the
  same filters/sorting/limit intent. If the query selects only specific columns
  (e.g. only name and phone), the question MUST say "only" those — do not imply
  extra fields.
- Preserve restrictive words from the follow-up like "only" / "только" / "faqat".
- Keep it natural and concise. Do NOT mention SQL, column names, or that it is a rewrite.
- Output ONLY the rewritten question text, nothing else.
- Write it in {lang_name}.
"""
            response = await asyncio.to_thread(
                lambda: client.models.generate_content(
                    model=self.settings.query_normalizer_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(temperature=0.1),
                )
            )
            rewritten = (response.text or "").strip().strip('"').strip()
            return rewritten or question
        except Exception as e:
            logger.warning(f"Failed to rewrite standalone question: {e}")
            return question

    async def _fetch_schema_info(self, db: Any) -> str:
        allowed_table_names = {t.split(".")[-1] for t in SqlGuard.allowed_relations}
        
        # Query 1: Fetch columns, datatypes, and enum values
        columns_query = """
            SELECT 
                c.table_name, 
                c.column_name, 
                c.data_type,
                t.typname AS udt_name,
                (
                    SELECT string_agg(quote_literal(enumlabel), ', ') 
                    FROM pg_enum 
                    JOIN pg_type e ON pg_enum.enumtypid = e.oid 
                    WHERE e.typname = t.typname
                ) AS enum_values
            FROM information_schema.columns c
            LEFT JOIN pg_type t ON t.typname = c.udt_name
            WHERE c.table_schema = 'fin'
            ORDER BY c.table_name, c.ordinal_position;
        """

        # Query 2: Fetch foreign key relationships
        fk_query = """
            SELECT
                kcu.table_name AS source_table,
                kcu.column_name AS source_column,
                ccu.table_name AS target_table,
                ccu.column_name AS target_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = 'fin'
            ORDER BY source_table, source_column;
        """

        try:
            # Run both queries against the database
            async with db.acquire() as conn:
                columns_records = await conn.fetch(columns_query)
                fk_records = await conn.fetch(fk_query)

            # Process tables and columns
            tables: dict[str, list[str]] = {}
            for r in columns_records:
                tbl_name = r["table_name"]
                if tbl_name not in allowed_table_names:
                    continue
                tbl = f"fin.{tbl_name}"
                col_name = r["column_name"]
                data_type = r["data_type"]
                enum_vals = r["enum_values"]

                if enum_vals:
                    col_str = f"  - {col_name}: {data_type} (Enum values: {enum_vals})"
                elif data_type == "USER-DEFINED" and r["udt_name"]:
                    col_str = f"  - {col_name}: {r['udt_name']}"
                else:
                    col_str = f"  - {col_name}: {data_type}"
                
                tables.setdefault(tbl, []).append(col_str)

            # Process foreign key relations
            relationships = []
            for r in fk_records:
                src_tbl = r["source_table"]
                tgt_tbl = r["target_table"]
                if src_tbl not in allowed_table_names or tgt_tbl not in allowed_table_names:
                    continue
                src_col = r["source_column"]
                tgt_col = r["target_column"]
                relationships.append(f"  - fin.{src_tbl}.{src_col} -> fin.{tgt_tbl}.{tgt_col}")

            # Construct final schema description string
            schema_lines = ["### Tables and Columns:"]
            for tbl, cols in sorted(tables.items()):
                schema_lines.append(f"Table: {tbl}")
                schema_lines.extend(cols)
                schema_lines.append("")

            if relationships:
                schema_lines.append("### Foreign Key Relationships (Joins):")
                schema_lines.extend(sorted(list(set(relationships))))
                schema_lines.append("")

            return "\n".join(schema_lines)
        except Exception as e:
            logger.exception("Failed to query DB schema.")
            return "Could not retrieve database schema."

    async def _generate_fallback_sql(
        self, question: str, user_context: dict[str, Any], db: Any
    ) -> str:
        if not self.settings.gemini_api_key:
            return _clarification_response(user_context.get("language"))

        if not self._schema_info:
            self._schema_info = await self._fetch_schema_info(db)

        from google import genai
        from google.genai import types

        client = genai.Client(
            api_key=self.settings.gemini_api_key,
            http_options=types.HttpOptions(timeout=self.settings.gemini_request_timeout_ms),
        )

        feedback = None
        guard = SqlGuard(max_rows=self.settings.max_result_rows)

        total_attempts = max(1, self.settings.sql_generation_max_attempts)
        fast_attempts = max(0, min(self.settings.sql_generation_fast_attempts, total_attempts))

        for attempt in range(total_attempts):
            # Light model for the first attempts; escalate to the strong (slower)
            # model only once the fast tier has failed.
            use_strong = attempt >= fast_attempts
            model = (
                self.settings.sql_generation_model_strong
                if use_strong
                else self.settings.sql_generation_model_fast
            )
            tier_label = "strong" if use_strong else "fast"
            self._send_progress(
                user_context,
                f"⚙️ Generating SQL query (Attempt {attempt + 1}, {tier_label} model)...",
            )
            prompt = _generation_prompt(
                question,
                self._schema_info,
                feedback,
                user_context.get("conversation_history"),
            )
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0,
                    ),
                )
                payload = json.loads(response.text.strip())
                if not isinstance(payload, dict):
                    feedback = "Response JSON must be a single object with an 'sql' key, not a list."
                    self._send_progress(user_context, f"⚠️ Attempt {attempt + 1} output was invalid. Retrying...")
                    continue
                sql = (payload.get("sql") or "").strip()
                if not sql:
                    feedback = "Response JSON was missing the 'sql' key."
                    self._send_progress(user_context, f"⚠️ Attempt {attempt + 1} output was invalid. Retrying...")
                    continue

                # 1. Guard check
                self._send_progress(user_context, f"🛡️ Validating query safety guard rules...")
                guarded = guard.validate(sql)

                # 2. Database compile & run verification
                self._send_progress(user_context, f"🔌 Verifying query execution against database...")
                async with db.acquire() as conn:
                    # Verify syntax/execution correctness on DB
                    verify_rows = await conn.fetch(f"SELECT * FROM ({guarded.sql}) AS check_query LIMIT 1")

                # A valid query that returns 0 rows often means a filter/join does not
                # match how the data is actually stored. Give the model one chance to
                # reconsider before accepting an empty (likely wrong) answer.
                if not verify_rows and attempt < total_attempts - 1:
                    feedback = (
                        "The SQL is valid but returned 0 rows. This usually means a filter, "
                        "join, or literal value does not match how the data is actually stored "
                        "— e.g. a referenced foreign-key column may be entirely NULL (so an "
                        "INNER JOIN on it yields nothing), or a string/enum literal does not "
                        "exist (verify exact codes and enum values), or a date/threshold filter "
                        "is too strict. Reconsider the joins, filters, and literal values and "
                        "produce a corrected query that returns data. Only if you are confident "
                        "that 0 is genuinely the correct answer, return the same SQL again."
                    )
                    self._send_progress(
                        user_context,
                        f"🔁 Attempt {attempt + 1} returned 0 rows. Reconsidering query...",
                    )
                    continue

                # Successfully validated and verified!
                self._send_progress(user_context, "💾 Query validated and verified.")
                show_table = payload.get("show_table") if isinstance(payload.get("show_table"), bool) else True
                user_context["show_table"] = show_table

                return guarded.sql
            except Exception as e:
                feedback = f"Attempt {attempt + 1} failed: {e}"
                self._send_progress(user_context, f"❌ Attempt {attempt + 1} failed: {str(e)[:80]}. Retrying...")
                logger.warning(f"Fallback SQL repair loop attempt {attempt + 1} error: {e}")

        # If all retries failed, return default clarification
        return _clarification_response(user_context.get("language"))

    def _validate_templates(self) -> None:
        guard = SqlGuard(max_rows=self.settings.max_result_rows)
        for template in self.templates:
            guarded = guard.validate(template.sql)
            undeclared = set(guarded.relations) - set(template.allowed_tables)
            if undeclared:
                raise ValueError(
                    f"Template {template.id} references undeclared relation(s): "
                    f"{', '.join(sorted(undeclared))}."
                )

    def _normalize_question(self, question: str, language: str | None):
        try:
            return self.normalizer.normalize(question, language)
        except Exception:
            from .query_normalizer import PassthroughQueryNormalizer

            self.normalizer = PassthroughQueryNormalizer()
            return self.normalizer.normalize(question, language)


def _conversation_block(conversation_history: list[dict[str, Any]] | None) -> str:
    if not conversation_history:
        return ""
    lines = []
    for turn in conversation_history[-3:]:
        q = (turn.get("question") or "").strip()
        sql = (turn.get("sql") or "").strip()
        if not sql:
            continue
        lines.append(f'- User asked: "{q}"\n  SQL used:\n{sql}')
    if not lines:
        return ""
    history_text = "\n".join(lines)
    return f"""
### Conversation so far (most recent last):
{history_text}

IMPORTANT — follow-up handling: The CURRENT user question may be a SHORT FOLLOW-UP
that refines the previous request rather than a brand-new question. For example,
after "make a list of users" a next message of "phone" / "add phone number" /
"телефон" means: take the PREVIOUS SQL and add the phone-number column to it,
keeping the same rows/filters/ordering. When the current question is clearly a
refinement (adds/removes a column or field, changes a filter, sort, or limit, or
says "also"/"and ...", "тоже"/"ещё", "ham"), START FROM the previous SQL above and
modify it to satisfy the new request. If the current question is clearly a new,
unrelated request, ignore this history and build a fresh query.
"""


def _generation_prompt(
    question: str,
    schema_info: str,
    error_feedback: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
) -> str:
    base = f"""
You are a PostgreSQL Text-to-SQL agent for FinPulse, an analytics copilot over a
synthetic fintech / neobank database (schema `fin`).
Your task is to generate a read-only PostgreSQL SELECT or WITH statement to answer the user's question.

### Allowed Tables Schema:
{schema_info}
{_conversation_block(conversation_history)}

### Domain notes (how this data is modeled):
- `fin.transactions` is the core fact table. "Spend" / "transaction volume" = SUM(amount)
  for `direction = 'debit'` AND `status = 'completed'`. `is_fraud` (boolean) flags fraud;
  `channel` is one of pos/online/atm/transfer; `status` is completed/pending/failed/reversed.
- A transaction joins to `fin.accounts` (account_id), optionally `fin.cards` (card_id) and
  `fin.merchants` (merchant_id). A merchant's spend category is `fin.merchants.category_id` ->
  `fin.merchant_categories.name`.
- `fin.accounts.customer_id` -> `fin.customers.id`. Customer `segment` is retail/sme/premium;
  `fin.accounts.balance` is the current balance; `fin.cards.network` is visa/mastercard/amex.
- Loans: `fin.loans` (product personal/auto/mortgage/business, status active/paid/defaulted)
  with `fin.loan_payments` (status paid/late/missed/scheduled). Default rate = share of loans
  with status = 'defaulted'.
- Every main table has an `is_deleted boolean` — filter `is_deleted = false` for live rows.
- Time series: group by `date_trunc('month', created_at)` for monthly trends.

### Rules:
1. ONLY reference tables and columns defined in the schema above.
2. The query MUST be a single SELECT or WITH statement.
3. DO NOT use INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, TRUNCATE, or any modifying statements.
4. Ensure all schema references are prefixed with `fin.` (e.g., `fin.transactions`, `fin.customers`).
5. Choose an appropriate LIMIT dynamically based on the user question intent (e.g., limit monthly trend/chart queries to 24-60 rows, but allow larger lists/tables up to 1000-2000 rows). Do not request more than 2000 rows.
6. For monthly/period trends, return a readable label (e.g. to_char(date_trunc('month', created_at), 'YYYY-MM') AS month) and ORDER BY the period ascending.
7. Return a strict JSON response with the following keys:
   - "sql": "The raw SQL query string. DO NOT wrap in markdown formatting, just a plain string."
   - "title": "A short descriptive title in English for this analytics shortcut."
   - "description": "A description of what the query counts or fetches."
   - "category": "One of: transactions, customers, fraud, loans, cards, accounts, merchants, support"
   - "show_table": true|false (boolean flag indicating whether this is a structured dataset suitable for a table format; set to false for long text outputs)
   - "summary_hint": "A short hint explaining how to summarize the result."

User Question: {question}
"""
    if error_feedback:
        base += f"\n\n### Previous Attempt Error:\n{error_feedback}\n\nPlease fix the SQL query according to the error message above and try again."
    return base


def _clarification_prompt(
    question: str,
    history: list[dict[str, Any]],
    language: str | None,
    schema_hint: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
) -> str:
    lang_name = "Russian"
    if language == "en":
        lang_name = "English"
    elif language == "uz":
        lang_name = "Uzbek (match the script — Latin or Cyrillic — of the user's question)"

    history_text = "None yet."
    if history:
        lines = []
        for h in history:
            answers = ", ".join(h.get("answers") or [])
            lines.append(f"- Asked: {h.get('question')} -> User answered: {answers}")
        history_text = "\n".join(lines)

    schema_block = ""
    if schema_hint:
        schema_block = f"\n### Available data (tables/columns the analytics can cover):\n{schema_hint}\n"

    convo_block = ""
    prior = [t for t in (conversation_history or []) if (t.get("sql") or "").strip()]
    if prior:
        last_q = (prior[-1].get("question") or "").strip()
        convo_block = (
            f'\n### Previous question in this conversation: "{last_q}"\n'
            "If the user's new message is a SHORT FOLLOW-UP that refines this previous "
            "question — e.g. adds a column/field (\"phone\", \"add email\", \"телефон\"), "
            "or changes a filter, sort, or limit — then it IS answerable: set "
            "\"answerable\" to true and do NOT ask a clarifying question.\n"
        )

    return f"""
You are the intent-clarification step for FinPulse, a read-only fintech analytics
copilot. Users ask data questions about transactions, spend, customers, accounts,
cards, merchants, fraud, loans, and support tickets.
{schema_block}{convo_block}
A template match for the user's question was LOW CONFIDENCE, meaning the request may
be ambiguous. Your job: decide whether you can confidently turn this into a single
analytics query, or whether ONE more clarifying question would materially improve the
answer.

User's original question: "{question}"

Clarifying questions already answered this session:
{history_text}

Decision rules:
- Default to ASKING when the request is broad or generic. A request that names no
  specific metric, entity, time range, or grouping is ambiguous — do NOT guess a default.
  Examples that MUST get a clarifying question (answerable = false):
  "show statistics", "show me the data", "show trends", "give me a report",
  "статистика", "покажи статистику", "show analytics".
  For these, ask WHICH area/metric they want (e.g. transaction volume, fraud, customers,
  loans, cards, support tickets).
- Set "answerable" to true ONLY when the question already names a concrete metric or
  subject you can build one clear query for, OR when prior answers have made it specific.
- When genuinely unsure, prefer asking ONE question over guessing.
- Ask at most ONE concise question. Provide 2-4 short, mutually distinct answer options
  the user can pick from. Do not include an "Other" option — the UI adds a free-text field.
- Never ask about things outside the available analytics data.

CRITICAL: Write "question" and every "options" entry in {lang_name}.

Return STRICT JSON only, no markdown:
{{
  "answerable": true | false,
  "question": "the clarifying question (empty string if answerable is true)",
  "options": ["option 1", "option 2", "option 3"]
}}
"""


def _clarification_response(language: str | None) -> str:
    if language == "ru":
        return (
            "Я не нашёл достаточно точный утверждённый шаблон аналитики для этого вопроса. "
            "Пожалуйста, уточните вопрос про транзакции, мошенничество, клиентов, кредиты, карты или обращения."
        )
    return (
        "I could not find a confident approved analytics template for this question. "
        "Please ask more specifically about transactions, fraud, customers, loans, cards, or support tickets."
    )

