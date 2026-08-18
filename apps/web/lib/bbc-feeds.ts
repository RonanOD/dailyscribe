/** BBC News RSS feed catalog (plain data — safe to import from client components). */
export interface BbcFeed {
  key: string;
  label: string;
  url: string;
}

export const BBC_FEEDS: BbcFeed[] = [
  { key: "topstories", label: "Top Stories", url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { key: "world", label: "World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { key: "uk", label: "UK", url: "https://feeds.bbci.co.uk/news/uk/rss.xml" },
  { key: "business", label: "Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { key: "politics", label: "Politics", url: "https://feeds.bbci.co.uk/news/politics/rss.xml" },
  { key: "health", label: "Health", url: "https://feeds.bbci.co.uk/news/health/rss.xml" },
  {
    key: "science",
    label: "Science & Environment",
    url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
  },
  { key: "technology", label: "Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  {
    key: "entertainment",
    label: "Entertainment & Arts",
    url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
  },
];

/** Every valid feed key — the validation set for saved configs. */
export const ALL_BBC_FEEDS: BbcFeed[] = BBC_FEEDS;
