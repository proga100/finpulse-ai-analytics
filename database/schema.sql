-- FinPulse — synthetic fintech / neobank schema (all data is fake/demo).
-- Loaded first at container init; the seed (INSERTs) and the read-only role
-- script run after this. Mirrors the read-only, soft-delete conventions of the
-- production system it is modeled on, without any real or confidential data.

CREATE SCHEMA IF NOT EXISTS fin;

-- Customers -----------------------------------------------------------------
CREATE TABLE fin.customers (
    id          BIGINT PRIMARY KEY,
    full_name   TEXT        NOT NULL,
    email       TEXT        NOT NULL,
    phone       TEXT,
    country     TEXT        NOT NULL,
    city        TEXT        NOT NULL,
    segment     TEXT        NOT NULL CHECK (segment IN ('retail', 'sme', 'premium')),
    kyc_status  TEXT        NOT NULL CHECK (kyc_status IN ('verified', 'pending', 'rejected')),
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL,
    is_deleted  BOOLEAN     NOT NULL DEFAULT false
);

-- Accounts ------------------------------------------------------------------
CREATE TABLE fin.accounts (
    id           BIGINT PRIMARY KEY,
    customer_id  BIGINT      NOT NULL REFERENCES fin.customers (id),
    account_type TEXT        NOT NULL CHECK (account_type IN ('checking', 'savings', 'credit')),
    currency     TEXT        NOT NULL CHECK (currency IN ('USD', 'EUR', 'GBP')),
    balance      NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status       TEXT        NOT NULL CHECK (status IN ('active', 'frozen', 'closed')),
    opened_at    TIMESTAMPTZ NOT NULL,
    is_deleted   BOOLEAN     NOT NULL DEFAULT false
);

-- Merchant categories -------------------------------------------------------
CREATE TABLE fin.merchant_categories (
    id   INT PRIMARY KEY,
    name TEXT NOT NULL
);

-- Merchants -----------------------------------------------------------------
CREATE TABLE fin.merchants (
    id          BIGINT PRIMARY KEY,
    name        TEXT   NOT NULL,
    category_id INT    NOT NULL REFERENCES fin.merchant_categories (id),
    country     TEXT   NOT NULL,
    is_deleted  BOOLEAN NOT NULL DEFAULT false
);

-- Cards ---------------------------------------------------------------------
CREATE TABLE fin.cards (
    id         BIGINT PRIMARY KEY,
    account_id BIGINT      NOT NULL REFERENCES fin.accounts (id),
    card_type  TEXT        NOT NULL CHECK (card_type IN ('debit', 'credit', 'virtual')),
    network    TEXT        NOT NULL CHECK (network IN ('visa', 'mastercard', 'amex')),
    status     TEXT        NOT NULL CHECK (status IN ('active', 'blocked', 'expired')),
    issued_at  TIMESTAMPTZ NOT NULL,
    is_deleted BOOLEAN     NOT NULL DEFAULT false
);

-- Transactions (core fact table) --------------------------------------------
CREATE TABLE fin.transactions (
    id          BIGINT PRIMARY KEY,
    account_id  BIGINT      NOT NULL REFERENCES fin.accounts (id),
    card_id     BIGINT      REFERENCES fin.cards (id),
    merchant_id BIGINT      REFERENCES fin.merchants (id),
    amount      NUMERIC(12, 2) NOT NULL,
    currency    TEXT        NOT NULL CHECK (currency IN ('USD', 'EUR', 'GBP')),
    direction   TEXT        NOT NULL CHECK (direction IN ('debit', 'credit')),
    channel     TEXT        NOT NULL CHECK (channel IN ('pos', 'online', 'atm', 'transfer')),
    status      TEXT        NOT NULL CHECK (status IN ('completed', 'pending', 'failed', 'reversed')),
    is_fraud    BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL,
    is_deleted  BOOLEAN     NOT NULL DEFAULT false
);

-- Loans ---------------------------------------------------------------------
CREATE TABLE fin.loans (
    id            BIGINT PRIMARY KEY,
    customer_id   BIGINT      NOT NULL REFERENCES fin.customers (id),
    product       TEXT        NOT NULL CHECK (product IN ('personal', 'auto', 'mortgage', 'business')),
    principal     NUMERIC(14, 2) NOT NULL,
    interest_rate NUMERIC(5, 2)  NOT NULL,
    term_months   INT         NOT NULL,
    status        TEXT        NOT NULL CHECK (status IN ('active', 'paid', 'defaulted')),
    disbursed_at  TIMESTAMPTZ NOT NULL,
    is_deleted    BOOLEAN     NOT NULL DEFAULT false
);

-- Loan payments -------------------------------------------------------------
CREATE TABLE fin.loan_payments (
    id         BIGINT PRIMARY KEY,
    loan_id    BIGINT      NOT NULL REFERENCES fin.loans (id),
    amount     NUMERIC(12, 2) NOT NULL,
    due_date   DATE        NOT NULL,
    paid_date  DATE,
    status     TEXT        NOT NULL CHECK (status IN ('paid', 'late', 'missed', 'scheduled')),
    is_deleted BOOLEAN     NOT NULL DEFAULT false
);

-- Support tickets -----------------------------------------------------------
CREATE TABLE fin.support_tickets (
    id          BIGINT PRIMARY KEY,
    customer_id BIGINT      NOT NULL REFERENCES fin.customers (id),
    category    TEXT        NOT NULL CHECK (category IN ('card', 'payments', 'account', 'loan', 'app', 'fraud')),
    priority    TEXT        NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status      TEXT        NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at  TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    is_deleted  BOOLEAN     NOT NULL DEFAULT false
);

-- Indexes that matter for the demo queries (time series + joins) ------------
CREATE INDEX idx_tx_created_at   ON fin.transactions (created_at);
CREATE INDEX idx_tx_account      ON fin.transactions (account_id);
CREATE INDEX idx_tx_merchant     ON fin.transactions (merchant_id);
CREATE INDEX idx_tx_status       ON fin.transactions (status);
CREATE INDEX idx_accounts_cust   ON fin.accounts (customer_id);
CREATE INDEX idx_cards_account   ON fin.cards (account_id);
CREATE INDEX idx_customers_made  ON fin.customers (created_at);
CREATE INDEX idx_loans_customer  ON fin.loans (customer_id);
CREATE INDEX idx_payments_loan   ON fin.loan_payments (loan_id);
CREATE INDEX idx_tickets_cust    ON fin.support_tickets (customer_id);
