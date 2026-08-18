import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { Asset } from "../plugins/index";
import { assembleDigestPdf, extractPdfPages, getPdfPageCount, mergePdfAssets, type DigestSection } from "./merge";

async function fakePdfAsset(filename: string, pageCount: number, size: [number, number] = [200, 200]): Promise<Asset> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage(size);
  return { filename, contentType: "application/pdf", bytes: Buffer.from(await doc.save()) };
}

describe("mergePdfAssets", () => {
  it("concatenates pages from every asset, in order", async () => {
    const a = await fakePdfAsset("a.pdf", 1);
    const b = await fakePdfAsset("b.pdf", 2);

    const merged = await mergePdfAssets([a, b], "digest-2026-08-16.pdf");

    expect(merged.filename).toBe("digest-2026-08-16.pdf");
    expect(merged.contentType).toBe("application/pdf");
    const mergedDoc = await PDFDocument.load(merged.bytes);
    expect(mergedDoc.getPageCount()).toBe(3);
  });

  it("returns a single-source document unchanged in page count when only one asset is given", async () => {
    const only = await fakePdfAsset("only.pdf", 4);
    const merged = await mergePdfAssets([only], "digest.pdf");
    const mergedDoc = await PDFDocument.load(merged.bytes);
    expect(mergedDoc.getPageCount()).toBe(4);
  });

  it("throws on an empty asset list", async () => {
    await expect(mergePdfAssets([], "digest.pdf")).rejects.toThrow(/no assets to merge/);
  });
});

describe("extractPdfPages", () => {
  it("pulls out just the requested pages, in the right order, discarding the rest", async () => {
    const a = await fakePdfAsset("a.pdf", 1, [100, 100]);
    const b = await fakePdfAsset("b.pdf", 2, [300, 300]);
    const merged = await mergePdfAssets([a, b], "digest.pdf"); // pages: [a, b0, b1]

    const extracted = await extractPdfPages(merged.bytes, [1, 2]);
    const extractedDoc = await PDFDocument.load(extracted);

    expect(extractedDoc.getPageCount()).toBe(2);
    for (const page of extractedDoc.getPages()) {
      expect(page.getWidth()).toBe(300); // b's size, not a's — confirms the right pages came out
    }
  });

  it("round-trips a full-document extraction to the same page count", async () => {
    const only = await fakePdfAsset("only.pdf", 3);
    const extracted = await extractPdfPages(only.bytes, [0, 1, 2]);
    const extractedDoc = await PDFDocument.load(extracted);
    expect(extractedDoc.getPageCount()).toBe(3);
  });
});

describe("getPdfPageCount", () => {
  it("reports a PDF's page count", async () => {
    const asset = await fakePdfAsset("x.pdf", 5);
    await expect(getPdfPageCount(asset.bytes)).resolves.toBe(5);
  });
});

describe("assembleDigestPdf", () => {
  async function buildFixture() {
    const cover = await fakePdfAsset("cover.pdf", 2, [100, 100]); // page1=cover, page2=TOC
    const a = await fakePdfAsset("a.pdf", 1, [300, 300]);
    const b = await fakePdfAsset("b.pdf", 2, [400, 400]);
    const sections: DigestSection[] = [
      { label: "A", asset: a },
      { label: "B", asset: b },
    ];
    const tocLinkRects: [number, number, number, number][] = [
      [10, 700, 500, 730],
      [10, 660, 500, 690],
    ];
    return { cover, sections, tocLinkRects };
  }

  it("places the cover first, then each section's pages, in order", async () => {
    const { cover, sections, tocLinkRects } = await buildFixture();
    const assembled = await assembleDigestPdf(cover, sections, tocLinkRects, "digest.pdf");
    const doc = await PDFDocument.load(assembled.bytes);

    expect(doc.getPageCount()).toBe(5); // 2 cover/TOC + 1 (a) + 2 (b)
    expect(doc.getPage(0).getWidth()).toBe(100); // cover
    expect(doc.getPage(1).getWidth()).toBe(100); // TOC
    expect(doc.getPage(2).getWidth()).toBe(300); // section A's first (only) page
    expect(doc.getPage(3).getWidth()).toBe(400); // section B's first page
    expect(doc.getPage(4).getWidth()).toBe(400); // section B's second page
  });

  it("wires one Link annotation per section on the TOC page, at the given rect, pointing at that section's first page", async () => {
    const { cover, sections, tocLinkRects } = await buildFixture();
    const assembled = await assembleDigestPdf(cover, sections, tocLinkRects, "digest.pdf");
    const doc = await PDFDocument.load(assembled.bytes);

    const tocPage = doc.getPage(1);
    const annots = tocPage.node.Annots();
    expect(annots?.size()).toBe(2);

    const expectedTargets = [doc.getPage(2), doc.getPage(3)]; // section A starts at 2, section B at 3
    for (let i = 0; i < 2; i++) {
      const annotDict = doc.context.lookup(annots!.get(i), PDFDict);
      expect(annotDict.lookup(PDFName.of("Subtype"), PDFName).asString()).toBe("/Link");

      const rect = annotDict.lookup(PDFName.of("Rect"), PDFArray);
      const rectValues = [0, 1, 2, 3].map((idx) => rect.lookup(idx, PDFNumber).asNumber());
      expect(rectValues).toEqual(tocLinkRects[i]);

      const dest = annotDict.lookup(PDFName.of("Dest"), PDFArray);
      const destPageDict = doc.context.lookup(dest.get(0), PDFDict);
      expect(destPageDict).toBe(expectedTargets[i].node);
    }
  });

  it("throws when the assembled document has no TOC page (page 2)", async () => {
    const onePageCoverNoSections = await fakePdfAsset("cover.pdf", 1);
    await expect(assembleDigestPdf(onePageCoverNoSections, [], [], "digest.pdf")).rejects.toThrow();
  });

  it("adds a back-to-contents link on every page after the TOC, but not on the cover or TOC pages themselves", async () => {
    const { cover, sections, tocLinkRects } = await buildFixture();
    const assembled = await assembleDigestPdf(cover, sections, tocLinkRects, "digest.pdf");
    const doc = await PDFDocument.load(assembled.bytes);
    const tocPage = doc.getPage(1);

    expect(doc.getPage(0).node.Annots()).toBeUndefined(); // cover: nothing to link back from

    // TOC page's annots are exactly the 2 section links asserted above — no extra back-link there.
    expect(doc.getPage(1).node.Annots()?.size()).toBe(2);

    for (let i = 2; i < doc.getPageCount(); i++) {
      const page = doc.getPage(i);
      const annots = page.node.Annots();
      expect(annots?.size()).toBe(1);
      const annotDict = doc.context.lookup(annots!.get(0), PDFDict);
      expect(annotDict.lookup(PDFName.of("Subtype"), PDFName).asString()).toBe("/Link");
      const dest = annotDict.lookup(PDFName.of("Dest"), PDFArray);
      const destPageDict = doc.context.lookup(dest.get(0), PDFDict);
      expect(destPageDict).toBe(tocPage.node);
    }
  });
});
