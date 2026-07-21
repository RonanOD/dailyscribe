/** CBC RSS feed catalog (plain data — safe to import from client components). */
export interface CbcFeed {
  key: string;
  label: string;
  url: string;
}

/** General (national/topic) feeds shown as checkboxes. */
export const CBC_FEEDS: CbcFeed[] = [
  { key: "topstories", label: "Top Stories", url: "https://www.cbc.ca/webfeed/rss/rss-topstories" },
  { key: "world", label: "World", url: "https://www.cbc.ca/webfeed/rss/rss-world" },
  { key: "canada", label: "Canada", url: "https://www.cbc.ca/webfeed/rss/rss-canada" },
  { key: "politics", label: "Politics", url: "https://www.cbc.ca/webfeed/rss/rss-politics" },
  { key: "business", label: "Business", url: "https://www.cbc.ca/webfeed/rss/rss-business" },
  { key: "health", label: "Health", url: "https://www.cbc.ca/webfeed/rss/rss-health" },
  { key: "arts", label: "Arts", url: "https://www.cbc.ca/webfeed/rss/rss-arts" },
  { key: "technology", label: "Technology", url: "https://www.cbc.ca/webfeed/rss/rss-technology" },
];

/** Regional slugs + labels, from https://www.cbc.ca/rss/ (rss-canada-<slug>). */
const REGION_SLUGS: [slug: string, label: string][] = [
  ["britishcolumbia", "British Columbia"],
  ["calgary", "Calgary"],
  ["edmonton", "Edmonton"],
  ["hamiltonnews", "Hamilton"],
  ["kamloops", "Kamloops"],
  ["kitchenerwaterloo", "Kitchener-Waterloo"],
  ["london", "London"],
  ["manitoba", "Manitoba"],
  ["montreal", "Montreal"],
  ["newbrunswick", "New Brunswick"],
  ["newfoundland", "Newfoundland & Labrador"],
  ["north", "North"],
  ["novascotia", "Nova Scotia"],
  ["ottawa", "Ottawa"],
  ["pei", "P.E.I."],
  ["saskatchewan", "Saskatchewan"],
  ["saskatoon", "Saskatoon"],
  ["sudbury", "Sudbury"],
  ["thunderbay", "Thunder Bay"],
  ["toronto", "Toronto"],
  ["windsor", "Windsor"],
];

/** Regional feeds, offered via a single region dropdown. Keys stay `canada-<slug>`
 *  (backward compatible with configs saved when Nova Scotia was a plain checkbox). */
export const CBC_REGIONS: CbcFeed[] = REGION_SLUGS.map(([slug, label]) => ({
  key: `canada-${slug}`,
  label,
  url: `https://www.cbc.ca/webfeed/rss/rss-canada-${slug}`,
}));

/** Every valid feed key (general + regional) — the validation set for saved configs. */
export const ALL_CBC_FEEDS: CbcFeed[] = [...CBC_FEEDS, ...CBC_REGIONS];
