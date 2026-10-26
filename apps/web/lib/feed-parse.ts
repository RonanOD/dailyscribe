import { XMLParser } from "fast-xml-parser";

/**
 * Feed parsing for the news services. The CBC/BBC/RTÉ feeds are known RSS 2.0,
 * but "Your Feeds" takes whatever URL a user pastes in, so this also reads
 * Atom (many blogs and newer sites) and RSS 1.0/RDF (some older ones), turns
 * full-post HTML into paragraphs, and finds the feed behind a homepage URL.
 */

export interface FeedItem {
  title: string;
  /** Article URL from the feed; when present the headline renders as a tappable link. */
  link?: string;
  /** The short description (RSS `description`, Atom `summary`), still HTML. */
  summaryHtml: string;
  /** The full post (RSS `content:encoded`, Atom `content`), still HTML, when the feed carries it. */
  contentHtml: string;
  published?: Date;
}

export interface ParsedFeed {
  title: string;
  items: FeedItem[];
}

// Attributes are kept because Atom puts its links in them (<link href="…"/>).
// fast-xml-parser folds CDATA into the tag's text value by default, which is what we want.
const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: true,
  trimValues: true,
});

type Node = Record<string, unknown>;

/** Text of a parsed node: a bare string/number, or the `#text` of an element with attributes. */
function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "#text" in v) return textOf((v as Node)["#text"]);
  return "";
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
}

function parseDate(v: unknown): Date | undefined {
  const s = textOf(v).trim();
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function httpLink(v: string): string | undefined {
  const s = v.trim();
  return /^https?:\/\//i.test(s) ? s : undefined;
}

/** Atom: prefer rel="alternate" (the default when rel is absent). */
function atomLink(v: unknown): string | undefined {
  const links = asArray(v as Node | Node[]);
  const alt = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
  return alt ? httpLink(String(alt["@_href"] ?? "")) : undefined;
}

function rssItem(it: Node): FeedItem {
  return {
    title: textOf(it.title),
    link: httpLink(textOf(it.link) || textOf(it.guid)),
    summaryHtml: textOf(it.description),
    contentHtml: textOf(it["content:encoded"]),
    published: parseDate(it.pubDate ?? it["dc:date"]),
  };
}

function atomEntry(e: Node): FeedItem {
  return {
    title: textOf(e.title),
    link: atomLink(e.link),
    summaryHtml: textOf(e.summary),
    contentHtml: textOf(e.content),
    published: parseDate(e.published ?? e.updated),
  };
}

/** Parse an RSS 2.0, Atom or RSS 1.0 document; null when the body isn't a feed. */
export function parseFeed(body: string): ParsedFeed | null {
  let doc: Node;
  try {
    doc = xml.parse(body) as Node;
  } catch {
    return null;
  }
  const rss = doc?.rss as Node | undefined;
  if (rss && typeof rss === "object") {
    const channel = (rss.channel ?? {}) as Node;
    return { title: textOf(channel.title), items: asArray(channel.item as Node | Node[]).map(rssItem) };
  }
  const feed = doc?.feed as Node | undefined;
  if (feed && typeof feed === "object") {
    return { title: textOf(feed.title), items: asArray(feed.entry as Node | Node[]).map(atomEntry) };
  }
  const rdf = doc?.["rdf:RDF"] as Node | undefined;
  if (rdf && typeof rdf === "object") {
    const channel = (rdf.channel ?? {}) as Node;
    return { title: textOf(channel.title), items: asArray(rdf.item as Node | Node[]).map(rssItem) };
  }
  return null;
}

const FEED_TYPES = /application\/(rss|atom|rdf)\+xml/i;

/** Feed URLs a web page advertises in its <head> (<link rel="alternate" type="application/rss+xml" href="…">),
 *  resolved against the page's URL. */
export function discoverFeedUrls(html: string, pageUrl: string): string[] {
  const found: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
    if (!/\balternate\b/i.test(attr("rel") ?? "") || !FEED_TYPES.test(attr("type") ?? "")) continue;
    const href = attr("href");
    if (!href) continue;
    try {
      const url = new URL(decodeEntities(href), pageUrl).toString();
      if (!found.includes(url)) found.push(url);
    } catch {
      // Unparseable href: skip it.
    }
  }
  return found;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  eacute: "é",
  egrave: "è",
  aacute: "á",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  ccedil: "ç",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  euro: "€",
  pound: "£",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? " ");
}

