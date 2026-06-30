from typing import Any, Literal

from pydantic import BaseModel, Field


class ClarificationAnswer(BaseModel):
    """A clarifying question the user already answered in a prior round."""

    question: str = Field(max_length=500)
    answers: list[str] = Field(default_factory=list)


class ConversationTurn(BaseModel):
    """A previously answered question + the SQL that produced its result.

    Sent by the client so a follow-up message (e.g. just "phone") can be
    interpreted as a refinement of the prior query instead of a fresh request.
    """

    question: str = Field(default="", max_length=2000)
    sql: str | None = Field(default=None, max_length=20000)


class AnalyticsChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    language: str = Field(default="ru", max_length=16)
    user_id: str | None = None
    role: str = Field(default="MANAGER", max_length=64)
    clarification_round: int = Field(default=0, ge=0, le=4)
    clarification_history: list[ClarificationAnswer] = Field(default_factory=list)
    # Recent prior turns (question + generated SQL) for follow-up context.
    conversation_history: list[ConversationTurn] = Field(default_factory=list, max_length=8)
    skip_clarification: bool = False
    # None -> use server default (analytics_summary_enabled); explicit bool overrides.
    include_summary: bool | None = None
    # When set, re-execute this exact (previously generated) SQL instead of
    # generating a new query — used to replay a saved/"ready to use" prompt.
    replay_sql: str | None = Field(default=None, max_length=20000)


class ClarificationOption(BaseModel):
    id: str
    label: str


class ClarificationQuestion(BaseModel):
    question: str
    options: list[ClarificationOption] = Field(default_factory=list)
    allow_multi: bool = True
    allow_other: bool = True
    round: int = 0
    max_rounds: int = 4


class ChartSuggestion(BaseModel):
    type: Literal["none", "bar", "line", "pie"] = "none"
    x: str | None = None
    y: str | None = None


class AnalyticsMetadata(BaseModel):
    execution_time_ms: int
    row_count: int
    safe: bool


class AnalyticsChatResponse(BaseModel):
    summary: str
    sql: str | None
    columns: list[str]
    rows: list[dict[str, Any]]
    chart: ChartSuggestion
    show_table: bool = True
    metadata: AnalyticsMetadata
    # For follow-up turns: a self-contained rewrite of the question that
    # reproduces this exact result on its own (no conversation context needed).
    standalone_question: str | None = None


class ReportFile(BaseModel):
    """A generated report file uploaded to object storage."""

    format: Literal["xlsx", "csv", "pdf", "docx", "json", "txt", "html"]
    filename: str
    url: str
    content_type: str
    row_count: int


class ErrorResponse(BaseModel):
    detail: str
