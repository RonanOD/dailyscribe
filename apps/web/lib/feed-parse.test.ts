import { describe, expect, it } from "vitest";
import { discoverFeedUrls, htmlToBlocks, parseFeed, pdfSafe, toPlainText } from "./feed-parse";

describe("parseFeed", () => {
  it("reads RSS 2.0, including a Substack-style full post", () => {
    const feed = parseFeed(`<?xml version="1.0"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title><![CDATA[The Local Beat]]></title>
          <item>
            <title><![CDATA[Council approves budget]]></title>
            <link>https://local.example.com/p/budget</link>
            <guid isPermaLink="false">abc</guid>
            <description><![CDATA[A short subtitle]]></description>
            <content:encoded><![CDATA[<p>First paragraph.</p><p>Second.</p>]]></content:encoded>
            <pubDate>Sun, 25 Oct 2026 14:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`);
    expect(feed?.title).toBe("The Local Beat");
    expect(feed?.items).toHaveLength(1);
    const [item] = feed!.items;
    expect(item.title).toBe("Council approves budget");
    expect(item.link).toBe("https://local.example.com/p/budget");
    expect(item.summaryHtml).toBe("A short subtitle");
    expect(item.contentHtml).toBe("<p>First paragraph.</p><p>Second.</p>");
    expect(item.published?.toISOString()).toBe("2026-10-25T14:00:00.000Z");
  });

  it("reads Atom, taking the alternate link and escaped HTML content", () => {
    const feed = parseFeed(`<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title type="text">A Blog</title>
        <entry>
          <title type="html">Post &amp;amp; more</title>
          <link rel="replies" href="https://blog.example.com/p/1#comments"/>
          <link rel="alternate" href="https://blog.example.com/p/1"/>
          <updated>2026-10-24T09:30:00Z</updated>
          <summary>Short</summary>
          <content type="html">&lt;p&gt;Body&lt;/p&gt;</content>
        </entry>
        <entry>
          <title>Second</title>
          <link href="https://blog.example.com/p/2"/>
        </entry>
      </feed>`);
    expect(feed?.title).toBe("A Blog");
    expect(feed?.items.map((i) => i.link)).toEqual(["https://blog.example.com/p/1", "https://blog.example.com/p/2"]);
    expect(toPlainText(feed!.items[0].title)).toBe("Post & more");
    expect(feed?.items[0].contentHtml).toBe("<p>Body</p>");
    expect(feed?.items[0].published?.toISOString()).toBe("2026-10-24T09:30:00.000Z");
    expect(feed?.items[1].published).toBeUndefined();
  });

  it("reads RSS 1.0 (RDF), where items sit beside the channel", () => {
    const feed = parseFeed(`<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <channel rdf:about="https://old.example.com/"><title>Old Site</title></channel>
        <item rdf:about="https://old.example.com/1">
          <title>One</title><link>https://old.example.com/1</link><dc:date>2026-10-20T08:00:00Z</dc:date>
        </item>
      </rdf:RDF>`);
    expect(feed?.title).toBe("Old Site");
    expect(feed?.items[0].title).toBe("One");
    expect(feed?.items[0].published?.toISOString()).toBe("2026-10-20T08:00:00.000Z");
  });

  it("returns null for a web page or junk", () => {
    expect(parseFeed("<!doctype html><html><head><title>Hi</title></head><body></body></html>")).toBeNull();
    expect(parseFeed("not xml")).toBeNull();
  });
});

describe("discoverFeedUrls", () => {
  it("finds advertised RSS/Atom feeds and resolves relative hrefs", () => {
    const html = `<head>
      <link rel="stylesheet" href="/style.css">
      <link rel="alternate" type="application/rss+xml" title="Posts" href="/feed">
      <link type="application/atom+xml" href="https://cdn.example.com/atom.xml?a=1&amp;b=2" rel="alternate">
      <link rel="alternate" hreflang="fr" href="/fr/">
    </head>`;
    expect(discoverFeedUrls(html, "https://writer.substack.com/")).toEqual([
      "https://writer.substack.com/feed",
      "https://cdn.example.com/atom.xml?a=1&b=2",
    ]);
  });
});

describe("htmlToBlocks", () => {
  it("splits paragraphs, headings, list items and quotes, dropping media and widgets", () => {
    const blocks = htmlToBlocks(`
      <h2>The vote</h2>
      <p>Council met on <strong>Tuesday</strong>&nbsp;night.<br>It ran late.</p>
      <figure><img src="x.jpg"><figcaption>Photo caption</figcaption></figure>
      <ul><li>Roads: $2M</li><li>Parks</li></ul>
      <blockquote><p>We did our best.</p></blockquote>
      <div class="subscription-widget"><form><input type="email"><button>Subscribe</button></form></div>
      <script>alert(1)</script>
      <p class="button-wrapper"><a class="button primary" href="https://x.substack.com/p/1?action=share"><span>Share</span></a></p>
      <div><div class="share-dialog"><p>Share this</p></div></div>
      <p>Thanks for reading &mdash; see you next week.</p>`);
    expect(blocks).toEqual([
      { kind: "h", text: "The vote" },
      { kind: "p", text: "Council met on Tuesday night." },
      { kind: "p", text: "It ran late." },
      { kind: "li", text: "Roads: $2M" },
      { kind: "li", text: "Parks" },
      { kind: "quote", text: "We did our best." },
      { kind: "p", text: "Thanks for reading — see you next week." },
    ]);
  });
});

describe("pdfSafe", () => {
  it("keeps Latin-1 and typographic punctuation, drops what Helvetica can't draw", () => {
    expect(pdfSafe("Café “quotes” — fine… 🎉 naïve 日本")).toBe("Café “quotes” — fine… naïve");
  });
});
