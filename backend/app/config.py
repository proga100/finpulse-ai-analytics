from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        populate_by_name=True,
    )

    app_name: str = "FinPulse AI Analytics"
    environment: str = "development"
    database_url: str = Field(
        default="postgresql://finpulse_ai_app:change_this_app_password@localhost:5432/finpulse",
        description="PostgreSQL connection string. Prefer a role limited to approved read-only tables.",
    )
    query_timeout_seconds: int = 10
    max_result_rows: int = 2000
    allow_sql_preview_roles: set[str] = {"ADMIN", "SUPER_ADMIN", "DEVELOPER"}
    analytics_api_token: str = "change_this_analytics_api_token"
    sql_agent_provider: str = Field(
        default="template",
        description="Use 'template' for approved SQL template routing.",
    )
    template_vector_store: str = "chroma"
    chroma_path: str = "/app/chromadb"
    embedding_provider: str = "gemini"
    gemini_api_key: str | None = None
    gemini_embedding_model: str = "gemini-embedding-001"
    gemini_embedding_dimensions: int = 768
    query_normalizer_provider: str = "gemini"
    query_normalizer_model: str = "gemini-2.5-flash-lite"
    query_normalizer_enabled: bool = True
    # Text-to-SQL fallback uses a light model first and only escalates to a
    # stronger (slower) model if the light attempts fail validation.
    sql_generation_model_fast: str = "gemini-2.5-flash"
    sql_generation_model_strong: str = "gemini-2.5-pro"
    sql_generation_max_attempts: int = 3
    sql_generation_fast_attempts: int = 2
    # Per-request HTTP timeout (ms) for SQL-gen / summary Gemini calls so a
    # transient 503/504 can't hang the request — generous enough for the strong model.
    gemini_request_timeout_ms: int = 30000
    template_collection_name: str = Field(
        default="finpulse_analytics_templates",
    )
    template_match_threshold: float = Field(
        default=0.75,
    )
    # When false (or per-request include_summary=false), the data table/chart is
    # returned without the extra natural-language summary LLM call.
    analytics_summary_enabled: bool = True
    clarification_enabled: bool = True
    clarification_max_rounds: int = 4
    clarification_model: str = "gemini-2.5-flash"
    # Hard cap on the intent-judge call; on timeout we skip clarification and
    # proceed to answer rather than leaving the user staring at a spinner.
    clarification_timeout_ms: int = 7000
    template_file: str = Field(
        default="app/templates/analytics_templates.json",
    )
    cors_origins: list[str] = ["http://localhost:3000"]

    # --- Public demo gate --------------------------------------------------
    # This is a portfolio demo on synthetic data. Each visitor (session id +
    # IP backstop) may ask a limited number of questions before a popup is
    # shown. Clarification round-trips do NOT count — only answered questions.
    demo_limit_enabled: bool = True
    demo_call_limit: int = 5
    # Rolling window after which a visitor's counter resets (seconds).
    demo_window_seconds: int = 86400


@lru_cache
def get_settings() -> Settings:
    return Settings()
