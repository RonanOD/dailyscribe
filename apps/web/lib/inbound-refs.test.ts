import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { extractInboundRefs } from "./inbound-refs";

/** Builds a synthetic PDF with one page per (service, token) pair — real
 *  vector text content, same as what pdfjs's getTextContent reads off an
 *  actual mailed-back submission. Layout doesn't matter here, only text. */
async function buildPdf(pages: { service: string; token: string }[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const { service, token } of pages) {
    const page = doc.addPage([200, 200]);
    page.drawText(`Ref: dailyscribe:${service}:${token}`, { x: 10, y: 100, size: 10 });
  }
  return Buffer.from(await doc.save());
}

describe("extractInboundRefs", () => {
  it("returns one group for a single-service submission", async () => {
    const pdf = await buildPdf([
      { service: "kanji", token: "abc123" },
      { service: "kanji", token: "abc123" },
    ]);
    const groups = await extractInboundRefs(pdf);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({ service: "kanji", token: "abc123", pageIndices: [0, 1] });
  });

  it("splits a combined submission into one group per service, not just the first", async () => {
    // Reproduces the real bug: a digest reply mailed back with a Kanji page
    // and a DnD page in one email. The old extractInboundRef kept only the
    // first-found service (kanji here) and silently dropped the dnd page.
    const pdf = await buildPdf([
      { service: "kanji", token: "a1b2c3d4" },
      { service: "dnd", token: "deadbeef" },
    ]);
    const groups = await extractInboundRefs(pdf);
    expect(groups).toHaveLength(2);

    const kanji = groups.find((g) => g.service === "kanji");
    const dnd = groups.find((g) => g.service === "dnd");
    expect(kanji).toEqual({ service: "kanji", token: "a1b2c3d4", pageIndices: [0] });
    expect(dnd).toEqual({ service: "dnd", token: "deadbeef", pageIndices: [1] });
  });

  it("keeps interleaved pages of the same service+token together", async () => {
    const pdf = await buildPdf([
      { service: "dnd", token: "aaaa1111" },
      { service: "kanji", token: "bbbb2222" },
      { service: "dnd", token: "aaaa1111" },
    ]);
    const groups = await extractInboundRefs(pdf);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.service === "dnd")?.pageIndices).toEqual([0, 2]);
    expect(groups.find((g) => g.service === "kanji")?.pageIndices).toEqual([1]);
  });

  it("returns an empty array when no page carries a dailyscribe ref", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const pdf = Buffer.from(await doc.save());
    expect(await extractInboundRefs(pdf)).toEqual([]);
  });
});
