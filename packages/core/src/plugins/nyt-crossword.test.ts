import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGamesUrl,
  buildNewspaperUrl,
  buildPuzzleLookupUrl,
  formatIsoDate,
  formatNytPrintDate,
  nytCrosswordPlugin,
} from "./nyt-crossword";

const date = new Date("2025-01-01T00:00:00Z");

describe("NYT url + date helpers", () => {
  it("formats the newspaper print token", () => {
    expect(formatNytPrintDate(date)).toBe("Jan0125");
  });

  it("formats an ISO date", () => {
    expect(formatIsoDate(date)).toBe("2025-01-01");
  });

  it("builds the newspaper url", () => {
    expect(buildNewspaperUrl(date)).toBe(
      "https://www.nytimes.com/svc/crosswords/v2/puzzle/print/Jan0125.pdf",
    );
  });

  it("builds the plain games url", () => {
    expect(buildGamesUrl(456, "games")).toBe(
      "https://www.nytimes.com/svc/crosswords/v2/puzzle/456.pdf",
    );
  });

  it("builds the big (large print) url", () => {
    expect(buildGamesUrl(456, "big")).toBe(
      "https://www.nytimes.com/svc/crosswords/v2/puzzle/456.pdf?large_print=true",
    );
  });

  it("builds the southpaw url", () => {
    expect(buildGamesUrl(456, "southpaw")).toBe(
      "https://www.nytimes.com/svc/crosswords/v2/puzzle/456.pdf?southpaw=true",
    );
  });

  it("builds the puzzle lookup url", () => {
    const url = buildPuzzleLookupUrl(date);
    expect(url).toContain("date_start=2025-01-01");
    expect(url).toContain("date_end=2025-01-01");
    expect(url).toContain("publish_type=daily");
  });
});

describe("nytCrosswordPlugin.run", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns a PDF asset for the newspaper layout", async () => {
    const pdf = Buffer.from("%PDF-1.4 fake");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(pdf, { headers: { "content-type": "application/pdf" } })),
    );

    const assets = await nytCrosswordPlugin.run({
      userId: "u1",
      date,
      config: { version: "newspaper" },
      secrets: { nyt: "NYT-S=abc" },
    });

    expect(assets).toHaveLength(1);
    expect(assets[0]!.contentType).toBe("application/pdf");
    expect(assets[0]!.filename).toBe("nyt-crossword-2025-01-01-newspaper.pdf");
  });

  it("resolves a puzzle id then fetches the games PDF", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [{ puzzle_id: 789 }] }), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from("%PDF"), { headers: { "content-type": "application/pdf" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const assets = await nytCrosswordPlugin.run({
      userId: "u1",
      date,
      config: { version: "games" },
      secrets: { nyt: "NYT-S=abc" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toContain("/v2/puzzle/789.pdf");
    expect(assets[0]!.filename).toBe("nyt-crossword-2025-01-01-games.pdf");
  });

  it("throws when the NYT-S cookie is missing", async () => {
    await expect(
      nytCrosswordPlugin.run({ userId: "u1", date, config: { version: "games" }, secrets: {} }),
    ).rejects.toThrow(/NYT-S/);
  });

  it("throws when NYT returns non-PDF content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } })),
    );

    await expect(
      nytCrosswordPlugin.run({
        userId: "u1",
        date,
        config: { version: "newspaper" },
        secrets: { nyt: "NYT-S=expired" },
      }),
    ).rejects.toThrow(/expired/);
  });
});
