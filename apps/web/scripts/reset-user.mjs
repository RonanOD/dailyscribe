#!/usr/bin/env -S npx tsx
/**
 * Reset a user back to a fresh, pre-onboarding state so you can re-run the
 * /onboarding flow with the same account. Deletes their subscriptions, secrets,
 * delivery log, Kanji progress and send-test rate-limit buckets, and clears
 * `users.onboardedAt`. Does NOT delete the `users` row itself, so the invite /
 * sign-in gate is unaffected — they can sign straight back in.
 *
 * Must run under tsx (imports @dailyscribe/core, shipped as raw TS source).
 * Loads MONGODB_URI / MONGODB_DB from apps/web/.env.local itself.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/reset-user.mjs someone@example.com
 *   npx tsx scripts/reset-user.mjs someone@example.com --dry-run
 *   npx tsx scripts/reset-user.mjs someone@example.com --keep-secrets
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collections, getDb } from "@dailyscribe/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = path.join(__dirname, "../.env.local");
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

async function main() {
  loadEnvLocal();

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const keepSecrets = args.includes("--keep-secrets");
  const email = args
    .find((a) => !a.startsWith("--"))
    ?.trim()
    .toLowerCase();

  if (!email) {
    console.error("Usage: npx tsx scripts/reset-user.mjs <email> [--dry-run] [--keep-secrets]");
    process.exit(1);
  }

  const db = await getDb();
  const users = db.collection("users");
  const { userSecrets, subscriptions, deliveries, kanjiProgress, kanjiSubmissions, rateLimits } =
    await collections();

  const user = await users.findOne({ email });
  if (!user) {
    console.error(`No user with email ${email} — nothing to reset.`);
    process.exit(1);
  }
  const userId = user._id.toString();
  console.log(`${dryRun ? "[dry-run] " : ""}Resetting ${email} (userId ${userId})`);
  console.log(
    `  onboardedAt currently: ${user.onboardedAt ? user.onboardedAt.toISOString() : "unset"}`,
  );

  const plan = [
    ["subscriptions", subscriptions, { userId }],
    ...(keepSecrets ? [] : [["userSecrets", userSecrets, { userId }]]),
    ["deliveries", deliveries, { userId }],
    ["kanjiProgress", kanjiProgress, { userId }],
    ["kanjiSubmissions", kanjiSubmissions, { userId }],
    ["rateLimits", rateLimits, { key: { $regex: userId } }],
  ];

  for (const [name, coll, filter] of plan) {
    const count = await coll.countDocuments(filter);
    if (dryRun) {
      console.log(`  would delete ${count} from ${name}`);
    } else {
      const res = await coll.deleteMany(filter);
      console.log(`  deleted ${res.deletedCount} from ${name}`);
    }
  }

  if (dryRun) {
    console.log(`  would unset users.onboardedAt`);
  } else {
    await users.updateOne({ _id: user._id }, { $unset: { onboardedAt: "" } });
    console.log(`  unset users.onboardedAt`);
  }

  console.log(
    dryRun
      ? "\nDry run — nothing changed."
      : `\nDone. ${email} will hit /onboarding again on next visit to /dashboard.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
