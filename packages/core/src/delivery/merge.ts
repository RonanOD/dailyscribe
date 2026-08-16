import { PDFDocument } from "pdf-lib";
import type { Asset } from "../plugins/index";

/**
 * Combine several already-rendered PDF assets into one, preserving each
 * source's pages (and their content, e.g. footer text) verbatim and in
 * order. Used to bundle multiple services' PDFs into a single digest email.
 */
export async function mergePdfAssets(assets: Asset[], filename: string): Promise<Asset> {
  if (assets.length === 0) {
    throw new Error("mergePdfAssets: no assets to merge");
  }

  const merged = await PDFDocument.create();
  for (const asset of assets) {
    const source = await PDFDocument.load(asset.bytes);
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  return {
    filename,
    contentType: "application/pdf",
    bytes: Buffer.from(await merged.save()),
  };
}
