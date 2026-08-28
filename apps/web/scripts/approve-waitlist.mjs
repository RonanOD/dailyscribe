#!/usr/bin/env -S npx tsx
/**
 * Approve people off the waitlist. Approval = seeding their email into the
 * `users` collection, which is exactly what apps/web/auth.ts's signIn gate
 * checks (ALLOW_NEW_SIGNUPS stays "false"). Optionally emails them an invite.
 *
 * Must run under tsx (imports @dailyscribe/core, shipped as raw TS source).
 * Reads MONGODB_URI / MONGODB_DB / RESEND_API_KEY / MAIL_FROM_DEFAULT from
 * apps/web/.env.local (not auto-loaded, so this script loads it itself).
 *
 * Usage (from apps/web):
 *   npx tsx scripts/approve-waitlist.mjs --list            # show pending
 *   npx tsx scripts/approve-waitlist.mjs a@x.com b@y.com   # approve these
 *   npx tsx scripts/approve-waitlist.mjs --batch 5         # approve 5 oldest pending
 *   npx tsx scripts/approve-waitlist.mjs --batch 5 --no-email
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resend } from "resend";
import { collections, getDb, isEmailShaped } from "@dailyscribe/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = path.join(__dirname, "../.env.local");
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const SIGN_IN_URL = "https://my.dailyscribe.ca";

function inviteEmail(to, from) {
  return {
    from,
    to,
    subject: "Your Daily Scribe invite is ready",
    text: [
      "You asked to try Daily Scribe — you're in.",
      "",
      `Sign in here to set up your first edition: ${SIGN_IN_URL}`,
      "",
      "Use the same sign-in method each time (email link, Google, or GitHub).",
      "During setup you'll add my@dailyscribe.ca to your Kindle's approved",
      "sender list — that's the only address Daily Scribe ever sends from.",
      "",
      "— Daily Scribe",
    ].join("\n"),
  };
}

async function main() {
  loadEnvLocal();

  const args = process.argv.slice(2);
  const noEmail = args.includes("--no-email");
  const listOnly = args.includes("--list");
  const batchIdx = args.indexOf("--batch");
  const batchN = batchIdx !== -1 ? Number(args[batchIdx + 1]) : 0;
  const emailArgs = args.filter((a) => !a.startsWith("--") && a !== String(batchN));

  const { waitlist } = await collections();
  const db = await getDb();
  const users = db.collection("users");

  if (listOnly) {
    const pending = await waitlist.find({ status: "pending" }).sort({ createdAt: 1 }).toArray();
    console.log(`${pending.length} pending:`);
    for (const w of pending) {
      console.log(`  ${w.createdAt.toISOString().slice(0, 10)}  ${w.email}${w.ref ? `  [${w.ref}]` : ""}${w.note ? `  — ${w.note}` : ""}`);
    }
    process.exit(0);
  }

  let targets = emailArgs.map((e) => e.trim().toLowerCase()).filter(isEmailShaped);
  if (batchN > 0) {
    const oldest = await waitlist
      .find({ status: "pending" })
      .sort({ createdAt: 1 })
      .limit(batchN)
      .toArray();
    targets = targets.concat(oldest.map((w) => w.email));
  }
  targets = [...new Set(targets)];

  if (targets.length === 0) {
    console.error("Nothing to approve. Pass emails, or --batch N, or --list.");
    process.exit(1);
  }

  let resend = null;
  let from = process.env.MAIL_FROM_DEFAULT ?? "Daily Scribe <my@dailyscribe.ca>";
  if (!noEmail) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.error("RESEND_API_KEY not set — re-run with --no-email to skip invites.");
      process.exit(1);
    }
    resend = new Resend(key);
  }

  for (const email of targets) {
    const entry = await waitlist.findOne({ email });
    const res = await users.updateOne(
      { email },
      { $setOnInsert: { email, emailVerified: null, ...(entry?.ref ? { ref: entry.ref } : {}) } },
      { upsert: true },
    );
    const seeded = res.upsertedCount > 0 ? "seeded" : "already in users";
    await waitlist.updateOne(
      { email },
      { $set: { status: "approved", approvedAt: new Date() }, $setOnInsert: { email, createdAt: new Date() } },
      { upsert: true },
    );

    let mailed = "no email";
    if (resend) {
      const { error } = await resend.emails.send(inviteEmail(email, from));
      mailed = error ? `email FAILED: ${error.message}` : "invite sent";
    }
    console.log(`  ${email}: ${seeded}, ${mailed}`);
  }

  console.log(`\nApproved ${targets.length}. ALLOW_NEW_SIGNUPS stays "false" — only these emails can now sign in.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
