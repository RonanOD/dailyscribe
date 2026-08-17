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
- **Email delivery:** **Resend**, sending from the single verified address
  `Daily Scribe <my@dailyscribe.ca>` (users whitelist it once in their Kindle settings; service
  identity lives in the subject line). One app-wide `RESEND_API_KEY` — **no per-user email
  credentials**. DNS (DKIM/SPF/DMARC) is verified on `dailyscribe.ca` via Cloudflare.
  Inbound (e.g. `dnd@` for the Phase 5 return path) is deferred; receiving addresses don't
  need Kindle whitelisting, so per-service inbound stays open.
- **Shared code:** `packages/core` (framework-free TS) — Mongo client, AES-256-GCM secret
  crypto, the `ServicePlugin` interface + registry, the NYT plugin, and the `Deliverer`
  abstraction (Resend-only; the Kindle round trip is verified end-to-end).
- **Renderers:** **NYT needs no rendering** (NYT serves a ready-made PDF) and **CBC renders in
  pure TS** (`@react-pdf/renderer` in `apps/web`). Truly render-heavy services (e.g. HA) may
  arrive as **Python renderer workers** in `workers/`, behind the same `ServicePlugin.run()`
  contract.

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

- [x] **Phase 0 — Foundations.** Plugin interface (`ServicePlugin`) + registry, committed and
      live. Four plugins registered: NYT crossword (pure TS, no rendering needed), CBC News,
      Home Assistant summary, Kanji-a-day — plus a **Digest** pseudo-service (`runner.ts`) that
      bundles whichever of a user's other services are enabled into one PDF/email, with a
      branded cover + linked table of contents page and per-member failure isolation (one
      service erroring drops just its section, not the whole digest). Python renderer workers
      still deferred to the services that actually need them (none yet — CBC/HA render in pure
      TS via `@react-pdf/renderer`).
- [x] **Phase 1 — Multi-tenancy.** Auth.js accounts, MongoDB config (`subscriptions`), and
      encrypted per-user secrets (`userSecrets`, AES-256-GCM) replace `.env`/cookies.
- [~] **Phase 2 — Web app.** Login + dashboard (service config, secrets, send-test-now, digest
      checkbox) shipped. Still to do: public signup/marketing polish, full service-catalog
      picker (>1 service) for new sign-ups — DnD 5e, classic novels, and eating tracking remain
      unbuilt.
- [~] **Phase 3 — Scheduling at scale.** Vercel Cron + timezone-aware, idempotent dispatch
      shipped for the solo case. Still to do: retries, failure notifications, sub-daily cron
      coverage across many timezones (Vercel Pro).
- [ ] **Phase 4 — Billing.** Subscription tiers (e.g. free single-service vs. paid bundles).
- [~] **Phase 5 — Handwriting return path.** Live for Kanji: `/api/webhooks/resend-inbound`
      routes a mailed-back PDF by an embedded page ref, trims it to just that service's own
      pages, and grades it via Gemini (`kanjiSubmissions`, `kanjiProgress`). Still to do:
      generalize the return path beyond Kanji to other services (e.g. crossword answers, habit
      tracking).

## Service catalog (from README)
NYT crossword · CBC News · Home Assistant summary · DnD 5e campaign · Kanji-a-day ·
Track eating · Read a classic novel. (Digest — bundle any combination of the above into one
PDF/email — is a delivery mode on top of these, not a catalog entry of its own.)

## Constraints & notes
- Amazon Kindle requires sender email allowlisting; onboarding guides users to whitelist the
  single address `my@dailyscribe.ca` once (dashboard "Kindle setup" section).
- Watch Resend bounce/complaint metrics and Amazon throttling on the shared sender as users
  grow; `my+userid@` subaddressing is the escape hatch (same approved sender for Amazon).
- NYT (and similar) services need the user's own subscription/cookies; respect each source's
  ToS and keep credentials user-scoped.

## Working agreements
- Decisions and current focus that aren't obvious from the code live in this file — keep the
  roadmap checkboxes current as phases land.
