-- Cache of lifetime payments received per client from QuickBooks,
-- refreshed by the nightly qbo-value-sync job (and the manual "sync now"
-- button on the QuickBooks settings page). Drives the Pipeline "Value"
-- column for converted clients; prospects without a QBO customer fall
-- back to their manually-entered expected_value_cents.
alter table engagements
  add column if not exists qbo_lifetime_payments_cents bigint,
  add column if not exists qbo_value_synced_at timestamptz;
