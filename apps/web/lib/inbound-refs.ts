// Every PDF Daily Scribe generates carries `dailyscribe:<service>:<token>` in
// its footer text, so a single shared inbound address can route mail for any
// (current or future) service without the address itself encoding anything —
// the mailed-back PDF is the only source of truth. Kindle Scribe's annotate
// pipeline strips PDF /Info metadata, but its actual text content stream
// survives intact (confirmed against a real round-tripped submission), so
// this is read via plain text extraction, not vision/OCR.
const SUBJECT_RE = /dailyscribe:([a-z0-9_-]+):([a-f0-9]+)/;

export interface InboundRefGroup {
  service: string;
  token: string;
  pageIndices: number[];
}

/**
 * Scans every page for the `dailyscribe:<service>:<token>` footer tag,
 * grouping pages by which service+token they belong to. A mailed-back
 * submission can combine pages from *multiple different* mail-back-capable
 * services at once — e.g. a digest reply where the user marked up and
 * returned both a Kanji page and a DnD page in one email — and each group
 * needs to reach its own service's handler independently. An earlier version
 * of this function only kept the first service it found and silently
 * dropped every other service's pages from the same submission; confirmed
 * against a real combined Kanji+DnD reply where the DnD half vanished with
 * no trace at all (Kanji, found first, processed fine).
 *
 * Lives outside app/api/webhooks/resend-inbound/route.ts because a Next
 * route file may only export recognized handler/config names — anything
 * else fails Next's generated route typechecking.
 */
export async function extractInboundRefs(pdfBytes: Buffer): Promise<InboundRefGroup[]> {
  try {
    // pdfjs-dist's Node build needs @napi-rs/canvas (a native binary) for
    // DOMMatrix/Path2D polyfills, which didn't survive Vercel's serverless
    // bundling (ReferenceError: DOMMatrix is not defined, confirmed against
    // a real production failure) — pdfjs-serverless is a purpose-built
    // pdfjs-dist wrapper with pure-JS polyfills for exactly this class of
    // environment, no native deps.
    const { getDocument } = await import("pdfjs-serverless");
    const loadingTask = getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true });
    const doc = await loadingTask.promise;
    try {
      const groups = new Map<string, InboundRefGroup>();
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
        // A hyphenated line-wrap can split the ref token itself (e.g. "dai-\nlyscribe:kanji:…"),
        // which the plain join above renders as "dai- lyscribe:kanji:…" — defeat that by also
        // trying a hyphen-unwrapped variant before giving up on a page.
        const match = pageText.match(SUBJECT_RE) ?? pageText.replace(/-\s+/g, "").match(SUBJECT_RE);
        if (!match) continue;
        const key = `${match[1]}:${match[2]}`;
        let group = groups.get(key);
        if (!group) {
          group = { service: match[1], token: match[2], pageIndices: [] };
          groups.set(key, group);
        }
        group.pageIndices.push(i - 1); // 0-based, for pdf-lib
      }
      return Array.from(groups.values());
    } finally {
      // Undestroyed, pdfjs-serverless's simulated worker "loopback port" left
      // a background message pending that broke a later getDocument() call
      // in the same process (reproduced in testing while building the DnD
      // mail-back path, which now calls getDocument() again after this).
      // `destroy()` lives on the loading task, not the resolved document.
      await loadingTask.destroy();
    }
  } catch (err) {
    console.error("resend-inbound: pdfjs-serverless failed to parse/extract text:", err instanceof Error ? err.stack : err);
    return [];
  }
}
