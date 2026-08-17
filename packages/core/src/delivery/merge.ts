import { PDFDocument, PDFName } from "pdf-lib";
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

/** Page count of a PDF, without keeping the parsed document around. */
export async function getPdfPageCount(bytes: Buffer): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

/** A digest's bundled section: one member service's already-rendered PDF, labeled for the TOC. */
export interface DigestSection {
  label: string;
  asset: Asset;
}

/**
 * Assembles a digest: a pre-rendered cover+TOC asset (page 1 = cover, page 2
 * = table of contents) followed by each section's pages, then wires the
 * TOC's rows as tappable "go to page" links pointing at each section's
 * first page in the assembled document. `tocLinkRects` gives each row's
 * clickable rectangle (PDF points, page-2 origin bottom-left), in the same
 * order as `sections` — the cover renderer owns the TOC layout, so it's the
 * only place that knows where each row actually lands on the page.
 */
export async function assembleDigestPdf(
  cover: Asset,
  sections: DigestSection[],
  tocLinkRects: [number, number, number, number][],
  filename: string,
): Promise<Asset> {
  const merged = await PDFDocument.create();

  const coverDoc = await PDFDocument.load(cover.bytes);
  const coverPages = await merged.copyPages(coverDoc, coverDoc.getPageIndices());
  for (const page of coverPages) merged.addPage(page);

  const sectionStartIndices: number[] = [];
  for (const { asset } of sections) {
    sectionStartIndices.push(merged.getPageCount());
    const source = await PDFDocument.load(asset.bytes);
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  // pdf-lib has no high-level "add link" helper, so each TOC row's link is
  // built as a raw Link annotation on the TOC page (index 1 — page 2).
  const tocPage = merged.getPage(1);
  const annots = (tocPage.node.Annots()?.asArray() ?? []).slice();
  for (let i = 0; i < sections.length; i++) {
    const targetPage = merged.getPage(sectionStartIndices[i]);
    const linkRef = merged.context.register(
      merged.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: tocLinkRects[i],
        Border: [0, 0, 0],
        Dest: [targetPage.ref, "Fit"],
      }),
    );
    annots.push(linkRef);
  }
  tocPage.node.set(PDFName.of("Annots"), merged.context.obj(annots));

  return {
    filename,
    contentType: "application/pdf",
    bytes: Buffer.from(await merged.save()),
  };
}
