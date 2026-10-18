import {
  collections,
  createResendDeliverer,
  failureStreak,
  findAccountFeedback,
  findFailedDispatches,
  PAUSE_AFTER_GAVE_UP_DAYS,
} from "@dailyscribe/core";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Once-a-day operator report to `ADMIN_EMAIL`: new waitlist signups (so the
 * operator knows when to run `apps/web/scripts/approve-waitlist.mjs`) and any
 * scheduled deliveries that gave up in the same window (`dispatchAttempts`). Only
 * the first day of a failure run, and the day it got paused, are listed in full;
 * days in between collapse to one "still failing" line, and don't send an email
 * on their own. Triggered the same way as `/api/cron/dispatch` (a GitHub Actions
 * workflow); sends nothing on a quiet day. Also lists users who stopped all
 * deliveries or deleted their account, with their "what didn't work?" answer. The fixed 24h window is naturally idempotent for a
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

  const { waitlist, users, subscriptions } = await collections();
  const since = new Date(Date.now() - WINDOW_MS);
  const [fresh, pendingTotal, failures, leavers] = await Promise.all([
    waitlist
      .find({ status: "pending", createdAt: { $gte: since } })
      .sort({ createdAt: 1 })
      .toArray(),
    waitlist.countDocuments({ status: "pending" }),
    findFailedDispatches(since),
    findAccountFeedback(since),
  ]);

  // Day N of a failure run: 1 is news, the day it paused is news, the rest are repeats.
  const pausedAt = new Map(
    (
      await subscriptions
        .find({ userId: { $in: [...new Set(failures.map((f) => f.userId))] }, pausedAt: { $exists: true } })
        .toArray()
    ).map((s) => [`${s.userId}:${s.service}`, s.pausedAt]),
  );
  const classified = await Promise.all(
    failures.map(async (f) => {
      const day = await failureStreak(f.userId, f.service, pausedAt.get(`${f.userId}:${f.service}`), f.puzzleDate);
      return { f, day, isNew: Boolean(f.paused) || day <= 1 };
    }),
  );
  const newFailures = classified.filter((c) => c.isNew);
  const repeats = classified.filter((c) => !c.isNew);

  if (fresh.length === 0 && newFailures.length === 0 && leavers.length === 0) {
    return NextResponse.json({ new: fresh.length, pending: pendingTotal, failed: 0, repeats: repeats.length, left: 0 });
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
  if (newFailures.length > 0 || repeats.length > 0) {
    const ids = failures.map((f) => f.userId).filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    const emails = new Map(
      (await users.find({ _id: { $in: ids } }, { projection: { email: 1 } }).toArray()).map((u) => [
        String(u._id),
        u.email ?? "?",
      ]),
    );
    const lines: string[] = [];
    if (newFailures.length > 0) {
      lines.push(
        `${newFailures.length} scheduled deliver${newFailures.length === 1 ? "y" : "ies"} gave up in the last 24h:`,
        "",
        ...newFailures.map(({ f, day }) => {
          const notes = [f.paused ? `PAUSED after ${day} days` : "", f.userNotifiedAt ? "user emailed" : ""].filter(
            Boolean,
          );
          const suffix = notes.length > 0 ? ` (${notes.join(", ")})` : "";
          return `  ${f.puzzleDate}  ${f.service}  ${emails.get(f.userId) ?? f.userId}  x${f.attempts}${suffix}\n      ${f.lastError ?? "no error recorded (run killed mid-send?)"}`;
        }),
      );
    }
    if (repeats.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push(
        `Still failing, already reported (pauses after ${PAUSE_AFTER_GAVE_UP_DAYS} days):`,
        ...repeats.map(({ f, day }) => `  ${f.service}  ${emails.get(f.userId) ?? f.userId}  day ${day}`),
      );
    }
    sections.push(lines.join("\n"));
  }
  if (leavers.length > 0) {
    const ids = leavers.map((l) => l.userId).filter((id): id is string => !!id && ObjectId.isValid(id));
    const emails = new Map(
      (await users.find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }, { projection: { email: 1 } }).toArray()).map(
        (u) => [String(u._id), u.email ?? "?"],
      ),
    );
    const rows = leavers.map((l) => {
      const who =
        l.kind === "delete"
          ? `deleted account (joined ${l.joinedAt?.toISOString().slice(0, 10) ?? "?"})`
          : `${(l.userId && emails.get(l.userId)) ?? "since-deleted user"} stopped all deliveries`;
      const had = l.services.length > 0 ? l.services.join(", ") : "nothing on";
      return `  ${who}; had: ${had}\n      ${l.reason ? `"${l.reason}"` : "(no reason given)"}`;
    });
    sections.push([`${leavers.length} user${leavers.length === 1 ? "" : "s"} left in the last 24h:`, "", ...rows].join("\n"));
  }
  const text = sections.join("\n\n");
  const subjectParts = [
    fresh.length > 0 ? `${fresh.length} new waitlist signup${plural}` : "",
    newFailures.length > 0 ? `${newFailures.length} failed deliver${newFailures.length === 1 ? "y" : "ies"}` : "",
    leavers.length > 0 ? `${leavers.length} left` : "",
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

  return NextResponse.json({ new: fresh.length, pending: pendingTotal, failed: newFailures.length, repeats: repeats.length, left: leavers.length });
}
