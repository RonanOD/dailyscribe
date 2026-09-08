#!/usr/bin/env -S npx tsx
/**
 * Manage the waitlist. Approval = seeding an email into the `users` collection,
 * which is exactly what apps/web/auth.ts's signIn gate checks (ALLOW_NEW_SIGNUPS
 * stays "false"). A row is only marked `approved` / seeded once its invite has
 * actually been sent (or with --no-email), so a bad address can't leave
 * half-approved state.
 *
 * Must run under tsx (imports @dailyscribe/core, shipped as raw TS source).
 * Reads MONGODB_URI / MONGODB_DB / RESEND_API_KEY / MAIL_FROM_DEFAULT from
 * apps/web/.env.local (not auto-loaded, so this script loads it itself).
 *
 * Usage (from apps/web):
 *   npx tsx scripts/approve-waitlist.mjs --list                 # show pending
 *   npx tsx scripts/approve-waitlist.mjs a@x.com b@y.com        # approve these
 *   npx tsx scripts/approve-waitlist.mjs --batch 5              # approve 5 oldest pending
 *   npx tsx scripts/approve-waitlist.mjs --batch 5 --no-email   # ...without inviting
 *   npx tsx scripts/approve-waitlist.mjs --decline a@x.com      # mark junk rows "declined"
 *   npx tsx scripts/approve-waitlist.mjs --remove a@x.com       # hard-delete from waitlist + users
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

// RFC-2606 / RFC-6761 reserved names, plus localhost — mail to these can never
// be delivered, so never seed or approve them (Resend also hard-rejects
// example.*). Genuine-looking junk (a real throwaway domain) still gets through;
// use --decline / --remove for that.
const UNDELIVERABLE_DOMAINS = new Set(["example.com", "example.net", "example.org", "localhost"]);
const UNDELIVERABLE_TLDS = ["test", "invalid", "local", "localhost", "example"];

function isUndeliverable(email) {
  const at = email.lastIndexOf("@");
  if (at === -1) return true;
  const domain = email.slice(at + 1);
  if (UNDELIVERABLE_DOMAINS.has(domain)) return true;
  const tld = domain.split(".").pop();
  return UNDELIVERABLE_TLDS.includes(tld);
}

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
  const declineMode = args.includes("--decline");
  const removeMode = args.includes("--remove");
  const batchIdx = args.indexOf("--batch");
  const batchN = batchIdx !== -1 ? Number(args[batchIdx + 1]) : 0;

  // Bare (non-flag) args, minus the number consumed by --batch.
  const bareArgs = args.filter(
    (a, i) => !a.startsWith("--") && !(batchIdx !== -1 && i === batchIdx + 1),
  );
  const emails = [...new Set(bareArgs.map((e) => e.trim().toLowerCase()))];
  const validEmails = emails.filter(isEmailShaped);
  for (const bad of emails.filter((e) => !isEmailShaped(e))) {
    console.warn(`  ignoring "${bad}" — not an email address`);
  }

  const { waitlist } = await collections();
  const db = await getDb();
  const users = db.collection("users");

  if (listOnly) {
    const pending = await waitlist.find({ status: "pending" }).sort({ createdAt: 1 }).toArray();
    console.log(`${pending.length} pending:`);
    for (const w of pending) {
      console.log(
        `  ${w.createdAt.toISOString().slice(0, 10)}  ${w.email}` +
          `${w.ref ? `  [${w.ref}]` : ""}${w.note ? `  — ${w.note}` : ""}`,
      );
    }
    process.exit(0);
  }

  if (removeMode) {
    if (validEmails.length === 0) {
      console.error("--remove needs one or more email addresses.");
      process.exit(1);
    }
    for (const email of validEmails) {
      const w = await waitlist.deleteOne({ email });
      const u = await users.deleteOne({ email });
      console.log(
        `  ${email}: removed from waitlist (${w.deletedCount}) and users (${u.deletedCount})`,
      );
    }
    process.exit(0);
  }

  if (declineMode) {
    if (validEmails.length === 0) {
      console.error("--decline needs one or more email addresses.");
      process.exit(1);
    }
    for (const email of validEmails) {
      const res = await waitlist.updateOne(
        { email },
        { $set: { status: "declined", declinedAt: new Date() } },
      );
      console.log(`  ${email}: ${res.matchedCount ? "declined" : "no waitlist row"}`);
    }
    process.exit(0);
  }

  // --- approve mode ---
  let targets = [...validEmails];
  if (batchN > 0) {
    const oldest = await waitlist
      .find({ status: "pending" })
      .sort({ createdAt: 1 })
      .limit(batchN)
      .toArray();
    targets = targets.concat(oldest.map((w) => w.email));
  }
  targets = [...new Set(targets)];

  const skipped = targets.filter(isUndeliverable);
  targets = targets.filter((e) => !isUndeliverable(e));
  for (const email of skipped) {
    console.log(`  ${email}: skipped — undeliverable domain (use --remove to clear it)`);
  }

  if (targets.length === 0) {
    console.error("Nothing to approve. Pass emails, or --batch N, or --list.");
    process.exit(1);
  }

  let resend = null;
  const from = process.env.MAIL_FROM_DEFAULT ?? "Daily Scribe <my@dailyscribe.ca>";
  if (!noEmail) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.error("RESEND_API_KEY not set — re-run with --no-email to skip invites.");
      process.exit(1);
    }
    resend = new Resend(key);
  }

  let approved = 0;
  for (const email of targets) {
    const entry = await waitlist.findOne({ email });

    // Send first: only seed + mark approved once the invite has actually gone
    // out, so a rejected address stays `pending` instead of half-approved.
    if (resend) {
      const { error } = await resend.emails.send(inviteEmail(email, from));
      if (error) {
        console.log(`  ${email}: NOT approved — invite send failed: ${error.message}`);
        continue;
      }
    }

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
    approved += 1;
    console.log(`  ${email}: ${seeded}, ${resend ? "invite sent" : "no email"}`);
  }

  console.log(
    `\nApproved ${approved}${approved !== targets.length ? ` of ${targets.length}` : ""}. ` +
      `ALLOW_NEW_SIGNUPS stays "false" — only seeded emails can sign in.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
