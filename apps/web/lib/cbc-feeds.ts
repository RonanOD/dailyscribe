/** CBC RSS feed catalog (plain data — safe to import from client components). */
export interface CbcFeed {
  key: string;
  label: string;
  url: string;
}

/** Curated default feeds (the proven set from nyt-crossword-to-kindle). */
export const CBC_FEEDS: CbcFeed[] = [
  { key: "topstories", label: "Top Stories", url: "https://www.cbc.ca/webfeed/rss/rss-topstories" },
  { key: "world", label: "World", url: "https://www.cbc.ca/webfeed/rss/rss-world" },
  { key: "canada", label: "Canada", url: "https://www.cbc.ca/webfeed/rss/rss-canada" },
  { key: "politics", label: "Politics", url: "https://www.cbc.ca/webfeed/rss/rss-politics" },
  { key: "business", label: "Business", url: "https://www.cbc.ca/webfeed/rss/rss-business" },
  { key: "health", label: "Health", url: "https://www.cbc.ca/webfeed/rss/rss-health" },
  { key: "arts", label: "Arts", url: "https://www.cbc.ca/webfeed/rss/rss-arts" },
  { key: "technology", label: "Technology", url: "https://www.cbc.ca/webfeed/rss/rss-technology" },
  {
    key: "canada-novascotia",
    label: "Nova Scotia",
    url: "https://www.cbc.ca/webfeed/rss/rss-canada-novascotia",
  },
];
