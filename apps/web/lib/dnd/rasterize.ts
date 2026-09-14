import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import * as napiCanvas from "@napi-rs/canvas";
import { getDocument, type PDFPageProxy } from "pdfjs-serverless";
import type { DndFieldBox } from "./layout";

/**
 * Rasterize a DnD "Your Move" page to a bitmap so its fixed-position fields
 * (see lib/dnd/layout.ts) can be read deterministically instead of via a
 * whole-page vision call — see the Milestone 3 cost decision in the plan.
 *
 * pdfjs-serverless ships without a canvas implementation by default (it's
 * built for text-only extraction on the edge — see its use in
 * resend-inbound/route.ts); rendering needs one bridged in via a documented
 * escape hatch: assign an API-compatible canvas module to
 * `globalThis[Symbol.for("pdfjs-serverless.canvasModule")]`, and separately
 * polyfill the global `Path2D` it also expects. @napi-rs/canvas is a good
 * fit here specifically because it ships prebuilt native binaries per
 * platform (no system libcairo etc. to install), which is what actually
 * makes it viable on Vercel — unlike `node-canvas`, which needs those
 * system libraries present at build/runtime and is exactly the kind of
 * dependency Kanji's `pdfjs-dist` DOMMatrix/canvas bundling failure
 * (route.ts comment, ~line 160) was avoiding.
 */
let bridged = false;
export function ensureCanvasBridge(): void {
  if (bridged) return;
  (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("pdfjs-serverless.canvasModule")] = napiCanvas;
  (globalThis as unknown as { Path2D: unknown }).Path2D = napiCanvas.Path2D;
  bridged = true;
}

// ~144dpi at A4 — enough resolution to tell a pen mark from an empty box and
// to OCR a handwritten 1-2 digit number, without the pixel buffers getting large.
const DEFAULT_SCALE = 2;

export interface RasterPage {
  width: number;
  height: number;
  /** Pixels per PDF point — the scale passed to pdf.js's `getViewport`. */
  scale: number;
  ctx: SKRSContext2D;
}

/** Renders an already-resolved page proxy to a bitmap. Split out from
 *  `rasterizePage` below so a caller that also needs to scan page text first
 *  (dnd-check.ts's move reader) can do so against ONE opened document
 *  instead of two — see the comment on `rasterizePage` for why that matters
 *  more than it sounds like it should. */
export async function renderPageToRaster(page: PDFPageProxy, scale = DEFAULT_SCALE): Promise<RasterPage> {
  ensureCanvasBridge();
  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  return { width, height, scale, ctx };
}

/**
 * Opens `pdfBytes` and rasterizes one page. Standalone convenience wrapper —
 * for a caller that also needs `getTextContent` on the same PDF (like
 * dnd-check.ts's move reader), open the document once and call
 * `renderPageToRaster` directly instead of calling this a second time:
 * a second, separate `getDocument()` call in the same process reproducibly
 * broke a *later*, unrelated `await` (traced to pdfjs-serverless's simulated
 * worker "loopback port" — a stray postMessage failed several ticks after
 * the second document's own work had already finished and been destroyed,
 * during an unrelated Gemini network call). Root cause not fully isolated;
 * the practical fix is simply not to open two documents in one request.
 */
export async function rasterizePage(pdfBytes: Uint8Array, pageIndex: number, scale = DEFAULT_SCALE): Promise<RasterPage> {
  ensureCanvasBridge();
  // pdfjs-serverless rejects a Node `Buffer` here even though it's a
  // Uint8Array subclass — normalize defensively rather than relying on every
  // caller to remember `new Uint8Array(buf)` (renderDndPdf returns a Buffer).
  const data = pdfBytes instanceof Buffer ? new Uint8Array(pdfBytes) : pdfBytes;
  const loadingTask = getDocument({ data, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  try {
    if (pageIndex < 0 || pageIndex >= pdf.numPages) {
      throw new Error(`Page index ${pageIndex} out of range (PDF has ${pdf.numPages} pages).`);
    }
    const page = await pdf.getPage(pageIndex + 1); // pdf.js pages are 1-indexed
    return await renderPageToRaster(page, scale);
  } finally {
    await loadingTask.destroy();
  }
}

/** Average grayscale (0 = black, 255 = white) over a field's exact region. */
export function sampleAvgGray(raster: RasterPage, field: Pick<DndFieldBox, "top" | "left" | "width" | "height">): number {
  const { scale } = raster;
  const x = Math.round(field.left * scale);
  const y = Math.round(field.top * scale);
  const w = Math.round(field.width * scale);
  const h = Math.round(field.height * scale);
  const { data } = raster.ctx.getImageData(x, y, w, h);
  if (data.length === 0) return 255;
  let sum = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return sum / pixels;
}

/** Crop a field's region (plus a small pad, to not clip a mark that touches
 *  the box edge) to a standalone PNG buffer, for a scoped vision/OCR read. */
export function cropFieldToPng(
  raster: RasterPage,
  field: Pick<DndFieldBox, "top" | "left" | "width" | "height">,
  padPt = 6,
): Buffer {
  const { scale } = raster;
  const x = Math.max(0, Math.round((field.left - padPt) * scale));
  const y = Math.max(0, Math.round((field.top - padPt) * scale));
  const w = Math.min(raster.width - x, Math.round((field.width + padPt * 2) * scale));
  const h = Math.min(raster.height - y, Math.round((field.height + padPt * 2) * scale));
  const imageData = raster.ctx.getImageData(x, y, w, h);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer("image/png");
}
