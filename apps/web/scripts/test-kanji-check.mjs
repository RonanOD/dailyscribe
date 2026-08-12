#!/usr/bin/env -S npx tsx
/**
 * Manual dry run of the Gemini kanji check against a real stored submission.
 * Prints the parsed checkResults to stdout — does NOT write to the database —
 * so results can be eyeballed against the actual scanned page before the
 * webhook (apps/web/app/api/webhooks/resend-inbound/route.ts) is trusted to
 * write them for real.
 *
 * Must run under tsx (imports @dailyscribe/core, shipped as raw TS source).
 * Reads MONGODB_URI / MONGODB_DB / GEMINI_API_KEY from apps/web/.env.local
 * (not auto-loaded by tsx, so this script loads it itself).
 *
 * Usage (from apps/web):
 *   npx tsx scripts/test-kanji-check.mjs --latest
 *   npx tsx scripts/test-kanji-check.mjs <kanjiSubmissions _id>
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import { KANJI_CURRICULUM, collections, createGeminiKanjiCheckClient } from "@dailyscribe/core";

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

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error("GEMINI_API_KEY not set in apps/web/.env.local");
    process.exit(1);
  }

  const arg = process.argv[2];
  const { kanjiSubmissions } = await collections();
  const submission =
    arg === "--latest" || !arg
      ? await kanjiSubmissions.findOne({}, { sort: { receivedAt: -1 } })
      : await kanjiSubmissions.findOne({ _id: new ObjectId(arg) });

  if (!submission) {
    console.error("No matching kanjiSubmissions document found.");
    process.exit(1);
  }

  console.log(`Submission: ${submission._id}`);
  console.log(`  attachment: ${submission.attachmentFilename} (${submission.attachmentContentType})`);
  console.log(`  batchCharsAtReceipt: ${JSON.stringify(submission.batchCharsAtReceipt)}`);

  if (submission.batchCharsAtReceipt.length === 0) {
    console.log("Nothing to check — batchCharsAtReceipt is empty (this is the expected short-circuit case).");
    process.exit(0);
  }

  const expected = submission.batchCharsAtReceipt.map((char) => ({
    char,
    meanings: KANJI_CURRICULUM.find((e) => e.char === char)?.meanings ?? [],
  }));

  const client = createGeminiKanjiCheckClient({ apiKey: geminiApiKey, model: process.env.GEMINI_MODEL || undefined });
  // MongoDB returns binary fields as a BSON Binary wrapper (constructor.name
  // "Binary"), not a plain Buffer, even though the TS type says Buffer — its
  // .buffer property is already a full-length Node Buffer.
  const attachmentBytes = Buffer.isBuffer(submission.attachmentBytes)
    ? submission.attachmentBytes
    : Buffer.from(submission.attachmentBytes.buffer);

  const results = await client.check({
    attachmentBytes,
    contentType: submission.attachmentContentType,
    expected,
  });

  console.log("\ncheckResults (NOT written to the database):");
  console.log(JSON.stringify(results, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
