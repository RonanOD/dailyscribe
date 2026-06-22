# Daily Scribe — CLAUDE.md

## Vision

Turn the single-tenant [nyt-crossword-to-kindle](https://github.com/RonanOD/nyt-crossword-to-kindle)
tool into **[dailyscribe.ca](https://dailyscribe.ca)** — a SaaS where Kindle Scribe and
other e-reader users sign up, pick from a catalog of daily "services," and receive a
customized PDF (or bundle of PDFs) emailed to their device on a schedule they control.

The Kindle Scribe is locked down by Amazon but accepts PDFs by email. Daily Scribe turns
that one open channel into a personalized daily delivery — and, longer term, can read back
handwritten responses the user sends from the device.

## Where we're starting from

The reference project ([nyt-crossword-to-kindle](https://github.com/RonanOD/nyt-crossword-to-kindle))
is **single-tenant**: one user, one `.env`, one set of cookies, run via Docker on a cron.

- **Stack:** Python + shell scripts, orchestrated by `docker-compose`, scheduled daily (timezone-aware).
- **Pipeline:** download source → render PDF → email to Kindle via Gmail (App Password).
- **Services already built:** NYT crossword (4 layouts), CBC News (RSS → PDF), Home Assistant
  morning summary (via Gemini), DnD 5e content. Telegram is an alternative delivery channel.
- **Per-user config today:** lives entirely in `.env` + `cookies.nyt.txt` — not multi-tenant.

The core value (source → PDF → email) is proven. The SaaS work is wrapping it in
multi-tenancy, accounts, a config UI, scheduling, and billing.

## Current implementation (chosen stack)

This repo is now a **pnpm + Turborepo monorepo**. The first milestone — NYT crossword
emailed to the owner's Kindle, on multi-tenant-ready foundations — is built and verified
(install, unit tests, typecheck, production build).

- **Frontend + backend:** **Next.js (App Router)** in `apps/web` — React UI + TypeScript API
  routes in one Vercel deployable. Deployed to the **existing dailyscribe.ca Vercel project**
  (Root Directory = `apps/web`), replacing the old static `index.html` placeholder.
- **Database:** **MongoDB Atlas** — a dedicated DailyScribe project / free M0 cluster, fully
  isolated. Accessed only via `MONGODB_URI`; db name `dailyscribe`.
- **Auth:** **Auth.js (NextAuth v5)** with the MongoDB adapter + GitHub OAuth.
- **Scheduling:** **Vercel Cron** → `GET /api/cron/dispatch` (guarded by `CRON_SECRET`),
  timezone-aware, idempotent per day. (Note: Vercel Hobby limits cron frequency; hourly needs Pro.)
- **Shared code:** `packages/core` (framework-free TS) — Mongo client, AES-256-GCM secret
  crypto, the `ServicePlugin` interface + registry, the NYT plugin, and the Gmail `Deliverer`.
- **Renderers:** **NYT needs no rendering** (NYT serves a ready-made PDF to subscribers), so it
  runs in pure TS. Render-heavy services (CBC, HA) will arrive as **Python renderer workers**
  in `workers/`, invoked behind the identical `ServicePlugin.run()` contract.

See `SETUP.md` for environment variables, Atlas/Vercel setup, and end-to-end verification.

## Target architecture (SaaS)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐
│  Web app    │────▶│  API / Auth  │────▶│  Per-user config DB │
│ (signup,    │     │  (accounts,  │     │  (services, schedule│
│  service    │     │  billing)    │     │   delivery email)   │
│  picker)    │     └──────┬───────┘     └─────────┬───────────┘
└─────────────┘            │                       │
                           ▼                       ▼
                   ┌────────────────────────────────────────┐
                   │  Scheduler (per-user cron / job queue)   │
                   └───────────────────┬──────────────────────┘
                                       ▼
                   ┌────────────────────────────────────────┐
                   │  Service plugins (NYT, CBC, HA, DnD, …)  │  ← reuse existing Python
                   │  each: fetch → render PDF                 │
                   └───────────────────┬──────────────────────┘
                                       ▼
                   ┌────────────────────────────────────────┐
                   │  Delivery (email→Kindle, Telegram)       │
                   └──────────────────────────────────────────┘
```

### Key design principles
- **Service plugin model.** Each daily service is a self-contained plugin with a common
  interface (`fetch() → render_pdf()`), so new services (Kanji, classic novels, food
  tracking) drop in without touching the core.
- **Per-user secrets, isolated.** NYT cookies, HA tokens, etc. are per-user and must be
  encrypted at rest — never shared across tenants.
- **Reuse before rewrite.** Port the proven Python renderers from the reference repo rather
  than reimplementing; wrap them in the plugin interface.

## Roadmap

- [~] **Phase 0 — Foundations.** Plugin interface (`ServicePlugin`) + registry and a pure-TS
      NYT crossword plugin (no rendering needed) are **written but not yet trusted** — the code
      sits uncommitted in the working tree and still needs review, real test verification, and a
      commit before it counts as done. Python renderer workers deferred to the services that
      actually need them (CBC, HA).
- [x] **Phase 1 — Multi-tenancy.** Auth.js accounts, MongoDB config (`subscriptions`), and
      encrypted per-user secrets (`userSecrets`, AES-256-GCM) replace `.env`/cookies.
- [~] **Phase 2 — Web app.** Login + dashboard (service config, secrets, send-test-now) shipped.
      Still to do: public signup/marketing polish, full service-catalog picker (>1 service).
- [~] **Phase 3 — Scheduling at scale.** Vercel Cron + timezone-aware, idempotent dispatch
      shipped for the solo case. Still to do: retries, failure notifications, sub-daily cron
      coverage across many timezones (Vercel Pro).
- [ ] **Phase 4 — Billing.** Subscription tiers (e.g. free single-service vs. paid bundles).
- [ ] **Phase 5 — Handwriting return path.** Ingest handwritten responses emailed back from
      the Scribe (e.g. habit tracking, crossword answers).

## Service catalog (from README)
NYT crossword · CBC News · Home Assistant summary · DnD 5e campaign · Kanji-a-day ·
Track eating · Read a classic novel.

## Constraints & notes
- Amazon Kindle requires sender email allowlisting; onboarding must guide users through it.
- Gmail delivery uses App Passwords today — at SaaS scale, evaluate a transactional email
  provider (deliverability, per-user from-addresses, bounce handling).
- NYT (and similar) services need the user's own subscription/cookies; respect each source's
  ToS and keep credentials user-scoped.

## Working agreements
- Decisions and current focus that aren't obvious from the code live in this file — keep the
  roadmap checkboxes current as phases land.
