# Daily Scribe — CLAUDE.md

## Vision

Turn the single-tenant [nyt-crossword-to-kindle](https://github.com/RonanOD/nyt-crossword-to-kindle)
tool into **[dailykindle.com](https://dailykindle.com)** — a SaaS where Kindle Scribe and
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

- [ ] **Phase 0 — Foundations.** Pull the reference repo's renderers into this repo behind a
      clean plugin interface. Keep it runnable single-tenant to validate parity.
- [ ] **Phase 1 — Multi-tenancy.** User accounts + auth, config DB, encrypted per-user
      secrets. Replace `.env`/cookies with per-user records.
- [ ] **Phase 2 — Web app.** Signup/login, service catalog picker, delivery email + schedule
      settings, send-test-now.
- [ ] **Phase 3 — Scheduling at scale.** Per-user, timezone-aware job queue replacing the
      single Docker cron. Retries + failure notifications.
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
