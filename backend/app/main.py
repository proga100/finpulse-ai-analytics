import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import json

from .audit import write_audit_log
from .auth import require_api_token
from .chart_suggester import suggest_chart
from .config import get_settings
from .db import Database
from .demo_limit import DemoLimiter
from .schemas import (
    AnalyticsChatRequest,
    AnalyticsChatResponse,
    AnalyticsMetadata,
    ChartSuggestion,
    ClarificationQuestion,
)
from .sql_guard import SqlGuard, SqlGuardError
from .sql_agent_factory import build_sql_agent

logger = logging.getLogger(__name__)

settings = get_settings()
database = Database(settings)
sql_guard = SqlGuard(max_rows=settings.max_result_rows)
sql_agent = build_sql_agent(settings.sql_agent_provider, settings)
demo_limiter = DemoLimiter(
    limit=settings.demo_call_limit,
    window_seconds=settings.demo_window_seconds,
)


def client_ip(http_request: Request) -> str | None:
    """Best-effort client IP. Behind nginx the real IP is the first X-Forwarded-For hop."""
    forwarded = http_request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return http_request.client.host if http_request.client else None


def is_greeting_or_simple_chat(question: str) -> str | None:
    q = question.strip().lower().rstrip("!?.")

    greetings_en = {"hi", "hello", "hey", "good morning", "good afternoon", "good evening", "howdy"}
    greetings_ru = {"привет", "здравствуй", "здравствуйте", "доброе утро", "добрый день", "добрый вечер", "хай"}

    chat_phrases_en = {"how are you", "how are you doing", "what can you do", "help", "who are you", "what is this"}
    chat_phrases_ru = {"как дела", "как поживаешь", "что ты умеешь", "помощь", "кто ты", "что это", "помоги"}

    if q in greetings_en or q in chat_phrases_en:
        return "en"
    if q in greetings_ru or q in chat_phrases_ru:
        return "ru"

    return None


def get_greeting_response(lang: str) -> str:
    if lang == "ru":
        return (
            "Привет! Я FinPulse — AI-ассистент аналитики по финтех-данным. Чем помочь?\n\n"
            "Вы можете спросить меня о:\n"
            "- Объёме транзакций по месяцам\n"
            "- Топе категорий трат\n"
            "- Доле мошеннических операций по каналам\n"
            "- Новых клиентах по месяцам\n"
            "- Среднем балансе по сегментам\n"
            "- Уровне дефолтов по кредитным продуктам\n\n"
            "Все данные синтетические (демо)."
        )
    return (
        "Hi! I'm FinPulse — an AI analytics copilot for a fintech database. Ask me anything.\n\n"
        "For example:\n"
        "- Total transaction volume by month\n"
        "- Top merchant categories by spend\n"
        "- Fraud rate by channel\n"
        "- New customers per month\n"
        "- Average account balance by customer segment\n"
        "- Loan default rate by product\n\n"
        "All data is synthetic (demo)."
    )


def get_error_response(lang: str, exc: Exception) -> str:
    if lang == "ru":
        return f"Извините, сервис аналитики временно недоступен. Попробуйте позже. (Ошибка: {exc})"
    return f"Sorry, the analytics service is temporarily unavailable. Please try again later. (Error: {exc})"


def compose_effective_question(request: AnalyticsChatRequest) -> str:
    """Fold prior clarification answers into the question for SQL generation."""
    if not request.clarification_history:
        return request.question
    parts = [request.question]
    for item in request.clarification_history:
        answers = ", ".join(item.answers)
        if answers:
            parts.append(f"{item.question}: {answers}")
    return " | ".join(parts)


