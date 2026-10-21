import { CHESS_DIFFICULTIES, CHESS_PUZZLES, type ChessDifficulty, type ChessPuzzle } from "../data/chess";

const MIN_PER_DAY = 1;
export const MAX_CHESS_PER_DAY = 4;
const DEFAULT_PER_DAY = 2;
const DEFAULT_DIFFICULTY: ChessDifficulty = "intermediate";

/** Dashboard labels, with the Lichess rating range each band was cut from. */
export const CHESS_DIFFICULTY_LABELS: Record<ChessDifficulty, string> = {
  beginner: "Beginner (under 1200)",
  intermediate: "Intermediate (1200–1599)",
  club: "Club player (1600–1999)",
  advanced: "Advanced (2000–2399)",
  expert: "Expert (2400+)",
};

/** Parsed, rendering-ready config (as opposed to `ChessServiceConfig`, the
 *  persisted shape including the shared delivery fields). */
export interface ChessConfig {
  puzzlesPerDay: number;
  difficulty: ChessDifficulty;
}

export function parseChessConfig(config: unknown): ChessConfig {
  const raw = (config ?? {}) as { puzzlesPerDay?: unknown; difficulty?: unknown };
  const n =
    typeof raw.puzzlesPerDay === "number" && Number.isFinite(raw.puzzlesPerDay)
      ? Math.floor(raw.puzzlesPerDay)
      : DEFAULT_PER_DAY;
  const difficulty = (CHESS_DIFFICULTIES as readonly unknown[]).includes(raw.difficulty)
    ? (raw.difficulty as ChessDifficulty)
    : DEFAULT_DIFFICULTY;
  return { puzzlesPerDay: Math.min(MAX_CHESS_PER_DAY, Math.max(MIN_PER_DAY, n)), difficulty };
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Day 0 of the rotation. Fixed, so a given date always maps to the same puzzles. */
const EPOCH = Date.UTC(2026, 0, 1);

/**
 * The day's puzzles. Stateless, like the crossword: everyone on the same
 * difficulty and count gets the same puzzles on a given date (a shared "puzzle
 * of the day"), and the pool wraps around once exhausted (2,000 per band is
 * 500+ days even at the maximum of 4 a day). `pool` is injectable for tests.
 */
export function selectChessPuzzles(
  date: Date,
  config: ChessConfig,
  pool: ChessPuzzle[] = CHESS_PUZZLES[config.difficulty],
): ChessPuzzle[] {
  if (pool.length === 0) return [];
  const day = Math.floor((date.getTime() - EPOCH) / DAY_MS);
  const start = day * config.puzzlesPerDay;
  return Array.from({ length: Math.min(config.puzzlesPerDay, pool.length) }, (_, i) => {
    const idx = (((start + i) % pool.length) + pool.length) % pool.length;
    return pool[idx];
  });
}

/** Side to move, from the FEN's second field. */
export function sideToMove(fen: string): "white" | "black" {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

/** FEN piece placement as an 8x8 grid, rank 8 first: each cell a piece letter
 *  (uppercase white, lowercase black) or null. */
export function fenToBoard(fen: string): (string | null)[][] {
  return fen
    .split(" ")[0]
    .split("/")
    .map((rank) => {
      const row: (string | null)[] = [];
      for (const ch of rank) {
        if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) row.push(null);
        else row.push(ch);
      }
      return row;
    });
}

/** The solution as numbered move text, e.g. "24. Qh5+ Kf8 25. Qf7#" or, with
 *  Black to move, "24... Rxe1+ 25. Kh2 Qg1#". */
export function formatSolution(fen: string, solution: string[]): string {
  let moveNo = Number(fen.split(" ")[5]) || 1;
  let white = sideToMove(fen) === "white";
  const parts: string[] = [];
  solution.forEach((san, i) => {
    if (white) parts.push(`${moveNo}. ${san}`);
    else {
      parts.push(i === 0 ? `${moveNo}... ${san}` : san);
      moveNo++;
    }
    white = !white;
  });
  return parts.join(" ");
}
