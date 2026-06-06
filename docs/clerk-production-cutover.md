# Clerk Production Cutover Runbook

**Goal:** move The Builder's live site (`builder.4workplaces.com`) onto a proper
Clerk **Production** instance, and get Bruce logged in as `master_admin`.

**Why we're doing this:** the site has been running on the Clerk **Development**
instance. Development instances get reset/churned, which orphaned the Clerk IDs
stored in the database. Production is the correct, stable home for a real
product on a custom domain.

> Plain-language note for Bruce: do the stages **in order**. Some steps need me
> to give you the exact value to paste, and some need you to send me a value
> (an ID or a key). Don't delete anything in the database until Stage 5.

---

## Current database facts (as of cutover)

These are the rows we'll repair in Stage 5. **Do not change them yet.**

| What | Table row id | Old Clerk id (to be replaced) |
|------|--------------|-------------------------------|
| Master org "The Business Builders by Workplaces" | `29af29d7-3ad1-47fd-81af-24151aa78ecf` | `clerk_org_id = org_3EYNYLt3IBluNthQDzEn0NuLmTB` |
| Bruce — master_admin profile (KEEP) | `de4efe17-0d7f-4619-b520-c71481ae217b` | `clerk_user_id = user_3DBnr8sSpLvh8ygX7iXGxjaA4Kp` |
| Bruce — client_employee duplicate (DELETE) | `68ee735d-0701-49e2-86f5-775291b040ea` | `clerk_user_id = user_3EYM4s91b18COE42tVqEWTB6DcU` |
| Amardeep — test client org (optional cleanup) | `88c6fedf-3276-4145-9983-8d4cc29bfad9` | `clerk_org_id = org_3ESCaJFa4WJUs5etz0pbWkoIpjU` |

---

## Stage 1 — Create the Production instance in Clerk

1. In the Clerk dashboard, on the "create production instance" prompt, choose
   **Clone development instance** (copies your sign-in methods + theme; it does
   **not** copy users or organizations — that's expected).
2. If Clerk asks you to **upgrade your plan**, that's because Production +
   Organizations is a paid feature. Note the price; we'll confirm before paying.
3. Once created, you'll land in the **Production** environment. Leave it here.

✅ Done when: the environment toggle shows **Production** and you see a
Production dashboard.

---

## Stage 2 — Point your domain at Clerk (DNS)

Production Clerk runs on your own domain, so Clerk gives you a list of **DNS
records** to add.

1. In Clerk (Production) → **Domains** (or **Configure → Domains**), Clerk shows
   several records to add — typically CNAMEs like `clerk`, `accounts`,
   `clkmail`, and two `clk._domainkey` / `clk2._domainkey` records.
2. Add each record exactly as shown, at wherever **builder.4workplaces.com**'s
   DNS is managed (Netlify DNS, or your registrar — GoDaddy / Cloudflare / etc.).
3. Click **Verify** in Clerk. DNS can take anywhere from a few minutes to a few
   hours to propagate — we wait until Clerk shows all records ✅ verified.

> Send me a screenshot of Clerk's DNS list and tell me where your DNS is hosted,
> and I'll translate it into the exact records to add.

✅ Done when: Clerk shows your domain **verified**.

---

## Stage 3 — Production settings + keys

1. **Enable Organizations:** Configure → **Organizations** → turn it on. Set
   **"Require organization"** ON (every session must have an active org — matches
   how the app expects to run).
2. **Copy the Production API keys:** Configure → **API Keys**. You'll need:
   - Publishable key — starts with `pk_live_…`
   - Secret key — starts with `sk_live_…`
3. **Create a webhook:** Configure → **Webhooks** → Add endpoint:
   - URL: `https://builder.4workplaces.com/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `organization.updated`,
     `organizationMembership.created`, `organizationMembership.updated`,
     `organizationMembership.deleted`
   - Copy the **Signing secret** (starts with `whsec_…`).

> Send me confirmation when you have the three secrets (you can paste the
> `pk_live_…` publishable key in chat — it's public by design — but **don't paste
> the `sk_live_…` secret or the `whsec_…` in chat**; you'll put those straight
> into Netlify in Stage 4).

✅ Done when: Organizations is on, and you have the publishable key, secret key,
and webhook signing secret.

---

## Stage 4 — Point Netlify at Production

1. Netlify → your site → **Site configuration → Environment variables**. Update:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → your `pk_live_…`
   - `CLERK_SECRET_KEY` → your `sk_live_…`
   - `CLERK_WEBHOOK_SECRET` → your `whsec_…`
   - (Leave `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `SIGN_UP_URL`, and the
     `…FALLBACK_REDIRECT_URL=/portal` ones as they are.)
