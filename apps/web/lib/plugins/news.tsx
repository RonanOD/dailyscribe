import { formatIsoDate, pickFreshItems } from "@dailyscribe/core";
import { Document, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { parseFeed, pdfSafe, toPlainText, type FeedItem } from "@/lib/feed-parse";
import { BUY_ME_A_COFFEE_URL } from "@/lib/site";

/**
 * The shared news edition: CBC, BBC and RTÉ (fixed feed catalogs) and Your
 * Feeds (whatever the user adds) all fetch feeds into sections and print them
 * with this one layout.
 */

const SUMMARY_MAX_CHARS = 320;

export interface NewsItem {
  title: string;
  summary: string;
  /** Article URL from the feed; when present the headline renders as a tappable link. */
  link?: string;
}

export interface NewsSection {
  label: string;
  items: NewsItem[];
}

export interface NewsFeed {
  key: string;
  label: string;
  url: string;
}

// CBC's edge drops User-Agents containing a URL, so keep this plain (no "+https://…").
export const USER_AGENT = "Mozilla/5.0 (compatible; DailyScribe/0.1)";
export const FEED_ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8";
const FEED_TIMEOUT_MS = 15000;

function shortSummary(html: string): string {
  const summary = pdfSafe(toPlainText(html));
  return summary.length > SUMMARY_MAX_CHARS ? `${summary.slice(0, SUMMARY_MAX_CHARS)}…` : summary;
}

/** A parsed feed item, ready to print: headline + short plain-text summary.
 *  Editions stay small and never try to lay out a post's HTML. */
export function toNewsItem(item: FeedItem): NewsItem {
  return {
    title: pdfSafe(toPlainText(item.title)) || "Untitled",
    link: item.link,
    summary: shortSummary(item.summaryHtml || item.contentHtml),
  };
}

/**
 * Fetch and parse each fixed-catalog feed into a section, using the platform
 * fetch (works under Next/Vercel). Per-feed failures are tolerated (a bad feed
 * is skipped, not fatal) so one outage can't sink the whole edition.
 */
export async function fetchNewsSections(source: string, feeds: NewsFeed[], maxPerFeed: number): Promise<NewsSection[]> {
  const sections = await Promise.all(
    feeds.map(async (feed): Promise<NewsSection | null> => {
      try {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": USER_AGENT, Accept: FEED_ACCEPT },
          signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseFeed(await res.text());
        if (!parsed) throw new Error("not an RSS/Atom feed");
        const items = parsed.items.slice(0, maxPerFeed).map(toNewsItem);
        return items.length > 0 ? { label: feed.label, items } : null;
      } catch (err) {
        console.warn(`${source} feed "${feed.key}" failed:`, err instanceof Error ? err.message : err);
        return null;
      }
    }),
  );
  return sections.filter((s): s is NewsSection => s !== null);
}

/** Fresh items from a parsed feed (see pickFreshItems), as printable news items. */
export function freshNewsItems(
  items: FeedItem[],
  now: Date,
  max: number,
  opts: { preview?: boolean },
): NewsItem[] {
  return pickFreshItems(items, now, max, opts).map(toNewsItem);
}

const styles = StyleSheet.create({
  page: { paddingVertical: 48, paddingHorizontal: 56, fontFamily: "Helvetica", color: "#111111" },
  masthead: { fontSize: 26, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  date: { fontSize: 12, color: "#444444", marginBottom: 18 },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    borderBottom: "1pt solid #000000",
    paddingBottom: 3,
    marginBottom: 8,
  },
  item: { marginBottom: 9 },
  itemTitle: { fontSize: 11.5, fontFamily: "Helvetica-Bold", lineHeight: 1.3 },
  // Tappable headline: keep e-ink-friendly dark text; underline is the tap affordance.
  itemLink: { color: "#111111", textDecoration: "underline" },
  itemSummary: { fontSize: 9.5, color: "#333333", lineHeight: 1.4, marginTop: 2 },
  footer: { position: "absolute", bottom: 24, left: 56, right: 56, fontSize: 8, color: "#888888", textAlign: "center" },
  coffee: { fontSize: 9, color: "#888888", marginBottom: 14 },
});

function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

/** A news edition. Grayscale, generous type — built for e-ink.
 *  `digest` suppresses this document's own "Page X of Y" (only correct
 *  relative to its own PDF) since a digest bundle gets one correct page
 *  count drawn across the whole assembled document instead. */
function NewsDocument({
  masthead,
  sections,
  date,
  digest,
}: {
  masthead: string;
  sections: NewsSection[];
  date: Date;
  digest?: boolean;
}) {
  return (
    <Document title={`${masthead} — ${formatIsoDate(date)}`} author="Daily Scribe">
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.masthead}>{masthead}</Text>
        <Text style={styles.date}>{formatLongDate(date)}</Text>
        {!digest && (
          <Link src={BUY_ME_A_COFFEE_URL} style={styles.coffee}>
            Enjoy this with your coffee? Consider buying the creator one, it helps cover the running costs.
          </Link>
        )}
        {sections.map((section) => (
          <View key={section.label} style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{section.label}</Text>
            {section.items.map((item, i) => (
              <View key={i} style={styles.item} wrap={false}>
                {item.link ? (
                  <Link src={item.link} style={[styles.itemTitle, styles.itemLink]}>
                    {item.title}
                  </Link>
                ) : (
                  <Text style={styles.itemTitle}>{item.title}</Text>
                )}
                {item.summary ? <Text style={styles.itemSummary}>{item.summary}</Text> : null}
              </View>
            ))}
          </View>
        ))}
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            digest ? "Delivered by Daily Scribe" : `Delivered by Daily Scribe · Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

/** Render news sections to a PDF buffer (pure JS — no native deps, runs on Vercel). */
export async function renderNewsPdf(
  masthead: string,
  sections: NewsSection[],
  date: Date,
  digest?: boolean,
): Promise<Buffer> {
  return renderToBuffer(<NewsDocument masthead={masthead} sections={sections} date={date} digest={digest} />);
}
