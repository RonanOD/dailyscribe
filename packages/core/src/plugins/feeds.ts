import type { CustomFeed } from "../types";

/** Most feeds a user can add. Each is one fetch per edition. */
export const MAX_CUSTOM_FEEDS = 10;
export const MAX_FEED_POSTS = 15;
const DEFAULT_POSTS = 5;
const MAX_URL_LENGTH = 500;
const MAX_TITLE_LENGTH = 120;

/** Parsed, rendering-ready config (as opposed to `CustomFeedsConfig`, the
 *  persisted shape including the shared delivery fields). */
export interface FeedsConfig {
  feeds: CustomFeed[];
  maxPerFeed: number;
}

/** An http(s) URL in canonical form, or null. Doesn't check where it points:
 *  fetchPublicUrl does that on every fetch, since DNS can change after saving. */
export function normalizeFeedUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Validate untyped config (a saved subscription or a request body): drops bad
 *  and duplicate URLs, caps the list, and clamps the post count. */
export function parseFeedsConfig(config: unknown): FeedsConfig {
  const raw = (config ?? {}) as { feeds?: unknown; maxPerFeed?: unknown };
  const seen = new Set<string>();
  const feeds: CustomFeed[] = [];
  for (const entry of Array.isArray(raw.feeds) ? raw.feeds : []) {
    const e = (entry ?? {}) as { url?: unknown; title?: unknown };
    const url = normalizeFeedUrl(e.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = typeof e.title === "string" && e.title.trim() ? e.title.trim().slice(0, MAX_TITLE_LENGTH) : new URL(url).hostname;
    feeds.push({ url, title });
    if (feeds.length === MAX_CUSTOM_FEEDS) break;
  }
  const n = typeof raw.maxPerFeed === "number" && Number.isFinite(raw.maxPerFeed) ? Math.floor(raw.maxPerFeed) : DEFAULT_POSTS;
  return {
    feeds,
    maxPerFeed: Math.min(MAX_FEED_POSTS, Math.max(1, n)),
  };
}

/** How far back a daily edition looks. A bit over a day, so a post published
 *  just before yesterday's send isn't missed when today's runs a few minutes
 *  earlier; the cost is the odd repeat. */
export const FRESH_WINDOW_MS = 26 * 60 * 60 * 1000;

/**
 * The posts to print from one feed. A daily edition only carries posts from
 * the last FRESH_WINDOW_MS, otherwise a weekly Substack would reprint the same
 * posts every morning. Posts without a date can't be placed, so they're kept.
 * A preview (the dashboard's "Send test now") ignores the window, so the user
 * sees what their feeds look like even on a quiet day.
 */
export function pickFreshItems<T extends { published?: Date }>(
  items: T[],
  now: Date,
  max: number,
  opts: { preview?: boolean } = {},
): T[] {
  const cutoff = now.getTime() - FRESH_WINDOW_MS;
  const fresh = opts.preview ? items : items.filter((it) => !it.published || it.published.getTime() >= cutoff);
  return fresh.slice(0, max);
}
