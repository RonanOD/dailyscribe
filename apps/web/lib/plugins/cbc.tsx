import { formatIsoDate, type Asset, type RunContext, type ServicePlugin } from "@dailyscribe/core";
import { ALL_CBC_FEEDS, CBC_FEEDS, type CbcFeed } from "@/lib/cbc-feeds";
import { fetchNewsSections, renderNewsPdf, type NewsSection } from "@/lib/plugins/news";

const FEEDS_BY_KEY = new Map(ALL_CBC_FEEDS.map((f) => [f.key, f]));
const DEFAULT_MAX_PER_FEED = 9;

export interface CbcConfig {
  feeds: CbcFeed[];
  maxPerFeed: number;
}

/** Validate untyped subscription config into a concrete CBC config. */
export function parseCbcConfig(config: unknown): CbcConfig {
  const raw = (config ?? {}) as { feeds?: unknown; maxPerFeed?: unknown };
  const requested = Array.isArray(raw.feeds) ? raw.feeds.filter((k): k is string => typeof k === "string") : [];
  const feeds = requested.map((k) => FEEDS_BY_KEY.get(k)).filter((f): f is CbcFeed => Boolean(f));
  const maxRaw = typeof raw.maxPerFeed === "number" ? Math.floor(raw.maxPerFeed) : DEFAULT_MAX_PER_FEED;
  return {
    feeds: feeds.length > 0 ? feeds : CBC_FEEDS,
    maxPerFeed: Math.min(Math.max(maxRaw, 1), 15),
  };
}

export function fetchCbcSections(cfg: CbcConfig): Promise<NewsSection[]> {
  return fetchNewsSections("CBC", cfg.feeds, cfg.maxPerFeed);
}

/** Render CBC sections to a PDF buffer. */
export function renderCbcPdf(sections: NewsSection[], date: Date, digest?: boolean): Promise<Buffer> {
  return renderNewsPdf("CBC News", sections, date, digest);
}

export const cbcNewsPlugin: ServicePlugin = {
  id: "cbc",
  label: "CBC News",
  async run(ctx: RunContext): Promise<Asset[]> {
    const cfg = parseCbcConfig(ctx.config);
    const sections = await fetchCbcSections(cfg);
    if (sections.length === 0) {
      throw new Error("No CBC feeds could be fetched — all sources failed or returned empty.");
    }
    const bytes = await renderCbcPdf(sections, ctx.date, ctx.digest);
    return [
      {
        filename: `cbc-news-${formatIsoDate(ctx.date)}.pdf`,
        contentType: "application/pdf",
        bytes,
      },
    ];
  },
};
