import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { Asset } from "../plugins/index";
import { mergePdfAssets } from "./merge";

async function fakePdfAsset(filename: string, pageCount: number): Promise<Asset> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([200, 200]);
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
