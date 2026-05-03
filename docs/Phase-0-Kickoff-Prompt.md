# Phase 0 Kickoff Prompt — The Builder (Workplaces Application)

This is the prompt to paste into Claude Code at the start of your first session.

**Updated for v1.4 architecture + The Builder brand selection.**

---

## Pre-flight

Before pasting, confirm you have:

- An empty project directory (e.g., `C:\Code\workplaces-app`) with `CLAUDE.md` in the root
- A `docs/` subfolder inside the project containing the v1.4 architecture doc and Brand Identity Concepts PDF
- Claude Code installed (`npm install -g @anthropic-ai/claude-code`)
- Node 20+ and pnpm installed
- Git installed
- These accounts and credentials at hand:
  - GitHub (account, ready to create the repo)
  - Netlify (account; Bruce already has)
  - Neon (account; connection string from your empty project copied)
  - Clerk (application created; Publishable Key + Secret Key copied)
  - Anthropic API key (from console.anthropic.com)
  - Resend (optional for Phase 0; sign up later)

---

## Instructions

1. `cd` into your project folder (e.g., `cd C:\Code\workplaces-app`)
2. Run `claude` to start Claude Code
3. Paste the prompt block below as your first message
4. Answer the four clarifying questions
5. Build Phase 0 (60–120 minutes of conversation)

---

## --- PROMPT BELOW ---

```
You are pair-programming with Bruce on the Phase 0 scaffold of The Builder
(the Workplaces Application). Read CLAUDE.md in this directory first — it has
full project context, the stack, the domain model, the brand specification
(The Builder direction), conventions, and how to work with Bruce.

Phase 0 has one goal: stand up the empty scaffold and confirm every layer
works end to end. By the end of this phase, Bruce should be able to:

  1. Visit a deployed Netlify URL and see a public landing page styled in
     The Builder brand colours and typography
  2. Sign up via Clerk and land on an authenticated /portal page
  3. See his name from the Clerk session (proves auth works)
  4. Create a test row in any tenant-scoped table from a server action and
     read it back (proves Neon + Drizzle + Postgres RLS work)
  5. Push a commit to GitHub and watch Netlify auto-deploy

That is the entire Phase 0 surface. No real features yet. No portal modules.
No Workplaces MCP. Just a scaffold that proves the stack works AND looks like
The Builder.

BEFORE WRITING ANY CODE, ask Bruce these clarifying questions:

  1. What's the GitHub repo name? (default: workplaces-app)
  2. Has he created the Neon, Netlify, and Clerk accounts? Does he have all
     the env vars handy? If anything is missing, list exactly what to grab
     and where (with URLs).
  3. Should we use pnpm or npm? (default: pnpm)
  4. For the Phase 0 landing page copy: minimal placeholder ("The Builder —
     coming soon") or something more polished?

Once those are answered, execute Phase 0 in this order, confirming with
Bruce between major steps:

STEP 1 — REPO INIT
  • git init, add .gitignore (Node + Next.js + .env*)
  • Initialize Next.js 14 with App Router, TypeScript strict, Tailwind,
    ESLint, src/ directory
  • Install: pnpm add drizzle-orm @neondatabase/serverless drizzle-kit
    @clerk/nextjs zod date-fns lucide-react @anthropic-ai/sdk
  • Install fonts: pnpm add @fontsource/big-shoulders-display
    @fontsource/work-sans @fontsource/ibm-plex-mono
  • Install dev: drizzle-kit, @types/node, etc.
  • Set up shadcn/ui via the CLI
  • Add .nvmrc with "20", commit, push to GitHub

STEP 2 — ENV + CONFIG
  • Create .env.example with every env var commented
  • Create .env.local from Bruce's values (DO NOT COMMIT)
  • Create netlify.toml with Next.js plugin config
  • Create drizzle.config.ts pointing at Neon
  • Configure Tailwind theme with The Builder palette and font families:
    - colors: foreman-black #1A1A1A, drafting-cream #F5F1E8,
      steel-blue #2E4057, safety-vest #E87722
    - fontFamily: display = Big Shoulders Display, sans = Work Sans,
      mono = IBM Plex Mono
  • Confirm `pnpm dev` starts a local server with The Builder styling

STEP 3 — DATABASE SCHEMA (CORE ONLY for Phase 0)
  Reference CLAUDE.md "Domain Model" but for Phase 0, only create:
    • org (tenants)
    • coach
    • user_profile (extends Clerk user with app-specific fields)
    • engagement
    • role enum
  Add created_at, updated_at, org_id to every tenant-scoped table.
  Generate the migration with drizzle-kit. Apply it. Confirm with Bruce
  before destructive operations.

STEP 4 — ROW-LEVEL SECURITY
  Write the RLS policies as a separate SQL migration. Create a Postgres
  function auth.current_org_id() that reads from the Clerk JWT (use the
  session-level GUC pattern: set app.current_org_id at request boundary
  via Next.js middleware).
  Test the policies by attempting cross-tenant reads from a script.
  They should fail.

STEP 5 — CLERK AUTH WIRING
  • Add Clerk middleware (middleware.ts) protecting /portal routes
  • Build /sign-in and /sign-up pages (Clerk components, themed in
    The Builder palette)
  • Build /portal/page.tsx that displays the signed-in user's name
  • On first sign-in, create a corresponding user_profile row (Clerk
    webhook → server action)
  • Confirm sign-up → redirect → /portal works locally

STEP 6 — DEPLOY TO NETLIFY
  • Connect the GitHub repo to Netlify
  • Add all env vars to Netlify dashboard
  • Push to main, watch the deploy
  • Confirm Clerk redirect URLs include the Netlify URL
  • Test sign-up on the live URL

STEP 7 — VERIFY THE FULL LOOP
  Have Bruce sign up, create a test "engagement" row from a server
  action, read it back, sign out, sign in as a different test account,
  confirm RLS prevents seeing the first user's data.

STEP 8 — DOCUMENT
  • Update CLAUDE.md: move "Active Phase" from Phase 0 to Phase 1
  • Add a "What was built in Phase 0" section
  • Add README.md with quickstart for Bruce
  • Commit, push, tag as v0.1.0

CONSTRAINTS — IMPORTANT:

  • Multi-tenant from day one. Every tenant-scoped table needs an org_id
    column AND an RLS policy. Do not skip RLS — it's much harder to
    retrofit.
  • The Builder brand from the first commit. Page background Drafting
    Cream, body text Foreman Black, primary buttons Steel Blue, accents
    Safety Vest Orange (sparingly), Big Shoulders for headings, Work
    Sans for body.
  • Do not install dependencies that aren't in CLAUDE.md's stack table
    without proposing them to Bruce first.
  • Server Components and Server Actions by default.
  • TypeScript strict — zero `any` without comment justification.
  • Conventional commits (feat:, fix:, chore:, docs:, refactor:).
  • Never run destructive DB operations without confirming with Bruce.
  • Bruce's working hours are 8:30 AM – 6:00 PM Mountain Time, Mon–Fri.

If anything in CLAUDE.md is unclear, ask before assuming. If you spot
something that should be in CLAUDE.md but isn't, add it.

Begin with the four clarifying questions, then proceed.
```

## --- END PROMPT ---

---

## What to Expect

Phase 0 takes 60–120 minutes of conversation. The output is a deployed Netlify URL where Bruce can sign up and land on an authenticated /portal page, with Neon storing the data behind row-level security, and the entire UI styled in The Builder brand.

When Phase 0 ships, send the session summary or final state to me (back in Cowork) and I'll write the Phase 1 kickoff prompt for the Client Portal MVP build.
