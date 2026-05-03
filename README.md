# The Builder · The Workplaces Application

The complete operational layer for the Workplaces coaching business — the entire end-to-end client experience from prospect to renewal in one application. Replaces the current fragmented stack (Monday, Drive, Adobe Sign, etc.) with a single multi-tenant SaaS. This repo is the **client-facing web application** plus the **Workplaces MCP**; the coach-side runs in Cowork via a separate plugin.

**Status:** Phase 0 — foundation shipped (`v0.1.0`). Phase 1 begins with the first three portal modules. See [CLAUDE.md](./CLAUDE.md) "Active Phase" for current focus.

**Live:** <https://workplaces-the-builder.netlify.app>

---

## Quickstart (local development)

You'll need Node 20 LTS (or 24 — local-only; Netlify uses 20 via `.nvmrc`) and pnpm 9.x.

```bash
# 1. Install dependencies
pnpm install

# 2. Environment
cp .env.example .env.local
# Then fill in DATABASE_URL, Clerk keys, ANTHROPIC_API_KEY.
# Real values for Bruce's dev environment live in his password manager,
# NOT in this repo. .env.local is git-ignored.

# 3. Start the dev server
pnpm dev
# → http://localhost:3000  (or 3001 if 3000 is busy)
```

Visit `/sign-up` to land on a fresh Clerk sign-up. After verification you'll be redirected to `/portal`, where first visit lazily provisions a personal org and `user_profile` row.

---

## Useful commands

| Command | What it does |
|---|---|
| `pnpm dev` | Local dev server with Hot Reload. Watches `app/`, `lib/`, `components/`. |
| `pnpm build` | Production build. Runs typecheck + lint as part of the build. |
| `pnpm lint` | ESLint pass. |
| `pnpm exec tsc --noEmit` | Full TypeScript check without emit. |
| `pnpm drizzle-kit generate` | Generate a migration SQL from `lib/db/schema.ts`. Append custom SQL (RLS, triggers, etc.) to the generated file before applying. |
| `pnpm drizzle-kit generate --custom --name <slug>` | Scaffold a hand-written migration (no schema diff). |
| `pnpm drizzle-kit migrate` | Apply pending migrations to the database in `DATABASE_URL`. |
| `pnpm drizzle-kit studio` | Open Drizzle's browser UI on the database. |
| `node scripts/verify-rls.mjs` | Run the RLS verification script — bootstrap, positive isolation, negative read, negative write, cleanup. Idempotent across runs. |

---

## Deploy (production)

Production is a Netlify site connected to the GitHub repo via the Netlify GitHub App.

```bash
# Trigger a deploy
git push origin main
```

Netlify watches `main` and runs `pnpm build` against the production env vars stored in its dashboard. The build emits a `.next/` Next.js build that the official `@netlify/plugin-nextjs` plugin serves with App Router routing, edge middleware, and image optimization. Build time is ~2–3 min for a clean run; ~1 min cached.

**Where env vars live:**

| Layer | Where | Source of truth |
|---|---|---|
| Local development | `./.env.local` (git-ignored) | Bruce's password manager / Neon + Clerk + Anthropic dashboards |
| Production | Netlify dashboard → Site configuration → Environment variables | Same source values, set independently in the Netlify UI |

When new env vars are added, update [.env.example](./.env.example) so the requirement is discoverable, then add the actual value in both locations.

---

## Project structure

```
app/                     Next.js App Router routes
  page.tsx               Public landing
  sign-in/, sign-up/     Clerk catch-all auth pages
  portal/                Authenticated portal (provisioned on first visit)

lib/
  db/
    schema.ts            Drizzle schema — single source of truth for tables, enums, types
    migrations/          Generated SQL (drizzle-kit) + custom migrations (RLS, role, triggers)
    tenant.ts            withTenantContext / withBootstrapContext / withSystemContext
    provisioning.ts      ensureUserProfile (first-visit auto-provision)

components/              shadcn/ui components live in components/ui/
middleware.ts            Clerk middleware — protects /portal(.*)

scripts/
  verify-rls.mjs         End-to-end RLS verification (5 scenarios, idempotent)

docs/
  CLAUDE.md (root)       Read by Claude Code at session start — the architectural spec
  decisions.md           Append-only architectural decisions log; newest at the top
  Workplaces — Custom Application Architecture — v1.4 …docx
                         Authoritative architecture reference (v1.4)
  Workplaces — Brand Design Philosophy …md
  Brand-01..05 …png      Visual brand reference renders
```

---

## References

- **[CLAUDE.md](./CLAUDE.md)** — full architectural spec, domain model, methodology IP rules, conventions, and current phase. **Read this first** if you're new to the codebase. Claude Code loads it automatically at session start.
- **[docs/decisions.md](./docs/decisions.md)** — append-only log of structural decisions and Phase 1+ deferrals. Newest entries at the top.
- **[docs/Workplaces — Custom Application Architecture — v1.4 — 2026-05-02.docx](./docs/)** — the authoritative architecture document (v1.4, May 2 2026).

---

## Contributing rhythm

This is Bruce's project; he pairs with Claude Code on it. Working hours Mon–Fri 8:30 AM – 6:00 PM Mountain Time. Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`). Server Components and Server Actions by default; TypeScript strict; never any unjustified `any`. Every tenant-scoped query goes through `withTenantContext` — see [docs/decisions.md](./docs/decisions.md) on why that's the only RLS audit point in the codebase.
