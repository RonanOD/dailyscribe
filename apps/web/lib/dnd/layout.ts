/**
 * Fixed pixel/point positions for every field on the "Your Move" page —
 * shared source of truth between the renderer (lib/plugins/dnd.tsx, which
 * draws each box at these coordinates) and the mail-back reader (rasterize.ts
 * + mark-reader.ts, which samples/crops the mailed-back scan at these same
 * coordinates). Never duplicate these numbers elsewhere — a renderer layout
 * tweak that isn't reflected here silently desyncs mark-reading from what's
 * actually on the page.
 *
 * Coordinates are react-pdf points (1/72"), relative to the page's top-left,
 * on an A4 page (595.28 x 841.89pt) — the same size DndDocument renders at.
 * This page is deliberately the ONLY content on its own <Page>, with nothing
 * of variable length above it (no wrapped narrative text etc.), so these
 * fixed positions are exactly where they'll land at render time.
 */

export type DndFieldKind = "checkbox" | "fill";

export interface DndFieldBox {
  id: string;
  label: string;
  kind: DndFieldKind;
  top: number;
  left: number;
  width: number;
  height: number;
  /** "fill" fields only — hints the mail-back OCR read to what it should expect. */
  valueType?: "number" | "word";
}

export const DND_MOVE_PAGE_SIZE = { width: 595.28, height: 841.89 };

export const DND_MOVE_CHECKBOXES: DndFieldBox[] = [
  { id: "attack", label: "Attack", kind: "checkbox", top: 150, left: 56, width: 14, height: 14 },
  { id: "sneak", label: "Sneak / Stealth past", kind: "checkbox", top: 178, left: 56, width: 14, height: 14 },
  { id: "flee", label: "Flee / Retreat", kind: "checkbox", top: 206, left: 56, width: 14, height: 14 },
  { id: "dodge", label: "Dodge", kind: "checkbox", top: 234, left: 56, width: 14, height: 14 },
  { id: "potion", label: "Drink Potion", kind: "checkbox", top: 262, left: 56, width: 14, height: 14 },
  { id: "search", label: "Search Room", kind: "checkbox", top: 290, left: 56, width: 14, height: 14 },
  { id: "misread", label: "Misread last move — try again", kind: "checkbox", top: 340, left: 56, width: 14, height: 14 },
];

export const DND_MOVE_FILL_INS: DndFieldBox[] = [
  { id: "toHit", label: "To Hit", kind: "fill", top: 150, left: 340, width: 110, height: 22, valueType: "number" },
  { id: "damage", label: "Damage", kind: "fill", top: 190, left: 340, width: 110, height: 22, valueType: "number" },
  { id: "damageTaken", label: "Damage Taken", kind: "fill", top: 230, left: 340, width: 110, height: 22, valueType: "number" },
  { id: "initiative", label: "Initiative", kind: "fill", top: 270, left: 340, width: 110, height: 22, valueType: "number" },
  { id: "stealth", label: "Stealth", kind: "fill", top: 310, left: 340, width: 110, height: 22, valueType: "number" },
  { id: "heal", label: "Heal (2d4+2)", kind: "fill", top: 350, left: 340, width: 110, height: 22, valueType: "number" },
  { id: "perception", label: "Perception (DC 12 to search)", kind: "fill", top: 390, left: 340, width: 110, height: 22, valueType: "number" },
  { id: "exit", label: "Exit taken (e.g. north, down)", kind: "fill", top: 400, left: 56, width: 150, height: 22, valueType: "word" },
];

export const DND_MOVE_FIELD_LAYOUT: DndFieldBox[] = [...DND_MOVE_CHECKBOXES, ...DND_MOVE_FILL_INS];

export function fieldById(id: string): DndFieldBox {
  const field = DND_MOVE_FIELD_LAYOUT.find((f) => f.id === id);
  if (!field) throw new Error(`Unknown DnD move field: ${id}`);
  return field;
}
