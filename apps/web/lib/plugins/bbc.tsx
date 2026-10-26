import { formatIsoDate, type Asset, type RunContext, type ServicePlugin } from "@dailyscribe/core";
import { ALL_BBC_FEEDS, BBC_FEEDS, type BbcFeed } from "@/lib/bbc-feeds";
import { fetchNewsSections, renderNewsPdf, type NewsSection } from "@/lib/plugins/news";

const FEEDS_BY_KEY = new Map(ALL_BBC_FEEDS.map((f) => [f.key, f]));
const DEFAULT_MAX_PER_FEED = 9;

export interface BbcConfig {
  feeds: BbcFeed[];
  maxPerFeed: number;
}

/** Validate untyped subscription config into a concrete BBC config. */
export function parseBbcConfig(config: unknown): BbcConfig {
  const raw = (config ?? {}) as { feeds?: unknown; maxPerFeed?: unknown };
  const requested = Array.isArray(raw.feeds) ? raw.feeds.filter((k): k is string => typeof k === "string") : [];
  const feeds = requested.map((k) => FEEDS_BY_KEY.get(k)).filter((f): f is BbcFeed => Boolean(f));
  const maxRaw = typeof raw.maxPerFeed === "number" ? Math.floor(raw.maxPerFeed) : DEFAULT_MAX_PER_FEED;
  return {
    feeds: feeds.length > 0 ? feeds : BBC_FEEDS,
    maxPerFeed: Math.min(Math.max(maxRaw, 1), 15),
  };
}

export function fetchBbcSections(cfg: BbcConfig): Promise<NewsSection[]> {
  return fetchNewsSections("BBC", cfg.feeds, cfg.maxPerFeed);
}

/** Render BBC sections to a PDF buffer. */
export function renderBbcPdf(sections: NewsSection[], date: Date, digest?: boolean): Promise<Buffer> {
  return renderNewsPdf("BBC News", sections, date, digest);
}

export const bbcNewsPlugin: ServicePlugin = {
  id: "bbc",
  label: "BBC News",
  async run(ctx: RunContext): Promise<Asset[]> {
    const cfg = parseBbcConfig(ctx.config);
    const sections = await fetchBbcSections(cfg);
    if (sections.length === 0) {
      throw new Error("No BBC feeds could be fetched — all sources failed or returned empty.");
    }
    const bytes = await renderBbcPdf(sections, ctx.date, ctx.digest);
    return [
      {
        filename: `bbc-news-${formatIsoDate(ctx.date)}.pdf`,
        contentType: "application/pdf",
        bytes,
      },
    ];
  },
};
