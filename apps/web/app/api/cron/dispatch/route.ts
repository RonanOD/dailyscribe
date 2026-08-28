import { ensureIndexes } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { dispatchDue } from "@/lib/runner";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Invoked by Vercel Cron. When CRON_SECRET is set, Vercel sends it as a Bearer
 * token; reject anything else so the endpoint can't be triggered by the public.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Memoised per process — cheap on every run after the first, and keeps the
  // idempotency / TTL indexes in place without a separate deploy step.
  await ensureIndexes().catch((err) => console.error("ensureIndexes failed:", err));

  const results = await dispatchDue(new Date());
  return NextResponse.json({ ran: results.length, results });
}
