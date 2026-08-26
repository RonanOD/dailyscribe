import { describe, expect, it } from "vitest";
import { buildUniversalDataUrl, parseUniversalPuzzle, type UniversalRawPuzzle } from "./universal";

const date = new Date("2025-01-01T00:00:00Z");

describe("buildUniversalDataUrl", () => {
  it("addresses the feed by date", () => {
    expect(buildUniversalDataUrl(date)).toBe(
      "https://gamedata.services.amuniversal.com/c/uucom/l/U2FsdGVkX18YuMv20%2B8cekf85%2Friz1H%2FzlWW4bn0cizt8yclLsp7UYv34S77X0aX%0Axa513fPTc5RoN2wa0h4ED9QWuBURjkqWgHEZey0WFL8%3D/g/fcx/d/2025-01-01/data.json",
    );
  });
});

describe("parseUniversalPuzzle", () => {
  it("reshapes a fully-open grid and derives across/down numbering", () => {
    const raw: UniversalRawPuzzle = {
      Title: "Universal%20Crossword",
      Author: "By%20Jane%20Doe",
      Copyright: "%C2%A9%202025%20Universal",
      Width: 2,
      Height: 2,
      AllAnswer: "ABCD",
      AcrossClue: "1|First across\n3|Second across",
      DownClue: "1|First down\n2|Second down",
    };

    const puzzle = parseUniversalPuzzle(raw);

    expect(puzzle.title).toBe("Universal Crossword");
    // Author strips a leading "By " — the feed already includes it, and callers
    // (the PDF renderer) compose their own "by {author}" from the bare name.
    expect(puzzle.author).toBe("Jane Doe");
    expect(puzzle.copyright).toBe("© 2025 Universal");
    expect(puzzle.rows).toBe(2);
    expect(puzzle.cols).toBe(2);
    expect(puzzle.grid).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);

    const across = puzzle.clues.filter((c) => c.orientation === "across").sort((a, b) => a.position - b.position);
    const down = puzzle.clues.filter((c) => c.orientation === "down").sort((a, b) => a.position - b.position);

    expect(across).toEqual([
      { position: 1, orientation: "across", clue: "First across", row: 0, col: 0, length: 2 },
      { position: 3, orientation: "across", clue: "Second across", row: 1, col: 0, length: 2 },
    ]);
    expect(down).toEqual([
      { position: 1, orientation: "down", clue: "First down", row: 0, col: 0, length: 2 },
      { position: 2, orientation: "down", clue: "Second down", row: 0, col: 1, length: 2 },
    ]);
  });

  it("skips numbering isolated single-letter runs next to a block", () => {
    const raw: UniversalRawPuzzle = {
      Width: 5,
      Height: 1,
      AllAnswer: "AB-CD",
      AcrossClue: "1|Two letters\n2|More letters",
      DownClue: "",
    };

    const puzzle = parseUniversalPuzzle(raw);

    expect(puzzle.grid).toEqual([["A", "B", null, "C", "D"]]);
    expect(puzzle.clues).toEqual([
      { position: 1, orientation: "across", clue: "Two letters", row: 0, col: 0, length: 2 },
      { position: 2, orientation: "across", clue: "More letters", row: 0, col: 3, length: 2 },
    ]);
  });

  it("throws when the grid's derived clue count disagrees with the feed's clue list", () => {
    const raw: UniversalRawPuzzle = {
      Width: 2,
      Height: 2,
      AllAnswer: "ABCD",
      AcrossClue: "1|First across\n3|Second across\n5|Extra bogus clue",
      DownClue: "1|First down\n2|Second down",
    };

    expect(() => parseUniversalPuzzle(raw)).toThrow(/grid\/clue count mismatch/);
  });

  it("throws on a malformed AllAnswer length", () => {
    const raw: UniversalRawPuzzle = {
      Width: 2,
      Height: 2,
      AllAnswer: "ABC",
      AcrossClue: "",
      DownClue: "",
    };

    expect(() => parseUniversalPuzzle(raw)).toThrow(/doesn't match/);
  });
});
