#!/usr/bin/env -S npx tsx
/**
 * One-off product announcements to users, as a plain-text email from Ronan
 * (same sender and MAIL_REPLY_TO as the onboarding nudges). Each announcement
 * reaches a user at most once: `users.announcements.<key>` is claimed before
 * sending and released if the send fails, so a re-run resumes where it stopped.
 *
 * Skipped: @kindle.com addresses (a Kindle can't show a plain email), users who
 * chose "Stop all deliveries" (accountFeedback kind "stop-all"), and --exclude.
 *
 *   npx tsx scripts/announce.mjs chess --dry-run              # who would get it
 *   npx tsx scripts/announce.mjs chess --test-to me@x.com     # one sample, no DB writes
 *   npx tsx scripts/announce.mjs chess [--exclude a@x.com,b@y.com]
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collections, isEmailShaped, isKindleAddress, nudgeSenderFromEnv, sendPlainEmail } from "@dailyscribe/core";

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

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const key = args[0];
  const announcement = ANNOUNCEMENTS[key];
  if (!announcement) throw new Error(`Usage: announce.mjs <${Object.keys(ANNOUNCEMENTS).join("|")}> [flags]`);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const dryRun = args.includes("--dry-run");
  const testTo = flag("--test-to");
  const exclude = new Set((flag("--exclude") ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));

  if (testTo) {
    await sendPlainEmail(nudgeSenderFromEnv(), testTo, announcement);
    console.log(`Sent a sample "${key}" announcement to ${testTo}.`);
    return;
  }

  const { users, accountFeedback } = await collections();
  const stopped = new Set(
    (await accountFeedback.find({ kind: "stop-all", userId: { $exists: true } }).toArray()).map((f) => f.userId),
  );
  const field = `announcements.${key}`;
  const all = await users.find({ [field]: { $exists: false } }).toArray();

  const skipped = { kindle: 0, stopped: 0, excluded: 0, invalid: 0 };
  const recipients = [];
  for (const u of all) {
    const email = (u.email ?? "").trim().toLowerCase();
    if (!isEmailShaped(email)) skipped.invalid++;
    else if (isKindleAddress(email)) skipped.kindle++;
    else if (stopped.has(String(u._id))) skipped.stopped++;
    else if (exclude.has(email)) skipped.excluded++;
    else recipients.push({ user: u, email, signedIn: Boolean(u.emailVerified) });
  }
  const signedIn = recipients.filter((r) => r.signedIn).length;
  console.log(
    `${recipients.length} recipients (${signedIn} have signed in, ${recipients.length - signedIn} never have). ` +
      `Skipped: ${JSON.stringify(skipped)}.`,
  );

  if (dryRun) {
    for (const r of recipients) console.log(`  ${r.email}${r.signedIn ? "" : "  (never signed in)"}`);
    return;
  }

  const sender = nudgeSenderFromEnv();
  let sent = 0;
  for (const r of recipients) {
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
