import { describe, expect, it } from "vitest";
import { parseKanjiCheckResponse } from "./kanji-check";

function results(pairs: [string, string][]): string {
  return JSON.stringify({ results: pairs.map(([char, status]) => ({ char, status })) });
}

describe("parseKanjiCheckResponse", () => {
  it("parses well-formed JSON matching the expected chars", () => {
    const raw = results([
      ["日", "matched"],
      ["木", "unclear"],
      ["水", "no_attempt"],
    ]);
    expect(parseKanjiCheckResponse(raw, ["日", "木", "水"])).toEqual([
      { char: "日", status: "matched" },
      { char: "木", status: "unclear" },
      { char: "水", status: "no_attempt" },
    ]);
  });

  it("strips a ```json code fence before parsing", () => {
    const raw = "```json\n" + results([["日", "matched"]]) + "\n```";
    expect(parseKanjiCheckResponse(raw, ["日"])).toEqual([{ char: "日", status: "matched" }]);
  });

  it("strips a bare ``` code fence before parsing", () => {
    const raw = "```\n" + results([["日", "matched"]]) + "\n```";
    expect(parseKanjiCheckResponse(raw, ["日"])).toEqual([{ char: "日", status: "matched" }]);
  });

  it("defaults chars missing from the model's response to no_attempt", () => {
    const raw = results([["日", "matched"]]);
    expect(parseKanjiCheckResponse(raw, ["日", "木"])).toEqual([
      { char: "日", status: "matched" },
      { char: "木", status: "no_attempt" },
    ]);
  });

  it("drops chars the model reports that aren't in the expected set", () => {
    const raw = results([
      ["日", "matched"],
      ["火", "matched"],
    ]);
    expect(parseKanjiCheckResponse(raw, ["日"])).toEqual([{ char: "日", status: "matched" }]);
  });

  it("ignores an entry with an unrecognized status value, falling back to no_attempt", () => {
    const raw = results([["日", "bogus_status"]]);
    expect(parseKanjiCheckResponse(raw, ["日"])).toEqual([{ char: "日", status: "no_attempt" }]);
  });

  it("returns an empty array when expectedChars is empty", () => {
    expect(parseKanjiCheckResponse(results([["日", "matched"]]), [])).toEqual([]);
  });

  it("throws on non-JSON text", () => {
    expect(() => parseKanjiCheckResponse("not json at all", ["日"])).toThrow(/not valid JSON/);
  });

  it("throws when the JSON has no results array", () => {
    expect(() => parseKanjiCheckResponse(JSON.stringify({ foo: "bar" }), ["日"])).toThrow(/missing "results"/);
  });
});
