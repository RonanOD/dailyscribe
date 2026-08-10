import { randomBytes } from "node:crypto";
import { DATASET_VERSION } from "./data/kanji";
import { collections } from "./db";
import type { KanjiProgress } from "./types";

/**
 * Fetch-or-create a user's Kanji progress doc. Shared by the plugin's `run()`
 * (which also advances `cursor`/`lastBatchChars` after a successful send) and
 * the dashboard (which just needs to display `inboundToken`, even before the
 * user's first send) — one place generates the token and self-heals a stale
 * `datasetVersion`, so both callers see consistent state.
 */
export async function getOrCreateKanjiProgress(userId: string): Promise<KanjiProgress> {
  const { kanjiProgress } = await collections();
  let progress = await kanjiProgress.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        cursor: 0,
        datasetVersion: DATASET_VERSION,
        inboundToken: randomBytes(8).toString("hex"),
        updatedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!progress) throw new Error("Failed to load kanji progress.");

  // A regenerated/reordered dataset invalidates a stored numeric cursor.
  if (progress.datasetVersion !== DATASET_VERSION) {
    await kanjiProgress.updateOne(
      { userId },
      { $set: { cursor: 0, datasetVersion: DATASET_VERSION, updatedAt: new Date() } },
    );
    progress = { ...progress, cursor: 0, datasetVersion: DATASET_VERSION };
  }

  // $setOnInsert only populates fields for a brand-new document — a doc
  // created before inboundToken existed (or by any other write path) needs
  // an explicit backfill, or it's stuck with a missing token forever.
  if (!progress.inboundToken) {
    const inboundToken = randomBytes(8).toString("hex");
    await kanjiProgress.updateOne({ userId }, { $set: { inboundToken, updatedAt: new Date() } });
    progress = { ...progress, inboundToken };
  }

  return progress;
}
