import {
  createDndCharacterSheetOcrClient,
  createDndMoveFieldOcrClient,
  isBlankCharacterSheet,
  type DndCharacterSheetInput,
  type DndConfidence,
  type DndMoveFieldOcrResult,
  type DndMoveInput,
} from "@dailyscribe/core";
import { getDocument } from "pdfjs-serverless";
import {
  DND_MOVE_CHECKBOXES,
  DND_MOVE_EXIT_SLOTS,
  DND_MOVE_FILL_INS,
  DND_NEXT_ADVENTURE_SLOTS,
  DND_NEXT_HERO_CHECKBOXES,
} from "./layout";
import { readCheckboxes, type CheckboxRead } from "./mark-reader";
import { cropFieldToPng, renderPageToRaster, type RasterPage } from "./rasterize";

const MOVE_PAGE_MARKER = "Your Move"; // DndDocument's MovePage masthead text (lib/plugins/dnd.tsx).
const NEXT_PAGE_MARKER = "Your Next Adventure"; // NextAdventurePage's masthead text.

/**
 * Finds and rasterizes the page with `marker` (e.g. the move-input page) from a possibly multi-page
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
async function findAndRasterizePage(pdfBytes: Uint8Array, marker: string): Promise<RasterPage | null> {
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
      if (text.includes(marker)) return await renderPageToRaster(page);
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
  /** From the "next adventure" page: the adventure slot ticked, if any. */
  adventureSlot?: number | null;
}

/** "Keep my hero" ticked on the next-adventure page: no vision read needed. */
export interface DndKeepHeroReadResult {
  kind: "keep";
  adventureSlot: number | null;
  diagnostics: { checkboxes: CheckboxRead[] };
}

export type DndReplyRead = DndMoveReadResult | DndCharacterReadResult | DndKeepHeroReadResult;

export interface ReadDndReplyParams {
  /** The trimmed submission — just this service's own pages (see extractPdfPages in route.ts). */
  pdfBytes: Uint8Array;
  expectedShape: "move" | "character" | "next";
  /** "next" only: whether "Keep my hero" is on offer (after a win, not a death). */
  canKeepHero?: boolean;
  /** The current room's exits in slot order (`moveExitOptions`), so a marked
   *  exit checkbox can be mapped back to its direction. */
  exitOptions?: string[];
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
 * - "character" (the rare path — campaign start, at most a couple of times
 *   per user): one whole-page Gemini vision call, same as the old repo's
 *   process_vision.py — cost doesn't matter at this volume.
 * - "next" (after a win or a death): the keep-hero and adventure boxes are
 *   read by pixel darkness like a move; only a new hero costs the
 *   whole-page vision call.
 */
export async function readDndReply(params: ReadDndReplyParams): Promise<DndReplyRead> {
  const readSheet = async () => {
    const client = createDndCharacterSheetOcrClient({ apiKey: params.apiKey, model: params.model });
    return client.read({ pdfBytes: Buffer.from(params.pdfBytes), contentType: "application/pdf" });
  };

  if (params.expectedShape === "character") {
    return { kind: "character", sheet: await readSheet() };
  }

  if (params.expectedShape === "next") {
    const page = await findAndRasterizePage(params.pdfBytes, NEXT_PAGE_MARKER);
    // An older victory/defeat page (just a creation sheet) mailed back after
    // this shipped: read it as a new hero in the default adventure, or, left
    // blank after a win, as keeping the hero.
    if (!page) {
      const sheet = await readSheet();
      if (params.canKeepHero && isBlankCharacterSheet(sheet)) {
        return { kind: "keep", adventureSlot: null, diagnostics: { checkboxes: [] } };
      }
      return { kind: "character", sheet };
    }

    const checkboxes = readCheckboxes(page, [...DND_NEXT_HERO_CHECKBOXES, ...DND_NEXT_ADVENTURE_SLOTS]);
    const marked = (id: string) => checkboxes.find((c) => c.id === id)?.marked ?? false;
    const slot = DND_NEXT_ADVENTURE_SLOTS.findIndex((f) => marked(f.id));
    const adventureSlot = slot === -1 ? null : slot;
    // Ticking both reads as a new hero: a filled-in sheet is the stronger signal.
    if (params.canKeepHero && marked("keep_hero") && !marked("new_hero")) {
      return { kind: "keep", adventureSlot, diagnostics: { checkboxes } };
    }
    const sheet = await readSheet();
    // Neither box ticked and no sheet filled in after a win: keep the hero
    // rather than build a blank "Hero" in their place.
    if (params.canKeepHero && !marked("new_hero") && isBlankCharacterSheet(sheet)) {
      return { kind: "keep", adventureSlot, diagnostics: { checkboxes } };
    }
    return { kind: "character", sheet, adventureSlot };
  }

  const raster = await findAndRasterizePage(params.pdfBytes, MOVE_PAGE_MARKER);
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
  // First marked exit slot wins; a slot past the room's exits (stray mark on
  // an undrawn box) maps to nothing.
  const markedExitSlot = DND_MOVE_EXIT_SLOTS.findIndex((f) => checkboxById.get(f.id)?.marked);
  const chosenExit = markedExitSlot === -1 ? null : (params.exitOptions?.[markedExitSlot] ?? null);

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
