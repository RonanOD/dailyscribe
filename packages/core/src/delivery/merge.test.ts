import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { Asset } from "../plugins/index";
import { extractPdfPages, mergePdfAssets } from "./merge";

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
