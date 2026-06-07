-- Link pipeline clients (prospects) directly to a QuickBooks customer so
-- the "Value" column shows their lifetime payments — works even though
-- billing happens directly in QBO (no in-app invoicing to create the
-- link). Set via the "Link QuickBooks customer" picker on the prospect
-- detail page; the cents value is cached by qbo-value-sync.
alter table prospects
  add column if not exists qbo_customer_id text,
  add column if not exists qbo_customer_name text,
  add column if not exists qbo_realm_id text,
  add column if not exists qbo_lifetime_payments_cents bigint,
  add column if not exists qbo_value_synced_at timestamptz;
