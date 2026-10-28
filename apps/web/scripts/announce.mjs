#!/usr/bin/env -S npx tsx
/**
 * One-off product announcements to users, as a plain-text email from Ronan
 * (same sender and MAIL_REPLY_TO as the onboarding nudges). Each announcement
 * reaches a user at most once: `users.announcements.<key>` is claimed before
 * sending and released if the send fails, so a re-run resumes where it stopped.
 *
 * Skipped: @kindle.com addresses (a Kindle can't show a plain email), users who
 * chose "Stop all deliveries" (accountFeedback kind "stop-all"), and --exclude.
 * --active-only also skips invitees who never used the service (no email
 * sign-in, no linked OAuth account, no subscriptions): they've already had
 * the invite and activation nudges, and spam complaints hurt the shared sender.
 *
 * Every email here counts against the same Resend daily quota as the Kindle
 * deliveries, so a real send requires --limit: check today's usage in Resend,
 * leave room for the rest of the day's editions, and resume tomorrow (stamped
 * users are skipped on re-runs).
 *
 *   npx tsx scripts/announce.mjs chess --dry-run [--active-only]   # who would get it
 *   npx tsx scripts/announce.mjs chess --test-to me@x.com          # one sample, no DB writes
 *   npx tsx scripts/announce.mjs chess --limit 40 [--active-only] [--exclude a@x.com,b@y.com]
 *
 * --kindle-pdf <edition-announcement-id> is a win-back mode instead: it sends the
 * one-page "What's new" PDF (EDITION_ANNOUNCEMENTS in packages/core/src/
 * announcements.ts) to the Kindle of every lapsed user, meaning they've had at
 * least one edition but have no service switched on now. Same skips as above,
 * plus Kindle addresses that ever bounced or complained. Stamped as
 * `announcements.kindle:<id>`, so each user gets it once. It renders the PDF
 * with the app's .tsx renderer, so run it through the scripts tsconfig:
 *
 *   TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/announce.mjs --kindle-pdf 2026-10-feeds-chess --dry-run
 *   TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/announce.mjs --kindle-pdf 2026-10-feeds-chess --test-to you@kindle.com
 *   TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx scripts/announce.mjs --kindle-pdf 2026-10-feeds-chess --limit 20
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collections,
  createResendDeliverer,
  EDITION_ANNOUNCEMENTS,
  getDb,
  isEmailShaped,
  isKindleAddress,
  nudgeSenderFromEnv,
  sendPlainEmail,
} from "@dailyscribe/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const text = readFileSync(path.join(__dirname, "../.env.local"), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const ANNOUNCEMENTS = {
  chess: {
    subject: "New on Daily Scribe: daily chess puzzles",
    text: `Hi,

There's a new section in Daily Scribe: Chess Puzzles.

Each day you get one to four puzzles from the Lichess puzzle database, picked for your level, from Beginner (under 1200) to Expert (2400+). Each puzzle shows the board from your side, whose move it is, and the task, like "Mate in 2". Work it out with the pen, then turn past a spacer page for the solution and a link to replay it on Lichess.

To add it, open the Chess tab on your dashboard, pick a level, and tick Enabled:
https://my.dailyscribe.ca/dashboard?tab=chess

If you get a digest, the puzzles arrive in the same email as everything else.

Thanks to Lichess for making their puzzles free for everyone.

Ronan
Daily Scribe

P.S. Just hit reply if you have feedback, or if you'd rather not get emails like this.
`,
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WIN_BACK_INTRO =
  "Since your last edition, a few things have arrived. If any of them appeal, your account is still there.";
const WIN_BACK_FOOTER =
  "To start your edition again, sign in at my.dailyscribe.ca and switch a section on. This is a one-off page; we won't send another.";

/** The win-back PDF: just the new sections (a lapsed user has none on). "with"
 *  items are left out: subscription rows exist for services a user never
 *  switched on, so they can't tell us what someone actually used. */
