import { describe, expect, it } from "vitest";
import type { KanjiEntry } from "../data/kanji";
import { parseKanjiConfig, selectBatch, selectDailyBatch } from "./kanji";

function entry(char: string): KanjiEntry {
  return {
    char,
    jlpt: 5,
    strokeCount: 1,
    meanings: [char],
    onyomi: [],
    kunyomi: [],
    example: { word: char, reading: char, meaning: char },
    strokes: [{ d: "M0,0" }],
  };
}

describe("parseKanjiConfig", () => {
  it("applies defaults for an empty config", () => {
    expect(parseKanjiConfig({})).toEqual({ kanjiPerDay: 3, maxJlptLevel: 5 });
    expect(parseKanjiConfig(undefined)).toEqual({ kanjiPerDay: 3, maxJlptLevel: 5 });
  });

  it("clamps kanjiPerDay to 1-10", () => {
    expect(parseKanjiConfig({ kanjiPerDay: 0 }).kanjiPerDay).toBe(1);
    expect(parseKanjiConfig({ kanjiPerDay: -5 }).kanjiPerDay).toBe(1);
    expect(parseKanjiConfig({ kanjiPerDay: 25 }).kanjiPerDay).toBe(10);
    expect(parseKanjiConfig({ kanjiPerDay: 7.9 }).kanjiPerDay).toBe(7);
  });

  it("falls back to the default for a non-numeric kanjiPerDay", () => {
    expect(parseKanjiConfig({ kanjiPerDay: "5" }).kanjiPerDay).toBe(3);
  });

  it("only accepts a valid JLPT level for maxJlptLevel", () => {
    expect(parseKanjiConfig({ maxJlptLevel: 3 }).maxJlptLevel).toBe(3);
    expect(parseKanjiConfig({ maxJlptLevel: 9 }).maxJlptLevel).toBe(5);
    expect(parseKanjiConfig({ maxJlptLevel: "N3" }).maxJlptLevel).toBe(5);
  });
});

describe("selectBatch", () => {
  const pool = ["a", "b", "c", "d", "e"].map(entry);

  it("returns an empty, completed batch for an empty pool", () => {
    expect(selectBatch([], 0, 3)).toEqual({ entries: [], levelCompleted: true });
  });

  it("slices the next batch from the cursor", () => {
    const batch = selectBatch(pool, 0, 2);
    expect(batch.entries.map((e) => e.char)).toEqual(["a", "b"]);
    expect(batch.levelCompleted).toBe(false);
  });

  it("returns a shorter, non-completed batch when nearing the end", () => {
    const batch = selectBatch(pool, 4, 2);
    expect(batch.entries.map((e) => e.char)).toEqual(["e"]);
    expect(batch.levelCompleted).toBe(false);
  });

  it("re-serves the final batch as review once the cursor reaches the end", () => {
    const batch = selectBatch(pool, 5, 2);
    expect(batch.entries.map((e) => e.char)).toEqual(["d", "e"]);
    expect(batch.levelCompleted).toBe(true);
  });

  it("clamps the review batch when kanjiPerDay exceeds the pool size", () => {
    const batch = selectBatch(pool, 5, 10);
    expect(batch.entries.map((e) => e.char)).toEqual(["a", "b", "c", "d", "e"]);
    expect(batch.levelCompleted).toBe(true);
  });
});

describe("selectDailyBatch", () => {
  const curriculum = ["a", "b", "c", "d", "e"].map(entry);
  const pool = curriculum;

  it("falls back to the normal cursor-based batch when there are no retry chars", () => {
    const batch = selectDailyBatch(curriculum, pool, 0, 2, []);
    expect(batch.entries.map((e) => e.char)).toEqual(["a", "b"]);
    expect(batch.isRetry).toBe(false);
    expect(batch.levelCompleted).toBe(false);
  });

  it("resends retry chars instead of advancing the cursor", () => {
    const batch = selectDailyBatch(curriculum, pool, 3, 2, ["a"]);
    expect(batch.entries.map((e) => e.char)).toEqual(["a"]);
    expect(batch.isRetry).toBe(true);
    expect(batch.levelCompleted).toBe(false);
  });

  it("caps a retry batch at kanjiPerDay", () => {
    const batch = selectDailyBatch(curriculum, pool, 0, 2, ["a", "b", "c"]);
    expect(batch.entries.map((e) => e.char)).toEqual(["a", "b"]);
    expect(batch.isRetry).toBe(true);
  });

  it("looks retry chars up against the full curriculum, not the level-filtered pool", () => {
    const narrowPool = curriculum.slice(0, 1); // only "a"
    const batch = selectDailyBatch(curriculum, narrowPool, 0, 2, ["c"]);
    expect(batch.entries.map((e) => e.char)).toEqual(["c"]);
    expect(batch.isRetry).toBe(true);
  });

  it("falls back to the normal batch when no retry char resolves in the curriculum", () => {
    const batch = selectDailyBatch(curriculum, pool, 0, 2, ["z"]);
    expect(batch.entries.map((e) => e.char)).toEqual(["a", "b"]);
    expect(batch.isRetry).toBe(false);
  });
});
