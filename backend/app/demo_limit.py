"""In-process demo rate limiter for the public portfolio demo.

This is a portfolio demo running on synthetic data, so a visitor may ask only a
handful of questions before a "this is a demo" popup is shown. The browser keeps
its own counter for display, but THIS module is the source of truth: it is keyed
by a per-browser session id (sent as the ``X-Demo-Session`` header) with the
client IP as a backstop, so clearing localStorage does not grant a fresh quota.

Kept deliberately simple — an in-memory dict guarded by a lock. No Redis: the
demo runs as a single container, and a counter that resets on restart is fine.
Only *answered* questions are recorded; clarification round-trips are not.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass

# Hard cap on tracked identities so a flood of unique sessions/IPs can't grow
# memory without bound. When exceeded we drop the least-recently-seen entries.
_MAX_IDENTITIES = 50_000


@dataclass(frozen=True)
class DemoStatus:
    used: int
    remaining: int
    limit: int
    blocked: bool


class DemoLimiter:
    def __init__(self, *, limit: int, window_seconds: int) -> None:
        self.limit = max(1, limit)
        self.window_seconds = max(1, window_seconds)
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _keys(self, session_id: str | None, ip: str | None) -> list[str]:
        keys: list[str] = []
        if session_id:
            keys.append(f"sid:{session_id}")
        if ip:
            keys.append(f"ip:{ip}")
        # No identity at all (shouldn't happen behind nginx) -> a single shared
        # bucket so the demo still can't be hammered anonymously.
        return keys or ["anon:shared"]

    def _used_for(self, key: str, now: float) -> int:
        stamps = self._hits.get(key)
        if not stamps:
            return 0
        cutoff = now - self.window_seconds
        fresh = [t for t in stamps if t >= cutoff]
        if fresh:
            self._hits[key] = fresh
        else:
            self._hits.pop(key, None)
        return len(fresh)

    def status(self, session_id: str | None, ip: str | None) -> DemoStatus:
        now = time.time()
        with self._lock:
            used = max((self._used_for(k, now) for k in self._keys(session_id, ip)), default=0)
        used = min(used, self.limit)
        remaining = max(0, self.limit - used)
        return DemoStatus(used=used, remaining=remaining, limit=self.limit, blocked=remaining <= 0)

    def record(self, session_id: str | None, ip: str | None) -> DemoStatus:
        """Record one answered question against every identity and return status."""
        now = time.time()
        with self._lock:
            keys = self._keys(session_id, ip)
            for key in keys:
                self._hits.setdefault(key, []).append(now)
            used = max((self._used_for(k, now) for k in keys), default=0)
            self._evict_if_needed()
        used = min(used, self.limit)
        remaining = max(0, self.limit - used)
        return DemoStatus(used=used, remaining=remaining, limit=self.limit, blocked=remaining <= 0)

    def _evict_if_needed(self) -> None:
        if len(self._hits) <= _MAX_IDENTITIES:
            return
        # Drop the entries whose most-recent hit is oldest.
        ordered = sorted(self._hits.items(), key=lambda kv: max(kv[1]) if kv[1] else 0)
        for key, _ in ordered[: len(self._hits) - _MAX_IDENTITIES]:
            self._hits.pop(key, None)