function winBackAnnouncement(announcement) {
  const items = announcement.items.filter((i) => (i.audience ?? "without") !== "with");
  return { ...announcement, intro: WIN_BACK_INTRO, items };
}

async function kindlePdf(id, args, flag) {
  const announcement = EDITION_ANNOUNCEMENTS.find((a) => a.id === id);
  if (!announcement) {
    throw new Error(`Unknown announcement "${id}". Known: ${EDITION_ANNOUNCEMENTS.map((a) => a.id).join(", ")}`);
  }
  const { renderAnnouncementPdf } = await import("../lib/plugins/announcement-page.tsx");
  const dryRun = args.includes("--dry-run");
  const limit = Number(flag("--limit"));
  const testTo = flag("--test-to");
  const exclude = new Set((flag("--exclude") ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
  const deliverer = createResendDeliverer({
    apiKey,
    from: process.env.MAIL_FROM_DEFAULT ?? "Daily Scribe <my@dailyscribe.ca>",
  });
  const send = async (to) => {
    const asset = await renderAnnouncementPdf(winBackAnnouncement(announcement), { footer: WIN_BACK_FOOTER });
    await deliverer.deliver({
      to,
      subject: `${announcement.heading}`,
      text: "What's new in Daily Scribe, on one page.",
      assets: [{ ...asset, filename: "whats-new-in-daily-scribe.pdf" }],
    });
  };

  if (testTo) {
    await send(testTo);
    console.log(`Sent a sample "${id}" win-back PDF to ${testTo}.`);
    return;
  }

  const { users, accountFeedback, subscriptions, deliveries, deliveryEvents } = await collections();
  const delivered = new Set(await deliveries.distinct("userId", { status: "success" }));
  const enabled = new Set(await subscriptions.distinct("userId", { enabled: true }));
  const stopped = new Set(
    (await accountFeedback.find({ kind: "stop-all", userId: { $exists: true } }).toArray()).map((f) => f.userId),
  );
  const badAddresses = new Set(
    (await deliveryEvents.distinct("to", { type: { $in: ["email.bounced", "email.complained"] } })).map((e) =>
      String(e).toLowerCase(),
    ),
  );
  const field = `announcements.kindle:${id}`;

  const skipped = { stopped: 0, excluded: 0, noKindle: 0, bounced: 0 };
  const recipients = [];
  for (const u of await users.find({ [field]: { $exists: false } }).toArray()) {
    const userId = String(u._id);
    if (!delivered.has(userId) || enabled.has(userId)) continue; // not lapsed
    if (stopped.has(userId)) {
      skipped.stopped++;
      continue;
    }
    const subs = await subscriptions.find({ userId }).sort({ createdAt: -1 }).toArray();
    const kindle = subs.map((s) => s.config?.kindleEmail?.trim().toLowerCase()).find(Boolean);
    if (!kindle || !isEmailShaped(kindle)) skipped.noKindle++;
    else if (badAddresses.has(kindle)) skipped.bounced++;
    else if (exclude.has(kindle) || exclude.has((u.email ?? "").toLowerCase())) skipped.excluded++;
    else recipients.push({ user: u, kindle });
  }
  console.log(`${recipients.length} lapsed users to win back. Skipped: ${JSON.stringify(skipped)}.`);

  if (dryRun) {
    for (const r of recipients) console.log(`  ${r.user.email ?? "(no email)"} -> ${r.kindle}`);
    return;
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Real sends need --limit N: these share the Resend daily quota with Kindle deliveries.");
  }

  let sent = 0;
  for (const r of recipients) {
    if (sent >= limit) {
      console.log(`Stopped at --limit ${limit}; ${recipients.length - sent} left for a later run.`);
      break;
    }
    const claim = await users.updateOne(
      { _id: r.user._id, [field]: { $exists: false } },
      { $set: { [field]: new Date() } },
    );
    if (claim.modifiedCount === 0) continue;
    try {
      await send(r.kindle);
      sent++;
      console.log(`  sent ${r.kindle}`);
    } catch (e) {
      await users.updateOne({ _id: r.user._id }, { $unset: { [field]: "" } });
      console.error(`  FAILED ${r.kindle}: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(600); // stay under Resend's per-second rate limit
  }
  console.log(`Done: ${sent} sent.`);
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  if (args[0] === "--kindle-pdf") {
    const flag = (name) => {
      const i = args.indexOf(name);
      return i === -1 ? undefined : args[i + 1];
    };
    return kindlePdf(args[1], args, flag);
  }
  const key = args[0];
  const announcement = ANNOUNCEMENTS[key];
  if (!announcement) throw new Error(`Usage: announce.mjs <${Object.keys(ANNOUNCEMENTS).join("|")}> [flags]`);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const dryRun = args.includes("--dry-run");
  const activeOnly = args.includes("--active-only");
  const limit = Number(flag("--limit"));
  const testTo = flag("--test-to");
  const exclude = new Set((flag("--exclude") ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));

  if (testTo) {
    await sendPlainEmail(nudgeSenderFromEnv(), testTo, announcement);
    console.log(`Sent a sample "${key}" announcement to ${testTo}.`);
    return;
  }

  const { users, accountFeedback, subscriptions } = await collections();
  const db = await getDb();
  const oauthLinked = new Set((await db.collection("accounts").distinct("userId")).map(String));
  const withSubs = new Set((await subscriptions.distinct("userId")).map(String));
  const stopped = new Set(
    (await accountFeedback.find({ kind: "stop-all", userId: { $exists: true } }).toArray()).map((f) => f.userId),
  );
  const field = `announcements.${key}`;
  const all = await users.find({ [field]: { $exists: false } }).toArray();

  const skipped = { kindle: 0, stopped: 0, excluded: 0, invalid: 0, neverActive: 0 };
  const recipients = [];
  for (const u of all) {
    const email = (u.email ?? "").trim().toLowerCase();
    if (!isEmailShaped(email)) skipped.invalid++;
    else if (isKindleAddress(email)) skipped.kindle++;
    else if (stopped.has(String(u._id))) skipped.stopped++;
    else if (exclude.has(email)) skipped.excluded++;
    else {
      const id = String(u._id);
      const active = Boolean(u.emailVerified) || oauthLinked.has(id) || withSubs.has(id);
      if (activeOnly && !active) skipped.neverActive++;
      else recipients.push({ user: u, email, active });
    }
  }
  const active = recipients.filter((r) => r.active).length;
  console.log(
    `${recipients.length} recipients (${active} have used the service, ${recipients.length - active} never have). ` +
      `Skipped: ${JSON.stringify(skipped)}.`,
  );

  if (dryRun) {
    for (const r of recipients) console.log(`  ${r.email}${r.active ? "" : "  (never used the service)"}`);
    return;
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Real sends need --limit N: these share the Resend daily quota with Kindle deliveries.");
  }

  const sender = nudgeSenderFromEnv();
  let sent = 0;
  for (const r of recipients) {
    if (sent >= limit) {
      console.log(`Stopped at --limit ${limit}; ${recipients.length - sent} left for a later run.`);
      break;
    }
    const claim = await users.updateOne(
      { _id: r.user._id, [field]: { $exists: false } },
      { $set: { [field]: new Date() } },
    );
    if (claim.modifiedCount === 0) continue;
    try {
      await sendPlainEmail(sender, r.email, announcement);
      sent++;
      console.log(`  sent ${r.email}`);
    } catch (e) {
      await users.updateOne({ _id: r.user._id }, { $unset: { [field]: "" } });
      console.error(`  FAILED ${r.email}: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(600); // stay under Resend's per-second rate limit
  }
  console.log(`Done: ${sent} sent.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
