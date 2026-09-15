import {
  createDndCharacterSheetOcrClient,
  createDndMoveFieldOcrClient,
  type DndCharacterSheetInput,
  type DndConfidence,
  type DndMoveFieldOcrResult,
  type DndMoveInput,
} from "@dailyscribe/core";
import { getDocument } from "pdfjs-serverless";
import { DND_MOVE_CHECKBOXES, DND_MOVE_FILL_INS } from "./layout";
import { readCheckboxes, type CheckboxRead } from "./mark-reader";
import { cropFieldToPng, renderPageToRaster, type RasterPage } from "./rasterize";

const MOVE_PAGE_MARKER = "Your Move"; // DndDocument's MovePage masthead text (lib/plugins/dnd.tsx).

/**
 * Finds and rasterizes the move-input page from a possibly multi-page
 * trimmed submission — the player may have mailed back just that one page,
 * or the whole 3-page packet (adventure/move/character-sheet), so its
 * position isn't fixed; a cheap text-content scan finds it (same technique
 * the webhook already uses to find the `dailyscribe:` ref itself).
 *
 * Deliberately opens ONE pdfjs-serverless document for both the text scan
 * and the render, rather than calling `rasterizePage` (which opens its own):
 * a second, separate `getDocument()` call in the same process reproducibly
 * broke a *later*, unrelated `await` elsewhere in this request (traced to
 * pdfjs-serverless's simulated worker "loopback port"). See rasterize.ts's
 * `rasterizePage` doc comment for the full story.
 */
async function findAndRasterizeMovePage(pdfBytes: Uint8Array): Promise<RasterPage | null> {
  // See the matching comment in rasterize.ts's rasterizePage — pdfjs-serverless
  // rejects a Node `Buffer` even though it's a Uint8Array subclass.
  const data = pdfBytes instanceof Buffer ? new Uint8Array(pdfBytes) : pdfBytes;
  const loadingTask = getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
      if (text.includes(MOVE_PAGE_MARKER)) return await renderPageToRaster(page);
    }
    return null;
  } finally {
    await loadingTask.destroy();
  }
}

function worstConfidence(confidences: DndConfidence[]): DndConfidence {
  if (confidences.length === 0) return "low";
  if (confidences.includes("low")) return "low";
  if (confidences.includes("medium")) return "medium";
  return "high";
}

function asNumber(byId: Map<string, DndMoveFieldOcrResult>, id: string): number | null {
  const raw = byId.get(id)?.value;
  if (raw == null) return null;
  const digits = raw.match(/-?\d+/);
  if (!digits) return null;
  const n = Number(digits[0]);
  return Number.isFinite(n) ? n : null;
}

function asWord(byId: Map<string, DndMoveFieldOcrResult>, id: string): string | null {
  const raw = byId.get(id)?.value?.trim().toLowerCase();
  return raw || null;
}

/** Builds the "Last move, as I read it" echo text directly from the
 *  structured read — deterministic, no extra AI call, since the old repo's
 *  `actions_summary` was just a one-sentence recap of the same data. */
function describeMoveSummary(checkboxLabels: string[], fields: Record<string, string | number | null>): string {
  const parts: string[] = [];
  if (checkboxLabels.length > 0) parts.push(`${checkboxLabels.join(", ")} marked.`);
  for (const [label, value] of Object.entries(fields)) {
    if (value != null && value !== "") parts.push(`${label}: ${value}.`);
  }
  return parts.length > 0 ? parts.join(" ") : "Nothing marked.";
}

export interface DndMoveReadResult {
  kind: "move";
  move: DndMoveInput;
  diagnostics: { checkboxes: CheckboxRead[]; fieldOcr: DndMoveFieldOcrResult[] };
}

export interface DndCharacterReadResult {
  kind: "character";
  sheet: DndCharacterSheetInput;
}

export type DndReplyRead = DndMoveReadResult | DndCharacterReadResult;

export interface ReadDndReplyParams {
  /** The trimmed submission — just this service's own pages (see extractPdfPages in route.ts). */
  pdfBytes: Uint8Array;
  expectedShape: "move" | "character";
  apiKey: string;
  model?: string;
}

/**
 * Reads a mailed-back DnD reply into the shape `engine.ts` expects. Two very
 * different paths by design (see the cost decision in the project plan):
 *
 * - "move" (the frequent path — every ordinary turn): deterministic
 *   checkbox detection (no AI) plus one batched Gemini call over small
 *   per-field crops for the handful of numeric/word fill-ins.
 * - "character" (the rare path — campaign start or after death, at most a
 *   couple of times per user): one whole-page Gemini vision call, same as
 *   the old repo's process_vision.py — cost doesn't matter at this volume.
 */
export async function readDndReply(params: ReadDndReplyParams): Promise<DndReplyRead> {
  if (params.expectedShape === "character") {
    const client = createDndCharacterSheetOcrClient({ apiKey: params.apiKey, model: params.model });
    const sheet = await client.read({ pdfBytes: Buffer.from(params.pdfBytes), contentType: "application/pdf" });
    return { kind: "character", sheet };
  }

  const raster = await findAndRasterizeMovePage(params.pdfBytes);
  if (!raster) {
    throw new Error('Mailed-back PDF has no page matching the "Your Move" page — nothing to read.');
  }

  const checkboxes = readCheckboxes(raster);
  const checkboxById = new Map(checkboxes.map((c) => [c.id, c]));

  const client = createDndMoveFieldOcrClient({ apiKey: params.apiKey, model: params.model });
  const fieldOcr = await client.readFields(
    DND_MOVE_FILL_INS.map((field) => ({
      id: field.id,
      label: field.label,
      valueType: field.valueType ?? "word",
      imageBytes: cropFieldToPng(raster, field),
    })),
  );
  const fieldById = new Map(fieldOcr.map((r) => [r.id, r]));

  const checkboxLabelsMarked = DND_MOVE_CHECKBOXES.filter((f) => f.id !== "misread" && checkboxById.get(f.id)?.marked).map(
    (f) => f.label,
  );
  const misreadFlag = checkboxById.get("misread")?.marked ?? false;

  const toHit = asNumber(fieldById, "toHit");
  const damageDealt = asNumber(fieldById, "damage");
  const damageTaken = asNumber(fieldById, "damageTaken");
  const initiativeRoll = asNumber(fieldById, "initiative");
  const stealthRoll = asNumber(fieldById, "stealth");
  const healAmount = asNumber(fieldById, "heal");
  const perceptionRoll = asNumber(fieldById, "perception");
  const chosenExit = asWord(fieldById, "exit");

  const move: DndMoveInput = {
    diceRolls: toHit != null ? [{ label: "to hit", total: toHit }] : [],
    damageDealt,
    damageTaken,
    healAmount,
    stealthRoll,
    initiativeRoll,
    perceptionRoll,
    chosenExit,
    checkboxesMarked: checkboxLabelsMarked,
    misreadFlag,
    actionsSummary: describeMoveSummary(checkboxLabelsMarked, {
      "To Hit": toHit,
      Damage: damageDealt,
      "Damage Taken": damageTaken,
      Initiative: initiativeRoll,
      Stealth: stealthRoll,
      Heal: healAmount,
      Perception: perceptionRoll,
      Exit: chosenExit,
    }),
    confidence: worstConfidence(fieldOcr.map((r) => r.confidence)),
  };

  return { kind: "move", move, diagnostics: { checkboxes, fieldOcr } };
}
