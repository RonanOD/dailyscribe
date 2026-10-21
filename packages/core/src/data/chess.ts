// Generated data: scripts/build-chess-data.mjs writes chess-puzzles.json.
// Puzzles: the Lichess puzzle database (https://database.lichess.org/#puzzles), CC0.

import data from "./chess-puzzles.json";

export const CHESS_DIFFICULTIES = ["beginner", "intermediate", "club", "advanced", "expert"] as const;
export type ChessDifficulty = (typeof CHESS_DIFFICULTIES)[number];

export interface ChessPuzzle {
  /** Lichess puzzle id: lichess.org/training/{id}. */
  id: string;
  /** The position the solver sees (the opponent's setup move already applied). */
  fen: string;
  /** The full line in SAN, starting with the solver's move. */
  solution: string[];
  rating: number;
  /** Short task shown above the board, e.g. "Mate in 2". */
  hint: string;
}

export const CHESS_DATASET_VERSION: string = data.version;

export const CHESS_PUZZLES = data.bands as Record<ChessDifficulty, ChessPuzzle[]>;
