from typing import Any, Protocol

from .schemas import ClarificationQuestion


class AnalyticsSqlAgent(Protocol):
    async def initialize(self) -> None:
        ...

    async def generate_sql(self, question: str, user_context: dict[str, Any]) -> str:
        ...

    async def assess_clarification(
        self,
        question: str,
        user_context: dict[str, Any],
        history: list[dict[str, Any]],
        round: int,
    ) -> ClarificationQuestion | None:
        ...

    async def summarize_result(
        self,
        question: str,
        rows: list[dict[str, Any]],
        columns: list[str],
    ) -> str:
        ...

    async def rewrite_standalone_question(
        self,
        question: str,
        conversation_history: list[dict[str, Any]],
        language: str | None,
        generated_sql: str | None = None,
    ) -> str:
        ...
