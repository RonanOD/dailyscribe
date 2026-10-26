import {
  fetchPublicUrl,
  formatIsoDate,
  parseFeedsConfig,
  type Asset,
  type CustomFeed,
  type RunContext,
  type ServicePlugin,
} from "@dailyscribe/core";
import { discoverFeedUrls, parseFeed, pdfSafe, type ParsedFeed } from "@/lib/feed-parse";
import { FEED_ACCEPT, USER_AGENT, freshNewsItems, renderNewsPdf, type NewsSection } from "@/lib/plugins/news";

const MASTHEAD = "Your Feeds";

/**
 * Fetch a user-supplied URL as a feed. Goes through fetchPublicUrl (no private
 * networks, every redirect re-checked, capped size). When the URL is a web
 * page rather than a feed (someone pasted a Substack or newspaper homepage),
 * follow the feed link the page advertises in its <head>.
 */
export async function loadFeed(url: string): Promise<{ url: string; feed: ParsedFeed }> {
  const res = await fetchPublicUrl(url, { headers: { "User-Agent": USER_AGENT, Accept: FEED_ACCEPT } });
  if (res.status < 200 || res.status >= 300) throw new Error(`The site answered with HTTP ${res.status}.`);
  const feed = parseFeed(res.body);
  if (feed) return { url: res.url, feed };

  for (const candidate of discoverFeedUrls(res.body, res.url).slice(0, 3)) {
    try {
      const linked = await fetchPublicUrl(candidate, { headers: { "User-Agent": USER_AGENT, Accept: FEED_ACCEPT } });
      const linkedFeed = linked.status >= 200 && linked.status < 300 ? parseFeed(linked.body) : null;
      if (linkedFeed) return { url: linked.url, feed: linkedFeed };
    } catch {
      // Try the next advertised feed.
    }
  }
  throw new Error("That page isn't an RSS or Atom feed, and doesn't link to one.");
}

/**
 * Today's sections, one per feed with something new. A feed failing is
 * logged and skipped, like the fixed news catalogs; `failed` counts them so
 * the caller can tell "every feed is down" from "nothing new today".
 */
async function fetchSections(
  feeds: CustomFeed[],
  now: Date,
  opts: { maxPerFeed: number; fullText: boolean; preview: boolean },
): Promise<{ sections: NewsSection[]; failed: number }> {
  let failed = 0;
  const sections = await Promise.all(
    feeds.map(async (f): Promise<NewsSection | null> => {
      try {
        const { feed } = await loadFeed(f.url);
        const items = freshNewsItems(feed.items, now, opts.maxPerFeed, opts);
        return items.length > 0 ? { label: pdfSafe(f.title) || new URL(f.url).hostname, items } : null;
      } catch (err) {
        failed++;
        console.warn(`Your Feeds: ${f.url} failed:`, err instanceof Error ? err.message : err);
        return null;
      }
    }),
  );
  return { sections: sections.filter((s): s is NewsSection => s !== null), failed };
}

export const feedsPlugin: ServicePlugin = {
  id: "feeds",
  label: MASTHEAD,
  async run(ctx: RunContext): Promise<Asset[]> {
    const cfg = parseFeedsConfig(ctx.config);
    if (cfg.feeds.length === 0) {
      throw new Error("Your Feeds has no feeds yet. Add one on the dashboard.");
    }
    const { sections, failed } = await fetchSections(cfg.feeds, new Date(), {
      maxPerFeed: cfg.maxPerFeed,
      fullText: cfg.fullText,
      preview: Boolean(ctx.preview),
    });
    if (sections.length === 0 && failed === cfg.feeds.length) {
      throw new Error("None of your feeds could be fetched. Check the addresses on the dashboard.");
    }
    // Nothing new since yesterday: no edition today, rather than an empty one.
    if (sections.length === 0) return [];
    const bytes = await renderNewsPdf(MASTHEAD, sections, ctx.date, ctx.digest);
    return [{ filename: `your-feeds-${formatIsoDate(ctx.date)}.pdf`, contentType: "application/pdf", bytes }];
  },
};
