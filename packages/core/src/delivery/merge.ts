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

/**
 * Inverse of mergePdfAssets: pull a subset of pages (0-based indices) out of
 * a PDF into a new, standalone document. Used to trim a mailed-back digest
 * PDF down to just the pages belonging to the service that's processing it,
 * so unrelated pages (e.g. other bundled services' content) aren't stored or
 * sent to a grading model along with it.
 */
export async function extractPdfPages(bytes: Buffer, pageIndices: number[]): Promise<Buffer> {
  const source = await PDFDocument.load(bytes);
  const trimmed = await PDFDocument.create();
  const pages = await trimmed.copyPages(source, pageIndices);
  for (const page of pages) trimmed.addPage(page);
  return Buffer.from(await trimmed.save());
}
