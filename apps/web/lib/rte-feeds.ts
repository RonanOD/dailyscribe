/** RTÉ News RSS feed catalog (plain data — safe to import from client components). */
export interface RteFeed {
  key: string;
  label: string;
  url: string;
}

export const RTE_FEEDS: RteFeed[] = [
  { key: "topstories", label: "Top Stories", url: "https://www.rte.ie/feeds/rss/?index=/news/" },
  { key: "ireland", label: "Ireland", url: "https://www.rte.ie/feeds/rss/?index=/news/ireland/" },
  { key: "world", label: "World", url: "https://www.rte.ie/feeds/rss/?index=/news/world/" },
  { key: "europe", label: "Europe", url: "https://www.rte.ie/feeds/rss/?index=/news/europe/" },
  { key: "politics", label: "Politics", url: "https://www.rte.ie/feeds/rss/?index=/news/politics/" },
  { key: "business", label: "Business", url: "https://www.rte.ie/feeds/rss/?index=/news/business/" },
  { key: "health", label: "Health", url: "https://www.rte.ie/feeds/rss/?index=/news/health/" },
  { key: "technology", label: "Technology", url: "https://www.rte.ie/feeds/rss/?index=/news/technology/" },
  { key: "sport", label: "Sport", url: "https://www.rte.ie/feeds/rss/?index=/sport/" },
  { key: "entertainment", label: "Entertainment", url: "https://www.rte.ie/feeds/rss/?index=/entertainment/" },
];

/** Every valid feed key — the validation set for saved configs. */
export const ALL_RTE_FEEDS: RteFeed[] = RTE_FEEDS;
