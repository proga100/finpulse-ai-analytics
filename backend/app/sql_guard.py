from dataclasses import dataclass
import re

from sqlglot import exp, parse_one
from sqlglot.errors import ParseError


class SqlGuardError(ValueError):
    pass


@dataclass(frozen=True)
class GuardedSql:
    sql: str
    relations: tuple[str, ...]


class SqlGuard:
    blocked_keywords = {
        "ALTER",
        "ANALYZE",
        "CALL",
        "COPY",
        "CREATE",
        "DELETE",
        "DO",
        "DROP",
        "EXECUTE",
        "GRANT",
        "INSERT",
        "RESET",
        "REVOKE",
        "SET",
        "TRUNCATE",
        "UPDATE",
        "VACUUM",
    }

    # Synthetic fintech / neobank demo schema. Only these read-only relations
    # may be referenced by any generated or template SQL.
    allowed_relations = {
        "fin.customers",
        "fin.accounts",
        "fin.cards",
        "fin.merchant_categories",
        "fin.merchants",
        "fin.transactions",
        "fin.loans",
        "fin.loan_payments",
        "fin.support_tickets",
    }

    def __init__(self, max_rows: int = 500) -> None:
        self.max_rows = max_rows

    def validate(self, sql: str) -> GuardedSql:
        normalized = self._normalize(sql)
        self._reject_multiple_statements(normalized)
        self._reject_blocked_keywords(normalized)

        try:
            parsed = parse_one(normalized, read="postgres")
        except ParseError as exc:
            raise SqlGuardError("Generated SQL is not valid PostgreSQL.") from exc

        if not isinstance(parsed, (exp.Select, exp.With)):
            raise SqlGuardError("Only SELECT or WITH queries are allowed.")

        relations = self._extract_relations(parsed)
        if not relations:
            raise SqlGuardError("Query must read from an allowed table.")

        unknown = sorted(set(relations) - self.allowed_relations)
        if unknown:
            raise SqlGuardError(f"Query references non-allowed relation(s): {', '.join(unknown)}.")

        limited = self._ensure_limit(normalized)
        return GuardedSql(sql=limited, relations=tuple(sorted(set(relations))))

    def _normalize(self, sql: str) -> str:
        cleaned = sql.strip()
        if not cleaned:
            raise SqlGuardError("Generated SQL is empty.")
        return cleaned.rstrip(";").strip()

    def _reject_multiple_statements(self, sql: str) -> None:
        if ";" in sql:
            raise SqlGuardError("Multiple SQL statements are not allowed.")

    def _reject_blocked_keywords(self, sql: str) -> None:
        tokens = set(re.findall(r"\b[A-Z_]+\b", sql.upper()))
        blocked = sorted(tokens & self.blocked_keywords)
        if blocked:
            raise SqlGuardError(f"Blocked SQL keyword(s): {', '.join(blocked)}.")

    def _extract_relations(self, parsed: exp.Expression) -> list[str]:
        cte_names = {cte.alias for cte in parsed.find_all(exp.CTE) if cte.alias}
        relations: list[str] = []
        for table in parsed.find_all(exp.Table):
            name = table.name
            if name in cte_names:
                continue
            schema = table.db
            relations.append(f"{schema}.{name}" if schema else name)
        return relations

    def _ensure_limit(self, sql: str) -> str:
        if re.search(r"\bLIMIT\s+\d+\b", sql, flags=re.IGNORECASE):
            return sql
        return f"{sql} LIMIT {self.max_rows}"
