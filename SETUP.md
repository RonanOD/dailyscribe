# DailyScribe — setup & verification

Monorepo: `apps/web` (Next.js — React UI + TS API), `packages/core` (shared TS),
`workers/` (future Python renderers). Package manager: **pnpm**.

## 1. Local install

```bash
pnpm install
pnpm test        # unit tests (crypto + NYT url/date builders + plugin fetch)
pnpm typecheck   # tsc across core + web
pnpm build       # production build of apps/web
pnpm dev         # run the app locally (http://localhost:3000)
```

## 2. External services (one-time)

### MongoDB Atlas (dedicated project)
1. Create a **new Atlas project** + a **free M0 cluster** (kept separate from your other app).
2. Add a database user and allow your IP (and `0.0.0.0/0` for Vercel, or Vercel's egress).
3. Copy the `mongodb+srv://…` connection string → `MONGODB_URI`. DB name: `dailyscribe`.

### GitHub OAuth app (Auth.js)
1. GitHub → Settings → Developer settings → OAuth Apps → New.
2. Homepage `https://dailyscribe.ca`; callback `https://dailyscribe.ca/api/auth/callback/github`
   (add `http://localhost:3000/api/auth/callback/github` for local dev).
3. Copy Client ID/Secret → `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`.

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

## 3. Environment variables

Copy `.env.example` → `apps/web/.env.local` for dev, and set the same in Vercel for prod.

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Atlas connection string |
| `MONGODB_DB` | Database name (default `dailyscribe`) |
| `SECRETS_ENCRYPTION_KEY` | base64 32-byte AES-256-GCM key for per-user secrets |
| `AUTH_SECRET` | Auth.js session secret |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth app |
| `CRON_SECRET` | Bearer token Vercel Cron must present to `/api/cron/dispatch` |
| `RESEND_API_KEY` | Resend API key (app-wide outbound email) |
| `MAIL_FROM_DEFAULT` | From address, `Daily Scribe <my@dailyscribe.ca>` (also the code default) |

Generate keys:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # SECRETS_ENCRYPTION_KEY
npx auth secret                                                              # AUTH_SECRET
openssl rand -hex 32                                                         # CRON_SECRET
```

## 4. Deploy (existing dailyscribe.ca Vercel project)

1. In the existing project's settings, set **Root Directory = `apps/web`** (framework: Next.js).
   This replaces the old static `index.html` placeholder with the app.
2. Add all env vars above (Production + Preview).
3. The cron in `apps/web/vercel.json` calls `/api/cron/dispatch` daily at 11:00 UTC
   (08:00 ADT; Vercel cron is UTC-only — no DST handling). Vercel attaches
   `Authorization: Bearer $CRON_SECRET` automatically. **Vercel Hobby limits cron frequency**
   (≈once/day) — hourly, timezone-aware coverage needs Pro.

## 5. End-to-end verification (you as customer #1)

1. `pnpm dev`, open `http://localhost:3000`, **Sign in with GitHub**.
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
