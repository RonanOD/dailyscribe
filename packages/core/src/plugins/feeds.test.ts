import { describe, expect, it } from "vitest";
import { FRESH_WINDOW_MS, normalizeFeedUrl, parseFeedsConfig, pickFreshItems } from "./feeds";

describe("normalizeFeedUrl", () => {
  it("adds https to a bare host and drops the fragment", () => {
    expect(normalizeFeedUrl("example.substack.com/feed")).toBe("https://example.substack.com/feed");
    expect(normalizeFeedUrl(" https://news.example.org/rss#top ")).toBe("https://news.example.org/rss");
  });

  it("rejects non-http schemes, junk and over-long input", () => {
    expect(normalizeFeedUrl("ftp://example.com/feed")).toBeNull();
    expect(normalizeFeedUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeFeedUrl("")).toBeNull();
    expect(normalizeFeedUrl(42)).toBeNull();
    expect(normalizeFeedUrl(`https://example.com/${"a".repeat(600)}`)).toBeNull();
  });
});

describe("parseFeedsConfig", () => {
  it("defaults to no feeds and 5 posts", () => {
    expect(parseFeedsConfig(undefined)).toEqual({ feeds: [], maxPerFeed: 5 });
  });

  it("drops bad and duplicate feeds, caps the list, and fills a missing title", () => {
    const feeds = [
      { url: "https://a.example.com/feed", title: "A" },
      { url: "https://a.example.com/feed#dup", title: "A again" },
      { url: "not a url at all", title: "Bad" },
      { url: "https://b.example.com/rss" },
      ...Array.from({ length: 20 }, (_, i) => ({ url: `https://c${i}.example.com/feed`, title: `C${i}` })),
    ];
    const cfg = parseFeedsConfig({ feeds, maxPerFeed: 99 });
    expect(cfg.feeds).toHaveLength(10);
    expect(cfg.feeds[0]).toEqual({ url: "https://a.example.com/feed", title: "A" });
    expect(cfg.feeds[1]).toEqual({ url: "https://b.example.com/rss", title: "b.example.com" });
    expect(cfg.maxPerFeed).toBe(15);
  });
});

describe("pickFreshItems", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000);
  const items = [
    { id: "new", published: hoursAgo(2) },
    { id: "undated" },
    { id: "edge", published: new Date(now.getTime() - FRESH_WINDOW_MS) },
    { id: "old", published: hoursAgo(72) },
  ];

  it("keeps posts from the last day and undated ones", () => {
    expect(pickFreshItems(items, now, 10).map((i) => i.id)).toEqual(["new", "undated", "edge"]);
  });

  it("caps the count", () => {
    expect(pickFreshItems(items, now, 1).map((i) => i.id)).toEqual(["new"]);
  });

  it("ignores the window for a preview", () => {
    expect(pickFreshItems(items, now, 10, { preview: true }).map((i) => i.id)).toEqual(["new", "undated", "edge", "old"]);
  });
});