async def build_chat_response(
    request: AnalyticsChatRequest,
    summary: str,
    database: Database,
    *,
    status: str = "chat_response",
    generated_sql: str | None = None,
    error_message: str | None = None,
) -> AnalyticsChatResponse:
    await write_audit_log(
        database,
        user_id=request.user_id,
        role=request.role,
        question=request.question,
        generated_sql=generated_sql,
        is_safe=True,
        status=status,
        error_message=error_message,
        execution_time_ms=0,
        row_count=0,
    )
    return AnalyticsChatResponse(
        summary=summary,
        sql=None,
        columns=[],
        rows=[],
        chart=ChartSuggestion(type="none", x=None, y=None),
        metadata=AnalyticsMetadata(
            execution_time_ms=0,
            row_count=0,
            safe=True,
        ),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    await sql_agent.initialize()
    await database.connect()
    yield
    await database.close()


API_DESCRIPTION = """
**FinPulse** — an AI analytics copilot for a fintech / neobank database.

Ask a question in plain English; the agent matches an approved SQL template (or,
as a fallback, generates a guarded read-only `SELECT` via Gemini), runs it against
a synthetic Postgres dataset, and streams back a table, a chart suggestion, and an
AI-written summary over Server-Sent Events.

This is a public **portfolio demo on fully synthetic data**, with a per-session
question limit.
"""

OPENAPI_TAGS = [
    {"name": "system", "description": "Health and operational endpoints."},
]

app = FastAPI(
    title="FinPulse AI — Analytics API",
    description=API_DESCRIPTION,
    version="1.0.0",
    openapi_tags=OPENAPI_TAGS,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(
    "/health",
    tags=["system"],
    summary="Health check",
    description="Liveness probe. Returns `{\"status\": \"ok\"}` when the service is up.",
)
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/api/admin/analytics-chat",
    dependencies=[Depends(require_api_token)],
    include_in_schema=False,
)
async def analytics_chat(request: AnalyticsChatRequest, http_request: Request):
    session_id = http_request.headers.get("x-demo-session")
    ip = client_ip(http_request)

    async def event_generator():
        event_queue: asyncio.Queue = asyncio.Queue()

        def emit(event: dict):
            event_queue.put_nowait(event)

        def push_progress(msg: str):
            emit({"event": "progress", "message": msg})

        def emit_result(response: AnalyticsChatResponse, *, summary_pending: bool = False):
            emit(
                {
                    "event": "result",
                    "data": jsonable_encoder(response),
                    "summary_pending": summary_pending,
                }
            )

        def emit_clarification(clarification: ClarificationQuestion):
            emit({"event": "clarification", "data": jsonable_encoder(clarification)})

        def emit_summary(summary: str):
            emit({"event": "summary", "data": {"summary": summary}})

        def emit_limit_reached(st):
            emit(
                {
                    "event": "limit_reached",
                    "data": {"used": st.used, "limit": st.limit, "remaining": 0},
                }
            )

        def emit_demo_status(st):
            emit(
                {
                    "event": "demo_status",
                    "data": {"used": st.used, "limit": st.limit, "remaining": st.remaining},
                }
            )

        def count_question():
            """Record one answered question (only called from terminal answer paths)."""
            if settings.demo_limit_enabled:
                st = demo_limiter.record(session_id, ip)
                emit_demo_status(st)

        want_summary = (
            request.include_summary
            if request.include_summary is not None
            else settings.analytics_summary_enabled
        )

        async def execute_and_stream(
            guarded_sql: str,
            show_table_hint: bool = True,
            standalone_task: asyncio.Task | None = None,
        ):
            """Run a validated SQL statement, stream the data, then the summary."""
            push_progress("🔌 Fetching query results from database...")
            columns, rows, elapsed_ms = await database.fetch(guarded_sql)

            await write_audit_log(
                database,
                user_id=request.user_id,
                role=request.role,
                question=request.question,
                generated_sql=guarded_sql,
                is_safe=True,
                status="success",
                execution_time_ms=elapsed_ms,
                row_count=len(rows),
            )

            show_sql = request.role in settings.allow_sql_preview_roles

            # Heuristic: disable table if any column name suggests long text/content
            # or if values are long.
            show_table = show_table_hint
            if show_table:
                long_text_cols = {"text", "message", "content", "body", "description"}
                has_long_text_col = any(c.lower() in long_text_cols for c in columns)
                has_long_value = False
                for row in rows[:5]:
                    for val in row.values():
                        if isinstance(val, str) and len(val) > 100:
                            has_long_value = True
                            break
                if has_long_text_col or has_long_value:
                    show_table = False

            standalone_question = None
            if standalone_task is not None:
                try:
                    standalone_question = await standalone_task
                except Exception:
                    logger.exception("Standalone question rewrite failed.")
                    standalone_question = None

            emit_result(
                AnalyticsChatResponse(
                    summary="",
                    sql=guarded_sql if show_sql else None,
                    columns=columns,
                    rows=rows,
                    chart=suggest_chart(rows, columns),
                    show_table=show_table,
                    metadata=AnalyticsMetadata(
                        execution_time_ms=elapsed_ms,
                        row_count=len(rows),
                        safe=True,
                    ),
                    standalone_question=standalone_question,
                ),
                summary_pending=want_summary and len(rows) > 0,
            )

            if want_summary and rows:
                push_progress("📊 Summarizing query results...")
                try:
                    summary = await sql_agent.summarize_result(request.question, rows, columns, request.language)
                except Exception:
                    logger.exception("SQL agent failed to summarize result.")
                    summary = f"Returned {len(rows)} analytics row(s) for query: '{request.question}'"
                emit_summary(summary)

        async def run_query():
            generated_sql = None

            # 0. Demo gate (source of truth): block once the per-visitor quota is
            # spent. Clarification round-trips never reach the recording path, so
            # they don't burn the quota.
            if settings.demo_limit_enabled:
                st = demo_limiter.status(session_id, ip)
                if st.blocked:
                    emit_limit_reached(st)
                    return

            try:
                # 1. Replay path: re-execute a previously generated SQL exactly.
                if request.replay_sql:
                    generated_sql = request.replay_sql
                    guarded = sql_guard.validate(request.replay_sql)
                    await execute_and_stream(guarded.sql)
                    count_question()
                    return

                # 2. Local Greeting / Simple Chat check (no LLM, does not count).
                detected_lang = is_greeting_or_simple_chat(request.question)
                if detected_lang or request.question.strip().lower() in {"test", "ok", "ок", "хорошо"}:
                    lang = request.language or detected_lang or "en"
                    summary = get_greeting_response(lang)
                    emit_result(await build_chat_response(request, summary, database))
                    return

                user_context = {
                    "language": request.language,
                    "role": request.role,
                    "user_id": request.user_id,
                    "database": database,
                    "on_progress": push_progress,
                    "conversation_history": [
                        item.model_dump() for item in request.conversation_history if item.sql
                    ],
                }

                # 3. Clarification gate (does not count toward the demo quota).
                if not request.skip_clarification:
                    try:
                        clarification = await sql_agent.assess_clarification(
                            request.question,
                            user_context,
                            [item.model_dump() for item in request.clarification_history],
                            request.clarification_round,
                        )
                    except Exception:
                        logger.exception("Clarification assessment failed; proceeding without it.")
                        clarification = None
                    if clarification is not None:
                        await write_audit_log(
                            database,
                            user_id=request.user_id,
                            role=request.role,
                            question=request.question,
                            generated_sql=None,
                            is_safe=True,
                            status="clarification",
                            execution_time_ms=0,
                            row_count=0,
                        )
                        emit_clarification(clarification)
                        return

                effective_question = compose_effective_question(request)

                # 4. Generate SQL via the agent.
                try:
                    generated_sql = await sql_agent.generate_sql(
                        effective_question,
                        user_context,
                    )
                except Exception as exc:
                    logger.exception("SQL agent failed to generate SQL.")
                    summary = get_error_response(request.language or "en", exc)
                    emit_result(await build_chat_response(request, summary, database, status="error", error_message=str(exc)))
                    return

                # Conversational text (not a query) — still an answered turn.
                cleaned = (generated_sql or "").strip().upper()
                if not (cleaned.startswith("SELECT") or cleaned.startswith("WITH")):
                    emit_result(await build_chat_response(request, generated_sql or "No response generated.", database, generated_sql=generated_sql))
                    count_question()
                    return

                # 5. Guard and execute (stream data, then summary).
                guarded = sql_guard.validate(generated_sql)
                generated_sql = guarded.sql

                standalone_task = None
                if request.conversation_history:
                    standalone_task = asyncio.create_task(
                        sql_agent.rewrite_standalone_question(
                            request.question,
                            user_context.get("conversation_history") or [],
                            request.language,
                            guarded.sql,
                        )
                    )

                await execute_and_stream(
                    guarded.sql,
                    user_context.get("show_table", True),
                    standalone_task=standalone_task,
                )
                count_question()
            except SqlGuardError as exc:
                await write_audit_log(
                    database,
                    user_id=request.user_id,
                    role=request.role,
                    question=request.question,
                    generated_sql=generated_sql,
                    is_safe=False,
                    status="blocked",
                    error_message=str(exc),
                )
                emit_result(
                    AnalyticsChatResponse(
                        summary=f"Safety Block: {exc}",
                        sql=None,
                        columns=[],
                        rows=[],
                        chart=ChartSuggestion(type="none", x=None, y=None),
                        metadata=AnalyticsMetadata(execution_time_ms=0, row_count=0, safe=False),
                    )
                )
                count_question()
            except Exception as exc:
                logger.exception("Unexpected error in query runner.")
                emit_result(
                    AnalyticsChatResponse(
                        summary=f"Error: {exc}",
                        sql=None,
                        columns=[],
                        rows=[],
                        chart=ChartSuggestion(type="none", x=None, y=None),
                        metadata=AnalyticsMetadata(execution_time_ms=0, row_count=0, safe=False),
                    )
                )

        query_task = asyncio.create_task(run_query())

        while not query_task.done() or not event_queue.empty():
            try:
                evt = await asyncio.wait_for(event_queue.get(), timeout=0.1)
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
            except asyncio.TimeoutError:
                pass

        await query_task

    return StreamingResponse(event_generator(), media_type="text/event-stream")
