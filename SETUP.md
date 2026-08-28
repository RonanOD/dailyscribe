# DailyScribe — setup & verification

Monorepo: `apps/web` (Next.js — the dashboard/auth/API app, served at
`my.dailyscribe.ca`), `apps/marketing` (Next.js — the promotional site + Decap
CMS admin, served at `dailyscribe.ca`/`www`), `packages/core` (shared TS: Mongo,
crypto, plugins), `packages/theme` (shared CSS palette + fonts between the two
apps), `workers/` (future Python renderers). Package manager: **pnpm**.

## 1. Local install

```bash
pnpm install
pnpm test        # unit tests (crypto + NYT url/date builders + plugin fetch)
pnpm typecheck   # tsc across all packages/apps
pnpm build       # production build of apps/web and apps/marketing
pnpm dev         # run both apps locally (apps/web on :3000, apps/marketing on
                 # :3001 — Next auto-picks the next free port)
```

## 2. External services (one-time)

### MongoDB Atlas (dedicated project)
1. Create a **new Atlas project** + a **free M0 cluster** (kept separate from your other app).
2. Add a database user and allow your IP (and `0.0.0.0/0` for Vercel, or Vercel's egress).
3. Copy the `mongodb+srv://…` connection string → `MONGODB_URI`. DB name: `dailyscribe`.

### GitHub OAuth app (Auth.js)
1. GitHub → Settings → Developer settings → OAuth Apps → New.
2. Homepage `https://dailyscribe.ca`; callback `https://my.dailyscribe.ca/api/auth/callback/github`
   (add `http://localhost:3000/api/auth/callback/github` for local dev).
3. Copy Client ID/Secret → `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`.

### Google OAuth client (Auth.js)
Most Kindle users don't have GitHub — Google + email magic-link are the primary
sign-in methods.
1. Google Cloud Console → **APIs & Services → OAuth consent screen**: type
   **External**, add scopes `email` and `profile`, publish (or keep in Testing
   and add test users for the beta).
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**,
   type **Web application**. Authorized redirect URIs:
   `https://my.dailyscribe.ca/api/auth/callback/google` (add
   `http://localhost:3000/api/auth/callback/google` for dev).
3. Copy Client ID/Secret → `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

### Email magic-link (Auth.js)
No extra setup — the Auth.js Resend provider reuses `RESEND_API_KEY` and
`MAIL_FROM_DEFAULT`. Sign-in links are sent from `my@dailyscribe.ca`.

### GitHub OAuth app (Decap CMS)
A **second, separate** OAuth App — Decap's `github` backend needs `repo` (full
write) scope to commit content edits, far more sensitive than Auth.js's
login-only scope above, so it must not share a registration or callback URL.
1. GitHub → Settings → Developer settings → OAuth Apps → New.
2. Homepage `https://dailyscribe.ca`; callback `https://dailyscribe.ca/api/decap-oauth/callback`.
3. Copy Client ID/Secret → `DECAP_OAUTH_GITHUB_CLIENT_ID` / `DECAP_OAUTH_GITHUB_CLIENT_SECRET`
   (set on the `apps/marketing` Vercel project only).
4. GitHub OAuth Apps now support up to 10 callback URLs on one app (no need
   to swap between environments) — to test locally, open the same app's
   settings and add a second one: `http://localhost:3000/api/decap-oauth/callback`.
   `/admin/config.yml` is served dynamically (its `base_url` is computed from
   whatever origin actually requested it), so both the production and
   localhost callbacks work against this one app without further changes.
   **Ephemeral Vercel preview URLs are the exception**: each preview
   deployment gets its own one-off `*.vercel.app` address, so registering
   one doesn't help the next; don't try to fully exercise this OAuth flow on
   a preview URL — verify it locally, or on `dailyscribe.ca` once cut over.

### Resend (delivery)
Daily Scribe sends all email itself from **one address: `Daily Scribe <my@dailyscribe.ca>`**.
No per-user email credentials exist anywhere.
1. Create a [Resend](https://resend.com) account → **Domains → Add** `dailyscribe.ca`.
2. Add the DNS records Resend issues (DKIM TXT, SPF TXT + MX on `send.`, and a `_dmarc` TXT —
   `v=DMARC1; p=none;` to start) at the DNS host (Cloudflare; keep records **DNS-only/grey
   cloud**). Wait for the domain to show **Verified**.
3. Create an API key (Sending access) → `RESEND_API_KEY`.
4. Each user adds `my@dailyscribe.ca` to their Kindle's **Approved Personal Document E-mail
   List** (Amazon → Manage Your Content and Devices → Preferences → Personal Document
   Settings) — once; new services need no extra setup.

### Resend Receiving (inbound mail)
`my@dailyscribe.ca` — the same address every user already knows as the outbound
sender — doubles as the shared inbound address for every mailed-back submission,
across all services. Routing is done by a `dailyscribe:<service>:<token>` ref printed
in each generated PDF's footer text (extracted with `pdfjs-dist` when the same PDF is
mailed back), not by which address it was sent to, so adding a new inbound-capable
service needs no new address or DNS.

A second Resend domain (e.g. a `my.dailyscribe.ca` subdomain used only for receiving)
was considered first, but Resend's Free plan only includes 1 domain — a second one
requires a paid plan. Enabling Receiving directly on the existing `dailyscribe.ca`
domain avoids that cost, at the cost of the root domain's MX: it was previously a
Cloudflare Email Routing rule forwarding `my@dailyscribe.ca` to a personal inbox
(unrelated to Daily Scribe's own logic) — that forward is given up in favor of this,
since it's superseded by real webhook processing.
1. In Resend, open the existing `dailyscribe.ca` domain (used for outbound) and toggle
   **Enable Receiving** — no new domain entry needed.
2. Add the MX record it issues at the DNS host (Cloudflare), **replacing** whatever
   MX records are currently there for the root domain.
3. Create a **webhook** subscribed to `email.received`, pointed at
   `https://my.dailyscribe.ca/api/webhooks/resend-inbound` (apps/web's domain —
   the *Resend domain* stays the apex `dailyscribe.ca`; only this webhook's
   HTTP callback follows wherever `apps/web`'s code is actually served) →
   copy its signing secret.
4. Set `RESEND_INBOUND_DOMAIN=dailyscribe.ca` and `RESEND_INBOUND_WEBHOOK_SECRET`
   (below).

### Resend delivery-status webhook (bounces / complaints)
A **second webhook**, separate from the inbound one above.
1. In Resend, create a webhook subscribed to `email.bounced`,
   `email.complained`, and `email.delivered`, pointed at
   `https://my.dailyscribe.ca/api/webhooks/resend-events`.
2. Copy its signing secret → `RESEND_EVENTS_WEBHOOK_SECRET`.
A hard bounce or spam complaint auto-disables every subscription pointed at that
Kindle address (recorded in `deliveryEvents`); the user sees a banner explaining
why and re-enables after fixing the address / approved-sender list.

## 3. Environment variables

Copy `.env.example` → `apps/web/.env.local` for dev, and set the same in Vercel for prod.

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Atlas connection string |
| `MONGODB_DB` | Database name (default `dailyscribe`) |
| `SECRETS_ENCRYPTION_KEY` | base64 32-byte AES-256-GCM key for per-user secrets |
| `AUTH_SECRET` | Auth.js session secret |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth app |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client |
| `ALLOW_NEW_SIGNUPS` | `"false"` = invite-only (waitlist approval seeds `users`); `"true"` = open |
| `CRON_SECRET` | Bearer token Vercel Cron must present to `/api/cron/dispatch` |
| `RESEND_API_KEY` | Resend API key (app-wide outbound email + magic-link sign-in) |
| `MAIL_FROM_DEFAULT` | From address, `Daily Scribe <my@dailyscribe.ca>` (also the code default) |
| `RESEND_INBOUND_DOMAIN` | The Resend domain with Receiving enabled — `dailyscribe.ca` (the apex domain; independent of which Vercel project/hostname actually serves the webhook) |
| `RESEND_INBOUND_WEBHOOK_SECRET` | Signing secret for the `email.received` webhook |
| `RESEND_EVENTS_WEBHOOK_SECRET` | Signing secret for the bounce/complaint/delivered webhook |
| `DECAP_OAUTH_GITHUB_CLIENT_ID` / `DECAP_OAUTH_GITHUB_CLIENT_SECRET` | Decap CMS's own GitHub OAuth app (apps/marketing only — see below) |
| `GEMINI_API_KEY` | Google Gemini key for the Kanji handwriting check |
| `GEMINI_MODEL` | Optional Gemini model override (defaults to `gemini-flash-lite-latest`) |

Generate keys:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # SECRETS_ENCRYPTION_KEY
npx auth secret                                                              # AUTH_SECRET
openssl rand -hex 32                                                         # CRON_SECRET
```

## 4. Deploy

Two separate Vercel projects share this one repo, each with its own Root
Directory and its own custom domain(s):

### apps/web → my.dailyscribe.ca

1. In the existing (`dailyscribe`) Vercel project's settings, Root Directory
   stays `apps/web` (framework: Next.js).
2. Domains: this project owns **`my.dailyscribe.ca`** (add it in Vercel's
   Domains settings; add the CNAME it gives you at the DNS host — Cloudflare —
   **DNS-only/grey cloud**, same convention as Resend's records below). It no
   longer owns the apex `dailyscribe.ca`/`www` — those moved to
   `apps/marketing` below.
3. Add all env vars above (Production + Preview) except the two
   `DECAP_OAUTH_GITHUB_*` ones, which belong on the marketing project only.
4. The cron in `apps/web/vercel.json` calls `/api/cron/dispatch` daily at 11:00 UTC
   (08:00 ADT; Vercel cron is UTC-only — no DST handling). Vercel attaches
   `Authorization: Bearer $CRON_SECRET` automatically. **Vercel Hobby limits cron frequency**
   (≈once/day) — hourly, timezone-aware coverage needs Pro.
5. **Migrating from the old single-domain setup?** Do it in this order so
   nothing is unreachable mid-cutover: (1) create the `apps/marketing` project
   and confirm it builds on its `*.vercel.app` preview URL; (2) add
   `my.dailyscribe.ca` to the existing project and its Cloudflare CNAME
   (additive — `dailyscribe.ca` keeps working on the old project throughout);
   (3) verify `my.dailyscribe.ca` serves the dashboard (sign-in will 404 here
   until the next step — expected); (4) update the Auth.js OAuth App's
   callback URL *and* the Resend inbound webhook URL to `my.dailyscribe.ca`
   together; (5) reassign `dailyscribe.ca` + `www` from the old project to
   `apps/marketing` (dashboard-only, no DNS change); (6) verify end-to-end —
   marketing site at the apex, sign-in and a Kanji mail-back round-trip both
   working at `my.dailyscribe.ca`.

### apps/marketing → dailyscribe.ca + www

1. Create a **second Vercel project** from the same GitHub repo, Root
   Directory = `apps/marketing` (framework: Next.js). This replaces the old
   static root `index.html` placeholder, which is no longer used.
2. Domains: this project owns **`dailyscribe.ca`** and **`www.dailyscribe.ca`**
   (reassigned here from the old project's settings — same Vercel
   account/team, so this is a dashboard-only move, no DNS change needed).
3. Env vars: `DECAP_OAUTH_GITHUB_CLIENT_ID` / `DECAP_OAUTH_GITHUB_CLIENT_SECRET`
   only (Production + Preview) — this app has no database/auth/email
   dependencies of its own.

### Decap CMS (content editing)

`apps/marketing/public/admin` is the content-editing entry point
(`https://dailyscribe.ca/admin`) — see `apps/marketing/public/admin/config.yml`
for the field schema and `apps/marketing/content/landing.yml` for the content
it edits. Requires the "GitHub OAuth app (Decap CMS)" setup above and its two
env vars on the `apps/marketing` project. No database — edits commit straight
to this repo's `main` branch, and Vercel's normal git integration redeploys
the site.

### Waitlist & invite-only access

The marketing site's CTA is a **waitlist form** (`WaitlistForm`), which POSTs
cross-origin to `apps/web`'s `POST /api/waitlist` (rows land in the `waitlist`
collection). Sign-in stays gated by `apps/web/auth.ts` — only emails already in
`users` can sign in while `ALLOW_NEW_SIGNUPS="false"`.

Approve people in batches (run from `apps/web`, needs `.env.local`):
```bash
npx tsx scripts/approve-waitlist.mjs --list          # show pending
npx tsx scripts/approve-waitlist.mjs --batch 5       # approve 5 oldest, email invites
npx tsx scripts/approve-waitlist.mjs a@x.com --no-email
```
It seeds each email into `users` and marks the `waitlist` row `approved`.

`NEXT_PUBLIC_WEB_APP_URL` on the marketing project overrides where the form
POSTs (defaults to `https://my.dailyscribe.ca`).

### Analytics

Both apps load `/_vercel/insights/script.js` from their layout — enable **Web
Analytics** on each Vercel project for it to collect. Campaign links use
`?ref=<slug>` (e.g. `dailyscribe.ca/?ref=reddit-kindlescribe`); the waitlist
form forwards that slug and the approval script copies it onto the `users` row.

## 5. End-to-end verification (you as customer #1)

1. `pnpm dev`, open `http://localhost:3000`. Sign in — **email link**, **Google**,
   or **GitHub**. A brand-new address is rejected until approved (seed it with
   `approve-waitlist.mjs`, or set `ALLOW_NEW_SIGNUPS="true"` for dev).
2. Whitelist `my@dailyscribe.ca` in Amazon's **Personal Document Settings** (one-time).
3. In the dashboard:
   - Paste your nytimes.com cookie (must include `NYT-S`) → **Save NYT cookie** (crossword only).
   - Set layout/feeds, delivery time, timezone, and your **Send-to-Kindle email** → save each
     service's settings.
4. Confirm secrets are stored **encrypted** (Atlas → `userSecrets` shows `data.ciphertext`,
   never plaintext).
5. Click **Send test now** → the PDF should arrive on your Kindle, and a `success` row should
   appear in `deliveries`.
6. Cron check (local):
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/dispatch
   ```
   It should run the due subscription and `skip` if today was already delivered.

## Notes / follow-ups
- ESLint is intentionally deferred (TypeScript strict + Prettier cover this milestone).
- CBC News renders in pure TS (`@react-pdf/renderer` in `apps/web/lib/plugins/cbc.tsx`) — no
  Python worker needed. Truly render-heavy services (e.g. Home Assistant) may still land as
  Python workers under `workers/`, behind the same `ServicePlugin.run()` contract.
- Gotcha (cost us hours): Amazon accepts mail for non-approved senders with a 250 ("Delivered"
  in Resend) and then **silently discards** it — no rejection notice, nothing in cloud Docs.
  If a send shows Delivered but never lands, delete and hand-retype the approved-sender entry.
