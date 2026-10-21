import { describe, expect, it } from "vitest";
import { CHESS_DIFFICULTIES, CHESS_PUZZLES, type ChessPuzzle } from "../data/chess";
import { fenToBoard, formatSolution, parseChessConfig, selectChessPuzzles, sideToMove } from "./chess";

const pool: ChessPuzzle[] = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
  solution: ["Ka2"],
  rating: 1500,
  hint: "Find the best move",
}));

describe("parseChessConfig", () => {
  it("defaults to 2 intermediate puzzles", () => {
    expect(parseChessConfig(undefined)).toEqual({ puzzlesPerDay: 2, difficulty: "intermediate" });
  });

  it("clamps the count and rejects unknown difficulties", () => {
    expect(parseChessConfig({ puzzlesPerDay: 99, difficulty: "grandmaster" })).toEqual({
      puzzlesPerDay: 4,
      difficulty: "intermediate",
    });
    expect(parseChessConfig({ puzzlesPerDay: 0, difficulty: "expert" })).toEqual({
      puzzlesPerDay: 1,
      difficulty: "expert",
    });
  });
});

describe("selectChessPuzzles", () => {
  const cfg = { puzzlesPerDay: 3, difficulty: "club" as const };

  it("is the same for the same date and different on the next day", () => {
    const a = selectChessPuzzles(new Date(Date.UTC(2026, 9, 21)), cfg, pool).map((p) => p.id);
    const b = selectChessPuzzles(new Date(Date.UTC(2026, 9, 21)), cfg, pool).map((p) => p.id);
    const next = selectChessPuzzles(new Date(Date.UTC(2026, 9, 22)), cfg, pool).map((p) => p.id);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(next).not.toEqual(a);
  });

  it("walks the pool without overlap between consecutive days, wrapping at the end", () => {
    const day0 = selectChessPuzzles(new Date(Date.UTC(2026, 0, 1)), cfg, pool).map((p) => p.id);
    const day1 = selectChessPuzzles(new Date(Date.UTC(2026, 0, 2)), cfg, pool).map((p) => p.id);
    const day3 = selectChessPuzzles(new Date(Date.UTC(2026, 0, 4)), cfg, pool).map((p) => p.id);
    expect(day0).toEqual(["p0", "p1", "p2"]);
    expect(day1).toEqual(["p3", "p4", "p5"]);
    expect(day3).toEqual(["p9", "p0", "p1"]);
  });

  it("handles dates before the rotation epoch", () => {
    expect(selectChessPuzzles(new Date(Date.UTC(2025, 11, 31)), cfg, pool)).toHaveLength(3);
  });
});

describe("FEN helpers", () => {
  it("reads the side to move and the board, rank 8 first", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 2";
    expect(sideToMove(fen)).toBe("black");
    const board = fenToBoard(fen);
    expect(board).toHaveLength(8);
    expect(board.every((r) => r.length === 8)).toBe(true);
    expect(board[0][0]).toBe("r");
    expect(board[2][2]).toBe("n");
    expect(board[7][4]).toBe("K");
    expect(board[4][4]).toBe("P"); // e4
    expect(board[4][3]).toBeNull(); // d4
  });

  it("numbers the solution from the FEN's move counter", () => {
    expect(formatSolution("8/8/8/8/8/8/8/K6k w - - 0 24", ["Qh5+", "Kf8", "Qf7#"])).toBe("24. Qh5+ Kf8 25. Qf7#");
    expect(formatSolution("8/8/8/8/8/8/8/K6k b - - 0 24", ["Rxe1+", "Kh2", "Qg1#"])).toBe(
      "24... Rxe1+ 25. Kh2 Qg1#",
    );
  });
});

describe("bundled dataset", () => {
  it("has puzzles in every band, each with a solver move and a legal-looking FEN", () => {
    for (const d of CHESS_DIFFICULTIES) {
      const band = CHESS_PUZZLES[d];
      expect(band.length).toBeGreaterThan(1000);
      for (const p of band) {
        expect(p.solution.length).toBeGreaterThan(0);
        expect(fenToBoard(p.fen).every((r) => r.length === 8)).toBe(true);
      }
    }
  });
});
