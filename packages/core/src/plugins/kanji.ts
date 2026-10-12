import type { KanjiEntry } from "../data/kanji";

const MIN_PER_DAY = 1;
const MAX_PER_DAY = 10;
const DEFAULT_PER_DAY = 3;
const DEFAULT_MAX_JLPT: 1 | 2 | 3 | 4 | 5 = 5;
const JLPT_LEVELS = [1, 2, 3, 4, 5] as const;

/** JLPT levels KANJI_CURRICULUM (packages/core/src/data/kanji.ts) actually has
 *  entries for. Keep in sync with that generated dataset. Since the pool filter
 *  is `entry.jlpt >= maxJlptLevel`, any level below the lowest one here returns
 *  the exact same pool as that lowest level, not an empty one, so it's not a
 *  crash — just a dashboard option that silently does nothing. */
export const AVAILABLE_JLPT_LEVELS = [5, 4] as const;

/** Parsed, rendering-ready config for the Kanji plugin (as opposed to
 *  `KanjiServiceConfig`, the persisted shape including shared delivery fields). */
export interface KanjiConfig {
  kanjiPerDay: number;
  maxJlptLevel: 1 | 2 | 3 | 4 | 5;
}

export function parseKanjiConfig(config: unknown): KanjiConfig {
  const raw = (config ?? {}) as { kanjiPerDay?: unknown; maxJlptLevel?: unknown };
  const perDayNum =
    typeof raw.kanjiPerDay === "number" && Number.isFinite(raw.kanjiPerDay) ? raw.kanjiPerDay : DEFAULT_PER_DAY;
  const kanjiPerDay = Math.min(MAX_PER_DAY, Math.max(MIN_PER_DAY, Math.floor(perDayNum)));
  const levelNum = typeof raw.maxJlptLevel === "number" ? Math.floor(raw.maxJlptLevel) : DEFAULT_MAX_JLPT;
  const requestedLevel = (JLPT_LEVELS as readonly number[]).includes(levelNum)
    ? (levelNum as 1 | 2 | 3 | 4 | 5)
    : DEFAULT_MAX_JLPT;
  const maxJlptLevel = (
    (AVAILABLE_JLPT_LEVELS as readonly number[]).includes(requestedLevel)
      ? requestedLevel
      : Math.min(...AVAILABLE_JLPT_LEVELS)
  ) as 1 | 2 | 3 | 4 | 5;
  return { kanjiPerDay, maxJlptLevel };
}

export interface KanjiBatch {
  entries: KanjiEntry[];
  levelCompleted: boolean;
}

/** Pick the next unseen batch from a cursor into the (level-filtered) curriculum.
 *  Once the cursor reaches the end, re-serve the final batch as review rather
 *  than indexing out of bounds. */
export function selectBatch(pool: KanjiEntry[], cursor: number, kanjiPerDay: number): KanjiBatch {
  if (pool.length === 0) return { entries: [], levelCompleted: true };
  if (cursor >= pool.length) {
    return { entries: pool.slice(Math.max(0, pool.length - kanjiPerDay)), levelCompleted: true };
  }
  return { entries: pool.slice(cursor, cursor + kanjiPerDay), levelCompleted: false };
}

export interface DailyKanjiBatch extends KanjiBatch {
  /** True when this batch is a resend of previously-unmatched characters
   *  (KanjiProgress.retryChars) rather than fresh curriculum. */
  isRetry: boolean;
}

/** Chooses the day's batch: if any characters from a past check-in came back
 *  unclear/no_attempt, resend those (capped at kanjiPerDay) instead of
 *  advancing into fresh curriculum, so a user who didn't quite get a
 *  character keeps seeing it until a check-in reports it matched. Falls back
 *  to the normal cursor-based selection if retryChars is empty, or if none
 *  of its characters still resolve in the curriculum (e.g. dataset changed). */
export function selectDailyBatch(
  curriculum: KanjiEntry[],
  pool: KanjiEntry[],
  cursor: number,
  kanjiPerDay: number,
  retryChars: string[],
): DailyKanjiBatch {
  if (retryChars.length > 0) {
    const entries = retryChars
      .map((char) => curriculum.find((e) => e.char === char))
      .filter((e): e is KanjiEntry => Boolean(e))
      .slice(0, kanjiPerDay);
    if (entries.length > 0) {
      return { entries, levelCompleted: false, isRetry: true };
    }
  }
  return { ...selectBatch(pool, cursor, kanjiPerDay), isRetry: false };
}
