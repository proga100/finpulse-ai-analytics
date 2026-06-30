import json
import logging

logger = logging.getLogger("uvicorn.error")


async def write_audit_log(
    database: object,
    *,
    user_id: str | None,
    role: str,
    question: str,
    generated_sql: str | None,
    is_safe: bool,
    status: str,
    error_message: str | None = None,
    execution_time_ms: int | None = None,
    row_count: int | None = None,
) -> None:
    logger.info(
        "analytics_chat_audit %s",
        json.dumps(
            {
                "event": "analytics_chat_audit",
                "user_id": user_id,
                "role": role,
                "question": question,
                "generated_sql": generated_sql,
                "is_safe": is_safe,
                "status": status,
                "error_message": error_message,
                "execution_time_ms": execution_time_ms,
                "row_count": row_count,
            },
            default=str,
            ensure_ascii=False,
        ),
    )