function safeCodePoint(n: number): string {
  try {
    return String.fromCodePoint(n);
  } catch {
    return " ";
  }
}

/** Strip HTML tags + decode entities, collapsing whitespace. */
export function toPlainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export interface TextBlock {
  kind: "p" | "h" | "li" | "quote";
  text: string;
}

/** Elements whose content is dropped: code, media, and the subscribe/share
 *  widgets newsletter platforms put in the post body. */
const SKIP = new Set(["script", "style", "noscript", "figure", "picture", "video", "audio", "iframe", "svg", "form", "button", "table"]);
/** Elements dropped by class: Substack's share/subscribe buttons and widgets,
 *  and the like on other platforms. */
const SKIP_CLASS = /\b(button|button-wrapper|subscription-widget[\w-]*|share[\w-]*|social[\w-]*|footnote-anchor)\b/i;
/** Elements that end the current paragraph. */
const BLOCK = new Set([
  "p", "div", "br", "hr", "li", "ul", "ol", "blockquote", "pre", "section", "article", "header", "footer",
  "h1", "h2", "h3", "h4", "h5", "h6",
]);

/**
 * A post body as paragraphs, headings, list items and quotes, for printing.
 * Images, embeds, tables and widgets are dropped: the PDF is text, and a link
 * to the original sits on the headline. A small tokenizer rather than a DOM,
 * since feed HTML only needs to be read, never trusted or re-emitted.
 */
export function htmlToBlocks(html: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let buf = "";
  // While inside a dropped element: its tag name, and how deeply that tag
  // is nested inside itself (so the right closing tag ends the skip).
  let skipName: string | null = null;
  let skipDepth = 0;
  let heading = 0;
  let listItem = 0;
  let quote = 0;
  const flush = () => {
    const text = decodeEntities(buf).replace(/\s+/g, " ").trim();
    buf = "";
    if (!text) return;
    const kind = heading > 0 ? "h" : listItem > 0 ? "li" : quote > 0 ? "quote" : "p";
    blocks.push({ kind, text });
  };
  for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b([^>]*?)(\/?)>|<!--[\s\S]*?-->|[^<]+|</g)) {
    const [token, closing, rawName, attrs, selfClosing] = m;
    if (!rawName) {
      if (!skipName && !token.startsWith("<!--")) buf += token;
      continue;
    }
    const name = rawName.toLowerCase();
    if (skipName) {
      if (name === skipName && !selfClosing) skipDepth += closing ? -1 : 1;
      if (skipDepth === 0) skipName = null;
      continue;
    }
    const cls = attrs.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
    if (!closing && !selfClosing && (SKIP.has(name) || SKIP_CLASS.test(cls))) {
      skipName = name;
      skipDepth = 1;
      continue;
    }
    if (SKIP.has(name) || !BLOCK.has(name)) continue;
    flush();
    const delta = closing ? -1 : selfClosing || name === "br" || name === "hr" ? 0 : 1;
    if (/^h[1-6]$/.test(name)) heading = Math.max(0, heading + delta);
    else if (name === "li") listItem = Math.max(0, listItem + delta);
    else if (name === "blockquote") quote = Math.max(0, quote + delta);
  }
  flush();
  return blocks;
}

// The PDF's built-in Helvetica only covers Windows-1252, so anything outside
// it (emoji, CJK, most of Unicode) would print as garbage. These are the
// characters 0x80-0x9F of Windows-1252, which sit outside Latin-1.
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const LOOKALIKES: Record<string, string> = {
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "―": "—",
  "′": "'",
  "″": '"',
  "−": "-",
  " ": " ",
};

/** Text the built-in PDF fonts can draw: lookalikes swapped in, everything else dropped. */
export function pdfSafe(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (LOOKALIKES[ch]) out += LOOKALIKES[ch];
    else if ((code >= 0x20 && code < 0x7f) || (code >= 0xa1 && code <= 0xff) || CP1252_EXTRA.has(ch)) out += ch;
    else if (/\s/.test(ch)) out += " ";
  }
  return out.replace(/ {2,}/g, " ").trim();
}
