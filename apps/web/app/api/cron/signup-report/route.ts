import { collections, createResendDeliverer, findFailedDispatches } from "@dailyscribe/core";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Once-a-day operator report to `ADMIN_EMAIL`: new waitlist signups (so the
 * operator knows when to run `apps/web/scripts/approve-waitlist.mjs`) and any
 * scheduled deliveries that gave up in the same window (`dispatchAttempts`). Triggered
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

  const { waitlist, users } = await collections();
  const since = new Date(Date.now() - WINDOW_MS);
  const [fresh, pendingTotal, failures] = await Promise.all([
    waitlist
      .find({ status: "pending", createdAt: { $gte: since } })
      .sort({ createdAt: 1 })
      .toArray(),
    waitlist.countDocuments({ status: "pending" }),
    findFailedDispatches(since),
  ]);

  if (fresh.length === 0 && failures.length === 0) {
    return NextResponse.json({ new: 0, pending: pendingTotal, failed: 0 });
  }

  const sections: string[] = [];
  const plural = fresh.length === 1 ? "" : "s";
  if (fresh.length > 0) {
    const rows = fresh.map((w) => {
      const date = w.createdAt.toISOString().slice(0, 10);
      const ref = w.ref ? `  [${w.ref}]` : "";
      const note = w.note ? `  — ${w.note}` : "";
      return `  ${date}  ${w.email}${ref}${note}`;
    });
    sections.push(
      [
        `${fresh.length} new waitlist signup${plural} in the last 24h:`,
        "",
        ...rows,
        "",
        `${pendingTotal} pending in total.`,
        "",
        `Approve: cd apps/web && npx tsx scripts/approve-waitlist.mjs --batch ${Math.min(fresh.length, 5)}`,
      ].join("\n"),
    );
  }
  if (failures.length > 0) {
    const ids = failures.map((f) => f.userId).filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    const emails = new Map(
      (await users.find({ _id: { $in: ids } }, { projection: { email: 1 } }).toArray()).map((u) => [
        String(u._id),
        u.email ?? "?",
      ]),
    );
    const rows = failures.map((f) => {
      const notified = f.userNotifiedAt ? " (user emailed)" : "";
      return `  ${f.puzzleDate}  ${f.service}  ${emails.get(f.userId) ?? f.userId}  x${f.attempts}${notified}\n      ${f.lastError ?? "no error recorded (run killed mid-send?)"}`;
    });
    sections.push(
      [`${failures.length} scheduled deliver${failures.length === 1 ? "y" : "ies"} gave up in the last 24h:`, "", ...rows].join(
        "\n",
      ),
    );
  }
  const text = sections.join("\n\n");
  const subjectParts = [
    fresh.length > 0 ? `${fresh.length} new waitlist signup${plural}` : "",
    failures.length > 0 ? `${failures.length} failed deliver${failures.length === 1 ? "y" : "ies"}` : "",
  ].filter(Boolean);

  const mailer = createResendDeliverer({
    apiKey,
    from: process.env.MAIL_FROM_DEFAULT ?? "Daily Scribe <my@dailyscribe.ca>",
  });
  await mailer.deliver({
    to,
    subject: `Daily Scribe — ${subjectParts.join(", ")}`,
    text,
    assets: [],
  });

  return NextResponse.json({ new: fresh.length, pending: pendingTotal, failed: failures.length });
}
