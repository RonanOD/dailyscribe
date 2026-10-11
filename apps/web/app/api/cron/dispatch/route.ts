import { ensureIndexes, runAutoNudges } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron-auth";
import { dispatchDue } from "@/lib/runner";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Delivery dispatch. Polled every ~10 min by `.github/workflows/dispatch.yml`
 * (with a daily Vercel Cron as fallback); `dispatchDue` sends each subscription
 * once per day on the first run at or past the subscriber's local delivery
 * time. Guarded by `CRON_SECRET` — see `cronAuthError`.
 */
export async function GET(req: Request) {
  const unauthorized = cronAuthError(req);
  if (unauthorized) return unauthorized;

  // Memoised per process — cheap on every run after the first, and keeps the
  // idempotency / TTL indexes in place without a separate deploy step.
  await ensureIndexes().catch((err) => console.error("ensureIndexes failed:", err));

  const now = new Date();
  const results = await dispatchDue(now);

  // Activation emails ride along on the same tick (off unless
  // ONBOARDING_NUDGES_ENABLED="true"); a failure here never blocks deliveries.
  const nudges = await runAutoNudges(now).catch((err) => {
    console.error("runAutoNudges failed:", err);
    return [];
  });
  // Counts only: the nudge results carry user email addresses, which must not
  // land in the GitHub Actions log (public repo) that captures this response.
  const nudgeCounts: Record<string, number> = {};
  for (const n of nudges) {
    if (n.status === "failed") console.error(`nudge ${n.kind} to ${n.email} failed: ${n.error}`);
    nudgeCounts[`${n.kind}:${n.status}`] = (nudgeCounts[`${n.kind}:${n.status}`] ?? 0) + 1;
  }
  return NextResponse.json({ ran: results.length, results, nudges: nudgeCounts });
}
