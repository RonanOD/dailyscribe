import { ObjectId } from "mongodb";
import { Resend } from "resend";
import { collections, getDb } from "./db";
import type { AppUser, NudgeKind } from "./types";
import { isKindleAddress } from "./validation";

const APP_URL = "https://my.dailyscribe.ca";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Unused invites get the automatic reminder this long after approval. */
export const INVITE_REMINDER_AFTER_MS = 4 * DAY_MS;
/** Signed-in users with no services get "finish setup" this long after signing in. */
export const FINISH_SETUP_AFTER_MS = 2 * DAY_MS;
/** Invites approved before this were covered by the one-off `reinvite` send,
 *  which promised no further reminders, so the automatic one skips them. */
export const INVITE_REMINDER_SINCE = new Date("2026-10-12T00:00:00Z");

export interface NudgeEmail {
  subject: string;
  text: string;
}

/** One line reminding an invitee why they signed up, keyed by waitlist `ref`. */
export function refLine(ref?: string): string {
  // Strip stray punctuation from hand-pasted links, e.g. "reddit-kindlescribe]".
  const slug = (ref ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  switch (slug) {
    case "reddit-soloroleplaying":
      return (
        "You found it through the solo roleplaying thread. The D&D campaign arrives as a\n" +
        "page you mark up on your Scribe and mail back, and the story continues from your\n" +
        "choices the next day."
      );
    case "reddit-kindlescribe":
      return (
        "You found it through r/kindlescribe. The idea is simple: a fresh PDF on your\n" +
        "Scribe every morning, ready to read and write on."
      );
    case "reddit-ereader":
      return (
        "You found it through r/ereader. It works with any e-reader that accepts\n" +
        "documents by email, not just Kindle."
      );
    default:
      return (
        "Daily Scribe sends a fresh PDF to your Kindle every morning: news, puzzles,\n" +
        "or practice pages you can write on."
      );
  }
}

export function nudgeEmail(kind: NudgeKind, ref?: string): NudgeEmail {
  switch (kind) {
    case "reinvite":
      return {
        subject: "Your first Daily Scribe edition is waiting",
        text: [
          "Hi,",
          "",
          "A little while ago you joined the Daily Scribe waitlist. Your spot has been",
          "open since then, but you haven't signed in yet, so here's a second nudge in",
          "case the first email got buried.",
          "",
          refLine(ref),
          "",
          "Setting up takes about two minutes:",
          "",
          `  1. Sign in: ${APP_URL}`,
          "  2. Pick what you'd like each morning (news, a crossword, kanji practice,",
          "     a solo D&D campaign, or a mix bundled into one PDF)",
          "  3. Approve my@dailyscribe.ca in your Amazon settings so it can reach",
          "     your Kindle",
          "",
          "Your first edition arrives the next morning at the time you choose.",
          "",
          "It's free, and if it isn't for you, just ignore this. You won't get",
          "a third email from me about it.",
          "",
          "Ronan",
          "Daily Scribe",
          "",
          "P.S. Questions or stuck on the Kindle step? Just reply, it comes straight to me.",
        ].join("\n"),
      };
    case "inviteReminder":
      return {
        subject: "Still want your Daily Scribe edition?",
        text: [
          "Hi,",
          "",
          "Your Daily Scribe invite from a few days ago hasn't been used yet. Your",
          `spot is still open: ${APP_URL}`,
          "",
          "Setup takes about two minutes, and your first edition arrives the next",
          "morning.",
          "",
          "If now's not a good time, no problem. This is the only reminder I'll send.",
          "",
          "Ronan",
          "",
          "P.S. Reply if anything got in the way. I read every one.",
        ].join("\n"),
      };
    case "finishSetup":
      return {
        subject: "One step left for your Daily Scribe edition",
        text: [
          "Hi,",
          "",
          "You signed in to Daily Scribe but haven't picked anything to receive yet,",
          "so nothing's on its way to your Kindle.",
          "",
          `Pick up where you left off: ${APP_URL}/onboarding`,
          "",
          "If something made you stop (the Kindle approval step, a missing service,",
          "anything confusing), I'd really like to know. Just reply and tell me. It",
          "helps me fix it for the next person.",
          "",
          "Ronan",
        ].join("\n"),
      };
  }
}

export interface NudgeCandidate {
  user: AppUser;
  email: string;
  ref?: string;
}

/**
 * Users eligible for `kind` right now. "Signed in" means any trace of a real
 * sign-in: a verified email (magic link), a linked OAuth account, or a session.
 * Approved-but-unused invites are stub rows with none of these.
 */
export async function findNudgeCandidates(kind: NudgeKind, now: Date): Promise<NudgeCandidate[]> {
  const db = await getDb();
  const { users, subscriptions, waitlist } = await collections();
  const accounts = await db
    .collection<{ _id: ObjectId; userId: ObjectId }>("accounts")
    .find({}, { projection: { userId: 1 } })
    .toArray();
  const accountByUser = new Map(accounts.map((a) => [String(a.userId), a._id.getTimestamp()]));
  const sessionUsers = new Set(
    (await db.collection("sessions").distinct("userId")).map((id: unknown) => String(id)),
  );
  const subscribed = new Set(await subscriptions.distinct("userId"));
  const approvedAt = new Map(
    (await waitlist.find({ status: "approved" }).toArray()).map((w) => [w.email, w.approvedAt]),
  );

  const out: NudgeCandidate[] = [];
  for (const user of await users.find({ [`nudges.${kind}`]: { $exists: false } }).toArray()) {
    const email = user.email;
    if (!email || isKindleAddress(email)) continue; // a Kindle inbox can't show a plain-text email
    const id = String(user._id);
    const signedIn = !!user.emailVerified || accountByUser.has(id) || sessionUsers.has(id);

    if (kind === "reinvite") {
      if (signedIn || user.nudges?.inviteReminder) continue;
    } else if (kind === "inviteReminder") {
      const invited = approvedAt.get(email);
      if (signedIn || user.nudges?.reinvite || !invited) continue;
      if (invited < INVITE_REMINDER_SINCE || now.getTime() - invited.getTime() < INVITE_REMINDER_AFTER_MS) continue;
    } else {
      if (!signedIn || subscribed.has(id)) continue;
      const signedInAt = user.emailVerified ?? accountByUser.get(id) ?? user._id.getTimestamp();
      if (now.getTime() - signedInAt.getTime() < FINISH_SETUP_AFTER_MS) continue;
    }
    out.push({ user, email, ref: user.ref });
  }
  return out;
}

export interface NudgeSender {
  resend: Resend;
  /** Bare address the email comes from, e.g. "my@dailyscribe.ca". */
  fromAddress: string;
  replyTo?: string;
}

/** Sender config from env: same verified address as deliveries, under Ronan's name.
 *  Real sends require MAIL_REPLY_TO: without it, replies would land on the
 *  inbound mail-back address (my@) instead of a person. */
export function nudgeSenderFromEnv({ requireReplyTo = true } = {}): NudgeSender {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
  if (requireReplyTo && !process.env.MAIL_REPLY_TO) throw new Error("MAIL_REPLY_TO is not set.");
  const from = process.env.MAIL_FROM_DEFAULT ?? "Daily Scribe <my@dailyscribe.ca>";
  const fromAddress = from.match(/<([^>]+)>/)?.[1] ?? from;
  return { resend: new Resend(apiKey), fromAddress, replyTo: process.env.MAIL_REPLY_TO || undefined };
}

/** Plain-text email from Ronan, with replies routed to MAIL_REPLY_TO. Also used
 *  for delivery-failure alerts (dispatch-attempts.ts). */
export async function sendPlainEmail(sender: NudgeSender, to: string, email: NudgeEmail): Promise<void> {
  const { error } = await sender.resend.emails.send({
    from: `Ronan at Daily Scribe <${sender.fromAddress}>`,
    to,
    subject: email.subject,
    text: email.text,
    ...(sender.replyTo ? { replyTo: sender.replyTo } : {}),
  });
  if (error) throw new Error(`Resend send failed: ${error.name}: ${error.message}`);
}

/** Send one sample of `kind` to `to` without touching any user record. */
export async function sendTestNudge(sender: NudgeSender, kind: NudgeKind, to: string, ref?: string) {
  await sendPlainEmail(sender, to, nudgeEmail(kind, ref));
}

/**
 * Send `kind` to one user, at most once ever: the `nudges.<kind>` stamp is
 * claimed atomically before sending and released if the send fails, so
 * overlapping runs can't double-send and a transient failure retries later.
 */
export async function sendNudge(
  sender: NudgeSender,
  kind: NudgeKind,
  candidate: NudgeCandidate,
  now: Date,
): Promise<"sent" | "already-sent"> {
  const { users } = await collections();
  const field = `nudges.${kind}`;
  const claim = await users.updateOne(
    { _id: candidate.user._id, [field]: { $exists: false } },
    { $set: { [field]: now } },
  );
  if (claim.modifiedCount === 0) return "already-sent";
  try {
    await sendPlainEmail(sender, candidate.email, nudgeEmail(kind, candidate.ref));
    return "sent";
  } catch (err) {
    await users.updateOne({ _id: candidate.user._id }, { $unset: { [field]: "" } });
    throw err;
  }
}

export interface AutoNudgeResult {
  kind: NudgeKind;
  email: string;
  status: "sent" | "already-sent" | "failed";
  error?: string;
}

/**
 * The automatic nudges, run from the dispatch cron. Off unless
 * ONBOARDING_NUDGES_ENABLED="true". Capped per run so a backlog can't eat the
 * dispatch function's time budget; the rest go out on later runs.
 */
export async function runAutoNudges(now: Date, maxPerRun = 10): Promise<AutoNudgeResult[]> {
  if (process.env.ONBOARDING_NUDGES_ENABLED !== "true") return [];
  const sender = nudgeSenderFromEnv();
  const results: AutoNudgeResult[] = [];
  for (const kind of ["inviteReminder", "finishSetup"] as const) {
    for (const candidate of await findNudgeCandidates(kind, now)) {
      if (results.length >= maxPerRun) return results;
      try {
        results.push({ kind, email: candidate.email, status: await sendNudge(sender, kind, candidate, now) });
      } catch (err) {
        results.push({ kind, email: candidate.email, status: "failed", error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return results;
}
