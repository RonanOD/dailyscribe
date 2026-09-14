import { randomBytes } from "node:crypto";
import { SUNKEN_VAULT_CAMPAIGN } from "./dnd/campaign";
import { deriveCharacter } from "./dnd/rules";
import { collections } from "./db";
import type { DndGameState } from "./dnd/types";
import type { DndCampaign } from "./types";

function initialGameState(): DndGameState {
  return {
    currentNode: SUNKEN_VAULT_CAMPAIGN.startNode,
    discoveredNodes: [SUNKEN_VAULT_CAMPAIGN.startNode],
    defeatedMonsters: [],
    monsterHp: {},
    searchedNodes: [],
    combat: { node: null, playerFirst: null },
    status: "awaiting_character",
    turnCount: 0,
  };
}

/**
 * Fetch-or-create a user's DnD campaign doc. Shared by the plugin's `run()`
 * (read-only over this doc — state only changes via the mail-back webhook)
 * and the dashboard (which just needs `inboundToken`) — one place generates
 * the token and seeds a fresh campaign, so both callers see consistent state.
 * Mirrors `getOrCreateKanjiProgress`.
 */
export async function getOrCreateDndCampaign(userId: string): Promise<DndCampaign> {
  const { dndCampaigns } = await collections();
  const campaign = await dndCampaigns.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        inboundToken: randomBytes(8).toString("hex"),
        // A placeholder hero, same as the old repo's state.initial.json — the
        // renderer shows a character-creation page while status is
        // "awaiting_character", it never reads this placeholder's fields.
        character: deriveCharacter({ name: "Hero", class: "fighter", scores: {} }),
        gameState: initialGameState(),
        turnLog: [],
        updatedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!campaign) throw new Error("Failed to load DnD campaign progress.");
  return campaign;
}
