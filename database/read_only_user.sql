-- Creates the read-only application role used by the FinPulse backend.
-- Runs at container init AFTER the schema + seed, as the privileged Postgres
-- superuser. The backend connects as `finpulse_ai_app`, which can only SELECT
-- from the synthetic `fin` schema and runs every statement read-only with a
-- 10s timeout. Replace the password before any non-demo use.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finpulse_ai_app') THEN
    EXECUTE 'CREATE USER finpulse_ai_app WITH PASSWORD ''change_this_app_password''';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE finpulse TO finpulse_ai_app;

-- No access to the public schema; only the curated analytics schema.
REVOKE ALL ON SCHEMA public FROM finpulse_ai_app;
GRANT USAGE ON SCHEMA fin TO finpulse_ai_app;

GRANT SELECT ON ALL TABLES IN SCHEMA fin TO finpulse_ai_app;
-- Any future tables added to the schema are read-only for this role too.
ALTER DEFAULT PRIVILEGES IN SCHEMA fin GRANT SELECT ON TABLES TO finpulse_ai_app;

-- Defense in depth: read-only transactions and a hard statement timeout.
ALTER ROLE finpulse_ai_app SET search_path = fin, public;
ALTER ROLE finpulse_ai_app SET statement_timeout = '10s';
ALTER ROLE finpulse_ai_app SET default_transaction_read_only = on;
