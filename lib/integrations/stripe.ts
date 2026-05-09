/**
 * Stripe wrapper.
 *
 * Phase 2.2. Subscription billing for the Model C retainer + ad-hoc
 * invoices. Two surfaces:
 *
 *   1. Webhook handler (`/api/webhooks/stripe`) mirrors invoice
 *      lifecycle events into the `invoices` table.
 *   2. Server action to redirect a client_lead to Stripe's hosted
 *      Customer Portal so they can update payment method, cancel,
 *      view past invoices.
 *
 * Engagements link to Stripe via two columns we'll add in a future
 * migration: `engagements.stripe_customer_id` and
 * `engagements.stripe_subscription_id`. For Phase 2.2 we read the
 * Stripe customer from the invoice payload (`customer` field) and
 * map back to engagement via metadata: every invoice we issue must
 * carry `metadata.engagement_id`.
 */

import Stripe from "stripe";

let cachedClient: Stripe | null = null;
export function stripe(): Stripe {
  if (cachedClient) return cachedClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY not configured. Add it to .env.local (or the Netlify dashboard for production).",
    );
  }
  cachedClient = new Stripe(key, {
    // Pin the API version so future Stripe upgrades don't silently
    // change shape.
    apiVersion: "2025-09-30.clover" as Stripe.LatestApiVersion,
  });
  return cachedClient;
}

/**
 * Create a Customer Portal session and return the URL. The portal
 * lets the client lead manage their subscription (update card, cancel,
 * download invoices) without us building any of that UI.
 */
export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<string> {
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

/**
 * Map a Stripe invoice status string → our invoice_status enum.
 * Stripe uses: draft, open, paid, uncollectible, void.
 */
export function mapInvoiceStatus(
  stripeStatus: string,
): "draft" | "sent" | "paid" | "overdue" | "void" {
  switch (stripeStatus) {
    case "draft":
      return "draft";
    case "open":
      return "sent";
    case "paid":
      return "paid";
    case "void":
    case "uncollectible":
      return "void";
    default:
      return "sent";
  }
}
