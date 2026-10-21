import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { CHESS_DIFFICULTIES, CHESS_PUZZLES, type ChessPuzzle } from "../data/chess";
import {
  applyUciMove,
  fenToBoard,
  formatSolution,
  parseChessConfig,
  selectChessPuzzles,
  sideToMove,
  solutionSteps,
} from "./chess";

const pool: ChessPuzzle[] = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
  solution: ["Ka2"],
  uci: ["a1a2"],
  rating: 1500,
  hint: "Find the best move",
}));

describe("parseChessConfig", () => {
  it("defaults to 1 beginner puzzle", () => {
    expect(parseChessConfig(undefined)).toEqual({ puzzlesPerDay: 1, difficulty: "beginner" });
  });

  it("clamps the count and rejects unknown difficulties", () => {
    expect(parseChessConfig({ puzzlesPerDay: 99, difficulty: "grandmaster" })).toEqual({
      puzzlesPerDay: 4,
      difficulty: "beginner",
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

describe("applyUciMove", () => {
  const play = (fen: string, uci: string) => applyUciMove(fenToBoard(fen), uci);

  it("castles both ways, moving the rook too", () => {
    const short = play("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1g1");
    expect(short[7].slice(4)).toEqual([null, "R", "K", null]);
    const long = play("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1", "e8c8");
    expect(long[0].slice(0, 5)).toEqual([null, null, "k", "r", null]);
  });

  it("captures en passant", () => {
    const b = play("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2", "e5d6");
    expect(b[2][3]).toBe("P"); // d6
    expect(b[3][3]).toBeNull(); // the d5 pawn is gone
  });

  it("promotes to the right colour", () => {
    expect(play("8/4P3/8/8/8/8/8/k6K w - - 0 1", "e7e8n")[0][4]).toBe("N");
    expect(play("k6K/8/8/8/8/8/4p3/8 b - - 0 1", "e2e1q")[7][4]).toBe("q");
  });
});

describe("solutionSteps", () => {
  it("labels each move and records the squares it used", () => {
    const steps = solutionSteps({ fen: "4k3/8/8/8/8/8/8/R3K3 b - - 0 30", solution: ["Kd7", "Ra7+"], uci: ["e8d7", "a1a7"] });
    expect(steps.map((s) => s.label)).toEqual(["30... Kd7", "31. Ra7+"]);
    expect(steps[0].from).toEqual([0, 4]);
    expect(steps[0].to).toEqual([1, 3]);
    expect(steps[1].board[1][0]).toBe("R");
  });
});

describe("bundled dataset", () => {
  it("replays every solution to the same positions as chess.js", () => {
    for (const d of CHESS_DIFFICULTIES) {
      for (const p of CHESS_PUZZLES[d]) {
        const game = new Chess(p.fen);
        const steps = solutionSteps(p);
        p.uci.forEach((uci, i) => {
          const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
          expect(move.san).toBe(p.solution[i]);
          expect(steps[i].board).toEqual(fenToBoard(game.fen()));
        });
      }
    }
  });

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
