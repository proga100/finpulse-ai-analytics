import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal
from typing import Any

import asyncpg

from .config import Settings


class Database:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        self.pool = await asyncpg.create_pool(
            dsn=self.settings.database_url,
            min_size=1,
            max_size=5,
            command_timeout=self.settings.query_timeout_seconds,
            server_settings={
                "search_path": "uz,public",
                "statement_timeout": f"{self.settings.query_timeout_seconds * 1000}",
            },
        )

    async def close(self) -> None:
        if self.pool is not None:
            await self.pool.close()

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[asyncpg.Connection]:
        if self.pool is None:
            raise RuntimeError("Database pool has not been initialized.")
        async with self.pool.acquire() as connection:
            yield connection

    async def fetch(self, sql: str) -> tuple[list[str], list[dict[str, Any]], int]:
        start = time.perf_counter()
        async with self.acquire() as connection:
            async with connection.transaction(readonly=True):
                records = await connection.fetch(sql)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        columns = list(records[0].keys()) if records else []
        rows = [
            {key: _serialize_value(value) for key, value in dict(record).items()}
            for record in records
        ]
        return columns, rows, elapsed_ms


def _serialize_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value
