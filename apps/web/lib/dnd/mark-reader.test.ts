import { SUNKEN_VAULT_CAMPAIGN, type DndCampaign } from "@dailyscribe/core";
import { PDFDocument, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { renderDndPdf } from "../plugins/dnd";
import { DND_MOVE_CHECKBOXES, DND_MOVE_PAGE_SIZE } from "./layout";
import { readCheckboxes } from "./mark-reader";
import { rasterizePage } from "./rasterize";

/**
 * Renders a real "Your Move" page via the actual plugin renderer (not a
 * hand-built fixture) so this test breaks if the renderer's layout ever
 * drifts from `DND_MOVE_FIELD_LAYOUT` — exactly the desync this shared-layout
 * design is meant to prevent (see layout.ts's doc comment).
 */
async function renderMovePagePdf(): Promise<Uint8Array> {
  const campaignDoc: DndCampaign = {
    userId: "test-user",
    inboundToken: "0123456789abcdef",
    character: {
      name: "Test",
      class: "Fighter",
      level: 1,
      maxHp: 10,
      currentHp: 10,
      ac: 18,
      attackAbility: "strength",
      weapon: "Longsword",
      damageDie: "1d8",
      inventory: [],
      modifiers: { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 },
      scores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      skillProficiencies: [],
    },
    gameState: {
      currentNode: "tower_entry",
      discoveredNodes: ["ravine_ledge", "tower_entry"],
      defeatedMonsters: [],
      monsterHp: {},
      searchedNodes: [],
      combat: { node: "tower_entry", playerFirst: null },
      status: "active",
      turnCount: 1,
    },
    turnLog: [],
    updatedAt: new Date(),
  };
  return renderDndPdf(SUNKEN_VAULT_CAMPAIGN, campaignDoc, new Date("2026-01-06T00:00:00Z"), false);
}

/** PDF points have origin bottom-left; DND_MOVE_FIELD_LAYOUT is top-left — convert. */
function toPdfY(topPt: number, heightPt: number): number {
  return DND_MOVE_PAGE_SIZE.height - topPt - heightPt;
}

describe("readCheckboxes", () => {
  it("reports every checkbox unmarked on a freshly rendered, untouched page", async () => {
    const pdfBytes = await renderMovePagePdf();
    const raster = await rasterizePage(pdfBytes, 1); // page 1 = the Move page
    const reads = readCheckboxes(raster);

    expect(reads).toHaveLength(DND_MOVE_CHECKBOXES.length);
    for (const read of reads) {
      expect(read.marked, `expected "${read.id}" to read unmarked`).toBe(false);
    }
  });

  it("detects a pen mark (an X) drawn inside one checkbox, and only that one", async () => {
    const pdfBytes = await renderMovePagePdf();

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const movePage = pdfDoc.getPage(1);
    const field = DND_MOVE_CHECKBOXES.find((f) => f.id === "dodge")!;
    const x0 = field.left + 2;
    const y0 = toPdfY(field.top, field.height) + 2;
    const x1 = field.left + field.width - 2;
    const y1 = toPdfY(field.top, field.height) + field.height - 2;
    movePage.drawLine({ start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, thickness: 2, color: rgb(0.1, 0.1, 0.1) });
    movePage.drawLine({ start: { x: x1, y: y0 }, end: { x: x0, y: y1 }, thickness: 2, color: rgb(0.1, 0.1, 0.1) });
    const markedBytes = await pdfDoc.save();

    const raster = await rasterizePage(markedBytes, 1);
    const reads = readCheckboxes(raster);
    const byId = new Map(reads.map((r) => [r.id, r]));

    expect(byId.get("dodge")?.marked).toBe(true);
    for (const field of DND_MOVE_CHECKBOXES) {
      if (field.id === "dodge") continue;
      expect(byId.get(field.id)?.marked, `expected "${field.id}" to stay unmarked`).toBe(false);
    }
  });
});
