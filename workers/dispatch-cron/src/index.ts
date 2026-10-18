/**
 * Drives Daily Scribe's delivery dispatch from a Cloudflare cron trigger.
 *
 * GitHub Actions `schedule` is best-effort: the `*\/10` dispatch workflow was
 * observed firing only 6-7 times a day, with 2-5 hour gaps, so editions went
 * out hours after the subscriber's chosen time (DAI-11). Cloudflare cron
 * triggers fire on schedule, so this Worker is now the primary driver. The
 * GitHub workflow and the daily Vercel Cron stay as fallbacks; extra calls are
 * harmless because `dispatchDue` sends at most once per subscription per day
 * (the `deliveries` marker row).
 */

interface Env {
  DISPATCH_URL: string;
  CRON_SECRET: string;
}

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 15_000;
// The dispatch route's maxDuration is 60s; leave headroom for a cold start.
const TIMEOUT_MS = 90_000;

async function dispatchOnce(env: Env): Promise<void> {
  const res = await fetch(env.DISPATCH_URL, {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`dispatch returned HTTP ${res.status}`);
  // Log counts only, never the body: nudge results can carry user emails.
  const body = (await res.json().catch(() => ({}))) as { ran?: number; nudges?: Record<string, number> };
  console.log(`dispatch ok: ran=${body.ran ?? "?"} nudges=${JSON.stringify(body.nudges ?? {})}`);
}

export default {
  async scheduled(_controller, env, _ctx) {
    if (!env.CRON_SECRET) throw new Error("CRON_SECRET secret is not set");
    for (let attempt = 1; ; attempt++) {
      try {
        return await dispatchOnce(env);
      } catch (err) {
        console.error(`dispatch attempt ${attempt}/${ATTEMPTS} failed:`, err);
        // Rethrow on the last attempt so the invocation shows as failed in Cloudflare.
        if (attempt >= ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  },
} satisfies ExportedHandler<Env>;
