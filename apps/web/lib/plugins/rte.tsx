import { formatIsoDate, type Asset, type RunContext, type ServicePlugin } from "@dailyscribe/core";
import { ALL_RTE_FEEDS, RTE_FEEDS, type RteFeed } from "@/lib/rte-feeds";
import { fetchNewsSections, renderNewsPdf, type NewsSection } from "@/lib/plugins/news";

const FEEDS_BY_KEY = new Map(ALL_RTE_FEEDS.map((f) => [f.key, f]));
const DEFAULT_MAX_PER_FEED = 9;

export interface RteConfig {
  feeds: RteFeed[];
  maxPerFeed: number;
}

/** Validate untyped subscription config into a concrete RTÉ config. */
export function parseRteConfig(config: unknown): RteConfig {
  const raw = (config ?? {}) as { feeds?: unknown; maxPerFeed?: unknown };
  const requested = Array.isArray(raw.feeds) ? raw.feeds.filter((k): k is string => typeof k === "string") : [];
  const feeds = requested.map((k) => FEEDS_BY_KEY.get(k)).filter((f): f is RteFeed => Boolean(f));
  const maxRaw = typeof raw.maxPerFeed === "number" ? Math.floor(raw.maxPerFeed) : DEFAULT_MAX_PER_FEED;
  return {
    feeds: feeds.length > 0 ? feeds : RTE_FEEDS,
    maxPerFeed: Math.min(Math.max(maxRaw, 1), 15),
  };
}

export function fetchRteSections(cfg: RteConfig): Promise<NewsSection[]> {
  return fetchNewsSections("RTÉ", cfg.feeds, cfg.maxPerFeed);
}

/** Render RTÉ sections to a PDF buffer. */
export function renderRtePdf(sections: NewsSection[], date: Date, digest?: boolean): Promise<Buffer> {
  return renderNewsPdf("RTÉ News", sections, date, digest);
}

export const rteNewsPlugin: ServicePlugin = {
  id: "rte",
  label: "RTÉ News",
  async run(ctx: RunContext): Promise<Asset[]> {
    const cfg = parseRteConfig(ctx.config);
    const sections = await fetchRteSections(cfg);
    if (sections.length === 0) {
      throw new Error("No RTÉ feeds could be fetched — all sources failed or returned empty.");
    }
    const bytes = await renderRtePdf(sections, ctx.date, ctx.digest);
    return [
      {
        filename: `rte-news-${formatIsoDate(ctx.date)}.pdf`,
        contentType: "application/pdf",
        bytes,
      },
    ];
  },
};
