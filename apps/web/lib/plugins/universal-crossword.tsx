import {
  collections,
  fetchUniversalPuzzleRaw,
  formatIsoDate,
  parseUniversalPuzzle,
  type Asset,
  type CrosswordPuzzle,
  type RunContext,
  type ServicePlugin,
} from "@dailyscribe/core";
import { renderCrosswordPdf } from "./crossword-render";

/** Fetch-or-cache the day's Universal Crossword. Keyed by date alone (not
 *  per user) — every subscriber gets the same puzzle on a given day, unlike
 *  the old per-user Gemini generation. `$setOnInsert` + upsert makes this
 *  race-safe: if two requests miss the cache for the same date at once, only
 *  one insert wins and both callers get back the same persisted doc (same
 *  pattern as packages/core/src/kanji-progress.ts). */
async function getOrFetchUniversalPuzzle(date: Date): Promise<CrosswordPuzzle> {
  const isoDate = formatIsoDate(date);
  const { crosswordPuzzles } = await collections();
  const existing = await crosswordPuzzles.findOne({ date: isoDate });
  if (existing) return existing;

  const raw = await fetchUniversalPuzzleRaw(date);
  const parsed = parseUniversalPuzzle(raw);

  const puzzle = await crosswordPuzzles.findOneAndUpdate(
    { date: isoDate },
    {
      $setOnInsert: {
        date: isoDate,
        title: parsed.title,
        author: parsed.author,
        copyright: parsed.copyright,
        rows: parsed.rows,
        cols: parsed.cols,
        grid: parsed.grid,
        clues: parsed.clues,
        createdAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!puzzle) throw new Error("Failed to cache today's Universal Crossword.");
  return puzzle;
}

export const universalCrosswordPlugin: ServicePlugin = {
  id: "universal-crossword",
  label: "Universal Crossword",
  async run(ctx: RunContext): Promise<Asset[]> {
    const puzzle = await getOrFetchUniversalPuzzle(ctx.date);
    const bytes = await renderCrosswordPdf(puzzle, ctx.date, {
      masthead: "Universal Crossword",
      digest: ctx.digest,
    });
    return [
      {
        filename: `universal-crossword-${formatIsoDate(ctx.date)}.pdf`,
        contentType: "application/pdf",
        bytes,
      },
    ];
  },
};
