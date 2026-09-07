import { collections, createResendDeliverer } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Once-a-day digest of new waitlist signups, emailed to `ADMIN_EMAIL` so the
 * operator knows when to run `apps/web/scripts/approve-waitlist.mjs`. Triggered
 * the same way as `/api/cron/dispatch` (a GitHub Actions workflow); sends
 * nothing on a quiet day. The fixed 24h window is naturally idempotent for a
 * fixed-time daily run — a missed run just omits that day's names, which are
 * still counted in the running "pending total".
 */
export async function GET(req: Request) {
  const unauthorized = cronAuthError(req);
  if (unauthorized) return unauthorized;

  const to = process.env.ADMIN_EMAIL;
  if (!to) {
    return NextResponse.json({ error: "ADMIN_EMAIL is not set" }, { status: 500 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY is not set" }, { status: 500 });
  }

  const { waitlist } = await collections();
  const since = new Date(Date.now() - WINDOW_MS);
  const [fresh, pendingTotal] = await Promise.all([
    waitlist
      .find({ status: "pending", createdAt: { $gte: since } })
      .sort({ createdAt: 1 })
      .toArray(),
    waitlist.countDocuments({ status: "pending" }),
  ]);

  if (fresh.length === 0) {
    return NextResponse.json({ new: 0, pending: pendingTotal });
  }

  const plural = fresh.length === 1 ? "" : "s";
  const rows = fresh.map((w) => {
    const date = w.createdAt.toISOString().slice(0, 10);
    const ref = w.ref ? `  [${w.ref}]` : "";
    const note = w.note ? `  — ${w.note}` : "";
    return `  ${date}  ${w.email}${ref}${note}`;
  });
  const text = [
    `${fresh.length} new waitlist signup${plural} in the last 24h:`,
    "",
    ...rows,
    "",
    `${pendingTotal} pending in total.`,
    "",
    `Approve: cd apps/web && npx tsx scripts/approve-waitlist.mjs --batch ${Math.min(fresh.length, 5)}`,
  ].join("\n");

  const mailer = createResendDeliverer({
    apiKey,
    from: process.env.MAIL_FROM_DEFAULT ?? "Daily Scribe <my@dailyscribe.ca>",
  });
  await mailer.deliver({
    to,
    subject: `Daily Scribe — ${fresh.length} new waitlist signup${plural}`,
    text,
    assets: [],
  });

  return NextResponse.json({ new: fresh.length, pending: pendingTotal });
}
