import { DND_MOVE_CHECKBOXES } from "./layout";
import { sampleAvgGray, type RasterPage } from "./rasterize";

/**
 * An empty checkbox (border only, per lib/plugins/dnd.tsx's `AbsCheckbox`)
 * averages ~195/255 gray at the DEFAULT_SCALE rasterize.ts renders at; a
 * synthetic pen mark drawn inside one brought that down to ~158 in testing.
 * A real handwritten tick or X will vary, but sits well below an empty box —
 * 180 leaves headroom on both sides without being so aggressive that a faint
 * mark near the border misses. Revisit with real mailed-back samples once
 * this ships; there's no substitute for that data.
 */
const CHECKBOX_DARKNESS_THRESHOLD = 180;

export interface CheckboxRead {
  id: string;
  marked: boolean;
  /** Diagnostic — not used by the engine, but useful if the threshold above
   *  ever needs retuning against real submissions. */
  avgGray: number;
}

/** Deterministic, no-AI read of every checkbox on the move page: just pixel
 *  darkness in each box's known region. See DND_MOVE_CHECKBOXES for layout. */
export function readCheckboxes(raster: RasterPage): CheckboxRead[] {
  return DND_MOVE_CHECKBOXES.map((field) => {
    const avgGray = sampleAvgGray(raster, field);
    return { id: field.id, marked: avgGray < CHECKBOX_DARKNESS_THRESHOLD, avgGray };
  });
}