2. **Redeploy** the site (Deploys → Trigger deploy → Deploy site) so it picks up
   the new keys.

✅ Done when: the deploy is green and the site loads. (At this point the live
site is on Production Clerk; the old Development login no longer applies.)

---

## Stage 5 — Bootstrap your master org + align the database

Production starts empty, so we create your account + org, then repair the
database to match.

1. Go to `https://builder.4workplaces.com/sign-up` and sign up with
   **bbaker@4workplaces.com**. You'll likely land on a "no invitation" page —
   that's fine; the point is your **Production Clerk user** now exists.
2. In Clerk (Production) → **Users**, open your new account and copy your
   **User ID** (`user_…`). → send it to me.
3. In Clerk (Production) → **Organizations** → **Create organization**, name it
   **The Business Builders by Workplaces**. Open it, copy the **Organization ID**
   (`org_…`). → send it to me.
4. Still in that org → **Members** → add **bbaker@4workplaces.com** as an
   **Admin**. Then set the membership's metadata: `app_role` = `master_admin`
   (I'll confirm exactly where this lives once we're here).
5. In Neon SQL Editor (Production branch), run the three statements below
   **with the two new IDs pasted in**:

   ```sql
   -- a) point the master org at your new Production Clerk org
   UPDATE orgs
   SET clerk_org_id = 'PASTE_NEW_PRODUCTION_ORG_ID', updated_at = now()
   WHERE id = '29af29d7-3ad1-47fd-81af-24151aa78ecf';

   -- b) remove the leftover client_employee duplicate of you
   DELETE FROM user_profiles
   WHERE id = '68ee735d-0701-49e2-86f5-775291b040ea';

   -- c) point your master_admin record at your new Production login
   UPDATE user_profiles
   SET clerk_user_id = 'PASTE_NEW_PRODUCTION_USER_ID', updated_at = now()
   WHERE id = 'de4efe17-0d7f-4619-b520-c71481ae217b';
   ```

6. Confirm your coach record is linked (should already be):

   ```sql
   SELECT * FROM coaches
   WHERE user_profile_id = 'de4efe17-0d7f-4619-b520-c71481ae217b';
   ```

   If that returns **no rows**, run:

   ```sql
   INSERT INTO coaches (org_id, user_profile_id, status)
   VALUES ('29af29d7-3ad1-47fd-81af-24151aa78ecf',
           'de4efe17-0d7f-4619-b520-c71481ae217b', 'active');
   ```

✅ Done when: the three statements ran without error.

---

## Stage 6 — Verify

1. Sign out of `builder.4workplaces.com`, then sign back in with
   **bbaker@4workplaces.com**.
2. You should land in the **coach console at `/business-builder`** as master
   admin — not a client portal.

✅ Success = you're in your own master-admin area.

---

## Optional cleanup (later, not required to log in)

- The **Amardeep** test client (`88c6fedf-…`) points at a dead Clerk org. Since
  it's only test data, we can delete it once you're confirmed working:

  ```sql
  -- removes the test client org and everything attached to it (test data only)
  DELETE FROM orgs WHERE id = '88c6fedf-3276-4145-9983-8d4cc29bfad9';
  ```

- The `MCP_BEARER_TOKEN` and any Cowork-side Clerk references will need the new
  Production user id too, if/when you wire the Workplaces MCP back up.
