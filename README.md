# FinPulse — AI analytics copilot for fintech

> **Ask a fintech database anything in plain English.** Natural language → safe SQL → tables, charts, and an AI summary.

FinPulse is a **portfolio demo** of a production-style "chat with your data" copilot, running on a
**fully synthetic neobank dataset** (customers, accounts, cards, transactions, merchants, loans,
support tickets). Type a question; it gets answered with a chart, a data table, the generated SQL,
and a written summary — streamed live.

🔗 **Live demo:** [finpulse.flance.info](https://finpulse.flance.info) · 🧪 all data is synthetic · capped at 5 questions per visitor.

![status](https://img.shields.io/badge/data-synthetic-7c6cf5) ![license](https://img.shields.io/badge/license-MIT-2dd4bf)

---

## What it does

Type something like:

- *"Show transaction volume by month"* → line chart + summary
- *"Fraud rate by channel"* → bar chart
- *"Loan default rate by product"* → bar chart
- *"Top 10 customers by spend"* → ranked table
- *"What is the total transaction volume?"* → KPI

…and FinPulse answers in seconds.

## How it works (the interesting part)

A layered, **safety-first** natural-language-to-SQL pipeline:

```
question
  → normalize (Gemini: clean up, detect intent)
  → match an approved SQL template (ChromaDB vector search)        ← preferred, deterministic
  → (if unsure) ask ONE clarifying question
  → (if no template) generate SQL with Gemini  ← fallback
  → SqlGuard: SELECT/WITH only · schema allowlist · auto-LIMIT · read-only txn
  → run on Postgres (read-only role, 10s statement timeout)
  → stream table + chart + AI summary (Server-Sent Events)
```

The model **never** gets write access. Every query is validated by `SqlGuard`
([backend/app/sql_guard.py](backend/app/sql_guard.py)) and executed by a read-only Postgres role
([database/read_only_user.sql](database/read_only_user.sql)) restricted to the `fin` schema.

## Tech stack

- **Backend:** FastAPI · PostgreSQL 18 · ChromaDB (template vectors) · Google Gemini
- **Frontend:** Next.js 15 · React 19 · Tailwind CSS · Recharts · TanStack Table
- **Infra:** Docker Compose · nginx

## Quick start

```bash
git clone https://github.com/proga100/finpulse-ai-analytics.git && cd finpulse-ai-analytics
cp .env.example .env          # then set GEMINI_API_KEY=...
docker compose up --build
# open http://localhost:3000
```

The synthetic dataset (`database/finpulse_seed.sql`) is committed and loaded automatically on first
boot. To regenerate it (or change its size):

```bash
python3 database/seed.py                       # default volumes
FINPULSE_TRANSACTIONS=120000 python3 database/seed.py   # bigger
```

No third-party Python deps are needed to generate data — `seed.py` is standard-library only.

## The demo gate

This is a public demo, so each visitor may ask **5 questions** before a popup appears. The limit is
enforced **server-side** (`backend/app/demo_limit.py`) by session id with an IP backstop — clearing
browser storage does not grant a fresh quota. Clarification round-trips don't count against it.
Tune via `DEMO_CALL_LIMIT` / `DEMO_LIMIT_ENABLED` in `.env`.

## Project layout

```
backend/      FastAPI app, the SQL agent, SqlGuard, demo limiter, templates
database/     schema.sql · seed.py (synthetic data generator) · read_only_user.sql
frontend/     Next.js chat UI (hero, streaming answers, charts, demo modal)
deploy/       nginx vhost for finpulse.flance.info
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the VPS + Docker Compose + nginx runbook.

## Disclaimer

All data is **synthetic and randomly generated** for demonstration. It does not represent any real
person, company, or institution.

---

Built by [betterfuture.uz](https://betterfuture.uz). Licensed under MIT.
