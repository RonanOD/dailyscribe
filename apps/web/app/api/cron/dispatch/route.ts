import { ensureIndexes } from "@dailyscribe/core";
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

  const results = await dispatchDue(new Date());
  return NextResponse.json({ ran: results.length, results });
}
