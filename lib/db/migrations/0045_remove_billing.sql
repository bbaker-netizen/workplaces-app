-- Remove in-app billing: invoices, Stripe, and subscription tracking.
-- Billing now happens directly in QuickBooks; The Builder only READS
-- QBO payments (see qbo-value-sync). This drops the creation-side data
-- model. CASCADE clears the internal FK between subscription_assets and
-- subscription_products.
drop table if exists invoices cascade;
drop table if exists subscription_assets cascade;
drop table if exists subscription_products cascade;

-- Enums only used by the dropped tables.
drop type if exists invoice_status;
drop type if exists subscription_asset_model;
drop type if exists subscription_transfer_status;

-- Stripe linkage on engagements is no longer used.
alter table engagements drop column if exists stripe_customer_id;
alter table engagements drop column if exists stripe_subscription_id;
