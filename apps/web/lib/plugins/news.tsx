import { formatIsoDate, pickFreshItems } from "@dailyscribe/core";
import { Document, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { htmlToBlocks, parseFeed, pdfSafe, toPlainText, type FeedItem, type TextBlock } from "@/lib/feed-parse";
import { BUY_ME_A_COFFEE_URL } from "@/lib/site";

/**
 * The shared news edition: CBC, BBC and RTÉ (fixed feed catalogs) and Your
 * Feeds (whatever the user adds) all fetch feeds into sections and print them
 * with this one layout.
 */

const SUMMARY_MAX_CHARS = 320;
/** Long posts are cut here, with a pointer to the original. About 6-8 pages. */
const BODY_MAX_CHARS = 24000;

export interface NewsItem {
  title: string;
  summary: string;
  /** Article URL from the feed; when present the headline renders as a tappable link. */
  link?: string;
  /** The full post as paragraphs, when printing full text. */
  body?: TextBlock[];
  /** True when `body` was cut at BODY_MAX_CHARS. */
  truncated?: boolean;
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

/** The full post, cut at BODY_MAX_CHARS on a paragraph boundary. */
function fullBody(html: string): { body: TextBlock[]; truncated: boolean } {
  const body: TextBlock[] = [];
  let chars = 0;
  for (const block of htmlToBlocks(html)) {
    const text = pdfSafe(block.text);
    if (!text) continue;
    if (chars + text.length > BODY_MAX_CHARS && body.length > 0) return { body, truncated: true };
    body.push({ ...block, text });
    chars += text.length;
  }
  return { body, truncated: false };
}

/** A parsed feed item, ready to print: summary only, or the full post when
 *  asked for and the feed carries one. */
export function toNewsItem(item: FeedItem, opts: { fullText?: boolean } = {}): NewsItem {
  const title = pdfSafe(toPlainText(item.title)) || "Untitled";
  const summary = shortSummary(item.summaryHtml || item.contentHtml);
  const fullHtml = item.contentHtml || item.summaryHtml;
  if (opts.fullText && fullHtml) {
    const { body, truncated } = fullBody(fullHtml);
    // A short description that's just the post's opening is redundant above the body.
    if (body.length > 0) return { title, link: item.link, summary: "", body, truncated };
  }
  return { title, link: item.link, summary };
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
        const items = parsed.items.slice(0, maxPerFeed).map((it) => toNewsItem(it));
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
  opts: { preview?: boolean; fullText?: boolean },
): NewsItem[] {
  return pickFreshItems(items, now, max, opts).map((it) => toNewsItem(it, opts));
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
  // Full posts: book-like body text, bigger than a summary.
  article: { marginBottom: 18 },
  articleTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", lineHeight: 1.3, marginBottom: 6 },
  bodyP: { fontSize: 11, lineHeight: 1.5, marginBottom: 6 },
  bodyH: { fontSize: 12, fontFamily: "Helvetica-Bold", lineHeight: 1.4, marginTop: 4, marginBottom: 4 },
  bodyLi: { fontSize: 11, lineHeight: 1.5, marginBottom: 3, paddingLeft: 12 },
  bodyQuote: {
    fontSize: 11,
    fontFamily: "Helvetica-Oblique",
    lineHeight: 1.5,
    marginBottom: 6,
    paddingLeft: 10,
    borderLeft: "2pt solid #999999",
  },
  continued: { fontSize: 9.5, color: "#444444", marginTop: 2 },
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

function Headline({ item, style }: { item: NewsItem; style: typeof styles.itemTitle }) {
  return item.link ? (
    <Link src={item.link} style={[style, styles.itemLink]}>
      {item.title}
    </Link>
  ) : (
    <Text style={style}>{item.title}</Text>
  );
}

const BLOCK_STYLES = { p: styles.bodyP, h: styles.bodyH, li: styles.bodyLi, quote: styles.bodyQuote };

/** A full post. Unlike a summary it may run over several pages, so it's
 *  allowed to break; only the headline is kept with its first paragraph. */
function Article({ item }: { item: NewsItem }) {
  const [first, ...rest] = item.body ?? [];
  return (
    <View style={styles.article}>
      <View wrap={false}>
        <Headline item={item} style={styles.articleTitle} />
        {first && <Text style={BLOCK_STYLES[first.kind]}>{first.kind === "li" ? `• ${first.text}` : first.text}</Text>}
      </View>
      {rest.map((b, i) => (
        <Text key={i} style={BLOCK_STYLES[b.kind]}>
          {b.kind === "li" ? `• ${b.text}` : b.text}
        </Text>
      ))}
      {item.truncated && item.link && (
        <Link src={item.link} style={[styles.continued, styles.itemLink]}>
          Continued online
        </Link>
      )}
    </View>
  );
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
        {sections.map((section) => {
          const full = section.items.some((it) => it.body);
          return (
            // A section of full posts can't be kept on one page, so only
            // summary sections are unbreakable.
            <View key={section.label} style={styles.section} wrap={full}>
              <Text style={styles.sectionTitle} minPresenceAhead={60}>
                {section.label}
              </Text>
              {section.items.map((item, i) =>
                item.body ? (
                  <Article key={i} item={item} />
                ) : (
                  <View key={i} style={styles.item} wrap={false}>
                    <Headline item={item} style={styles.itemTitle} />
                    {item.summary ? <Text style={styles.itemSummary}>{item.summary}</Text> : null}
                  </View>
                ),
              )}
            </View>
          );
        })}
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
