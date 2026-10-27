import { describe, expect, it } from "vitest";
import { DND_CAMPAIGNS, MOUNTAIN_FORGE_CAMPAIGN, SUNKEN_VAULT_CAMPAIGN } from "./campaign";
import {
  addToInventory,
  applyCharacterSheet,
  applyMove,
  completedCampaignIds,
  continueWithHero,
  defaultNextCampaign,
  maxDiceTotal,
  minDiceTotal,
} from "./engine";
import { deriveCharacter } from "./rules";
import type { DndCampaignDefinition, DndPlayState } from "./types";

/** A small, fully-controlled two-room campaign — deliberately not the real
 *  built-in adventure, so combat-math assertions don't depend on its balance
 *  numbers changing later. */
const testCampaign: DndCampaignDefinition = {
  id: "test",
  campaignName: "Test Campaign",
  blurb: "A test.",
  schemaVersion: 1,
  grid: { cols: 2, rows: 1 },
  startNode: "start",
  goalNode: "goal",
  nodes: {
    start: {
      title: "Start Room",
      x: 0,
      y: 0,
      description: "A guarded room.",
      monsters: [
        { id: "goblin", name: "Goblin", hp: 7, ac: 15, attack: "+4 to hit, 1d6+2", dexMod: 2, passivePerception: 9 },
      ],
      loot: ["Shiny Coin"],
      exits: { north: "goal" },
    },
    goal: {
      title: "Goal Room",
      x: 1,
      y: 0,
      description: "An empty vault.",
      monsters: [],
      isGoal: true,
      exits: { south: "start" },
    },
  },
};

function freshState(overrides: Partial<DndPlayState> = {}): DndPlayState {
  const character = deriveCharacter({ name: "Hero", class: "fighter", scores: {} }); // maxHp 10, ac 18
  return {
    character,
    gameState: {
      currentNode: "start",
      discoveredNodes: ["start"],
      defeatedMonsters: [],
      monsterHp: {},
      searchedNodes: [],
      combat: { node: null, playerFirst: null },
      status: "active",
      turnCount: 0,
    },
    turnLog: [],
    ...overrides,
  };
}

describe("applyCharacterSheet", () => {
  it("starts a fresh campaign at the start node with a derived character", () => {
    const { state, events } = applyCharacterSheet(testCampaign, { name: "Rowan", class: "fighter", scores: {} });
    expect(state.gameState.currentNode).toBe("start");
    expect(state.gameState.discoveredNodes).toEqual(["start"]);
    expect(state.gameState.status).toBe("active");
    expect(state.gameState.turnCount).toBe(0);
    expect(state.character.name).toBe("Rowan");
    expect(events[0]).toContain("Rowan the Fighter");
    expect(state.turnLog).toHaveLength(1);
  });
});

describe("applyMove — combat", () => {
  it("hits and damages the monster when the roll meets or beats AC", () => {
    const { state, events } = applyMove(freshState(), testCampaign, {
      diceRolls: [{ label: "to hit", total: 18 }],
      damageDealt: 5,
    });
    expect(state.gameState.monsterHp.goblin).toBe(2);
    expect(events.some((e) => e.includes("Hit Goblin for 5"))).toBe(true);
    expect(state.gameState.defeatedMonsters).not.toContain("goblin");
  });

  it("misses when the to-hit roll is below AC, and deals no damage", () => {
    const { state, events } = applyMove(freshState(), testCampaign, {
      diceRolls: [{ label: "to hit", total: 10 }],
      damageDealt: 5,
    });
    expect(state.gameState.monsterHp.goblin ?? 7).toBe(7);
    expect(events.some((e) => e.includes("Missed Goblin"))).toBe(true);
  });

  it("marks the monster defeated at 0 HP and allows movement through the cleared room", () => {
    const { state, events } = applyMove(freshState(), testCampaign, {
      diceRolls: [{ label: "to hit", total: 18 }],
      damageDealt: 8, // a max longsword roll vs the goblin's 7 HP
      chosenExit: "north",
    });
    expect(state.gameState.defeatedMonsters).toContain("goblin");
    expect(events.some((e) => e.includes("Goblin defeated!"))).toBe(true);
    expect(state.gameState.currentNode).toBe("goal");
    // Reaching the (now-cleared) goal room ends the campaign in victory.
    expect(state.gameState.status).toBe("won");
    expect(events.some((e) => e.includes("Victory"))).toBe(true);
  });

  it("blocks movement while a living monster still occupies the room", () => {
    const { state, events } = applyMove(freshState(), testCampaign, { chosenExit: "north" });
    expect(state.gameState.currentNode).toBe("start");
    expect(events.some((e) => e.includes("Enemies still block the way"))).toBe(true);
  });

  it("reports an invalid exit without moving", () => {
    const state = freshState({
      gameState: {
        currentNode: "goal",
        discoveredNodes: ["start", "goal"],
        defeatedMonsters: [],
        monsterHp: {},
        searchedNodes: [],
        combat: { node: null, playerFirst: null },
        status: "active",
        turnCount: 0,
      },
    });
    const { state: next, events } = applyMove(state, testCampaign, { chosenExit: "west" });
    expect(next.gameState.currentNode).toBe("goal");
    expect(events.some((e) => e.includes('no "west" exit'))).toBe(true);
  });
});

describe("applyMove — sneak / flee / dodge", () => {
  it("succeeds a sneak past when the stealth roll beats passive perception", () => {
    const { state, events } = applyMove(freshState(), testCampaign, {
      checkboxesMarked: ["Sneak"],
      stealthRoll: 15, // beats passive perception 9
      chosenExit: "north",
    });
    expect(events.some((e) => e.includes("You move unseen"))).toBe(true);
    expect(state.gameState.currentNode).toBe("goal");
  });

  it("takes damage when a sneak attempt is spotted", () => {
    const { state, events } = applyMove(freshState(), testCampaign, {
      checkboxesMarked: ["Sneak"],
      stealthRoll: 3, // below passive perception 9
      damageTaken: 4,
    });
    expect(events.some((e) => e.includes("You are spotted"))).toBe(true);
    expect(state.character.currentHp).toBe(state.character.maxHp - 4);
  });

  it("flees and takes an opportunity hit, then moves", () => {
    const { state, events } = applyMove(freshState(), testCampaign, {
      checkboxesMarked: ["Flee"],
      damageTaken: 3,
      chosenExit: "north",
    });
    expect(events.some((e) => e.includes("You took 3 damage as you turn to run"))).toBe(true);
    expect(state.gameState.currentNode).toBe("goal");
  });

  it("dodges and still takes reduced-narrative damage from the recorded roll", () => {
    const { state, events } = applyMove(freshState(), testCampaign, {
      checkboxesMarked: ["Dodge"],
      damageTaken: 2,
    });
    expect(events.some((e) => e.includes("Dodge action"))).toBe(true);
    expect(state.character.currentHp).toBe(state.character.maxHp - 2);
  });

  it("warns and applies only the higher-priority action when Attack and Dodge are both marked", () => {
    const { state, events } = applyMove(freshState(), testCampaign, {
      checkboxesMarked: ["Attack", "Dodge"],
      diceRolls: [{ label: "to hit", total: 18 }],
      damageDealt: 4,
    });
    expect(events.some((e) => e.includes("You marked Dodge and Attack") && e.includes("only Dodge was applied"))).toBe(
      true,
    );
    expect(events.some((e) => e.includes("Dodge action"))).toBe(true);
    expect(events.some((e) => e.includes("Hit Goblin"))).toBe(false);
    expect(state.gameState.monsterHp.goblin ?? 7).toBe(7);
  });
});

describe("applyMove — potions and search", () => {
  it("heals on a marked potion with a heal roll, capped at max HP, and consumes it", () => {
    const hurt = freshState();
    hurt.character.currentHp = 4;
    const { state, events } = applyMove(hurt, testCampaign, {
      checkboxesMarked: ["Potion"],
      healAmount: 10, // a max 2d4+2 roll from 4 HP overheals, so it should clamp
    });
    expect(state.character.currentHp).toBe(state.character.maxHp);
    expect(state.character.inventory.some((i) => i.toLowerCase().includes("potion"))).toBe(false);
    expect(events.some((e) => e.includes("recover"))).toBe(true);
  });

  it("reports no potions left when the inventory has none", () => {
    const noPotion = freshState();
    noPotion.character.inventory = noPotion.character.inventory.filter((i) => !i.toLowerCase().includes("potion"));
    const { events } = applyMove(noPotion, testCampaign, { checkboxesMarked: ["Potion"], healAmount: 5 });
    expect(events.some((e) => e.includes("have none left"))).toBe(true);
  });

  it("finds loot on a successful Perception check, and nothing new on a second search", () => {
    // Clear the goblin first so damage-taken side effects don't interfere with the assertion.
    let state = freshState();
    state.gameState.monsterHp.goblin = 0;
    state.gameState.defeatedMonsters = ["goblin"];

    const first = applyMove(state, testCampaign, { checkboxesMarked: ["Search"], perceptionRoll: 15 });
    expect(first.state.character.inventory).toContain("Shiny Coin");
    expect(first.events.some((e) => e.includes("find: Shiny Coin"))).toBe(true);
    expect(first.state.gameState.searchedNodes).toContain("start");

    const second = applyMove(first.state, testCampaign, { checkboxesMarked: ["Search"], perceptionRoll: 15 });
    expect(second.events.some((e) => e.includes("nothing new"))).toBe(true);
  });

  it("finds nothing on a failed Perception check, but still consumes the search", () => {
    const state = freshState();
    state.gameState.monsterHp.goblin = 0;
    state.gameState.defeatedMonsters = ["goblin"];

    const { state: next, events } = applyMove(state, testCampaign, { checkboxesMarked: ["Search"], perceptionRoll: 5 });
    expect(next.character.inventory).not.toContain("Shiny Coin");
    expect(next.gameState.searchedNodes).toContain("start");
    expect(events.some((e) => e.includes("don't find anything"))).toBe(true);
  });

  it("prompts for a Perception roll and doesn't consume the search when none was read", () => {
    const state = freshState();
    state.gameState.monsterHp.goblin = 0;
    state.gameState.defeatedMonsters = ["goblin"];

    const { state: next, events } = applyMove(state, testCampaign, { checkboxesMarked: ["Search"] });
    expect(next.gameState.searchedNodes).not.toContain("start");
    expect(events.some((e) => e.includes("no Perception roll was read"))).toBe(true);
  });
});

describe("applyMove — death", () => {
  it("ends the campaign when HP drops to zero or below", () => {
    const state = freshState();
    state.character.currentHp = 5;
    // Within the goblin's 1d6+2 range, so the misread guard lets it through.
    const { state: next, events } = applyMove(state, testCampaign, { damageTaken: 7 });
    expect(next.character.currentHp).toBe(0);
    expect(next.gameState.status).toBe("dead");
    expect(events.some((e) => e.includes("You have fallen"))).toBe(true);
  });
});

describe("applyMove — initiative", () => {
  it("records who acts first and only resolves it once per encounter", () => {
    const first = applyMove(freshState(), testCampaign, { initiativeRoll: 15 });
    expect(first.state.gameState.combat.playerFirst).toBe(true); // 15 >= monster init (10 + dexMod 2 = 12)
    expect(first.events.some((e) => e.includes("you act first"))).toBe(true);

    // A second initiative roll in the same encounter (same node) doesn't re-resolve.
    const second = applyMove(first.state, testCampaign, { initiativeRoll: 1 });
    expect(second.state.gameState.combat.playerFirst).toBe(true);
    expect(second.events.some((e) => e.includes("Initiative:"))).toBe(false);
  });
});

describe("applyMove — misread guards", () => {
  // The test goblin hits for 1d6+2 (max 8); the default fighter swings a
  // 1d8 longsword with a +0 modifier (max 8).
  it("doesn't apply a Damage Taken higher than the monster can deal", () => {
    const { state, events } = applyMove(freshState(), testCampaign, { checkboxesMarked: ["Dodge"], damageTaken: 9 });
    expect(state.character.currentHp).toBe(state.character.maxHp);
    expect(events.some((e) => e.includes("Damage Taken read as 9, but Goblin deals at most 8 (1d6+2)"))).toBe(true);
  });

  it("still applies the monster's maximum damage", () => {
    const { state } = applyMove(freshState(), testCampaign, { checkboxesMarked: ["Dodge"], damageTaken: 8 });
    expect(state.character.currentHp).toBe(state.character.maxHp - 8);
  });

  it("doesn't kill a hero over an impossible misread (a 0 read as 6 against a 1d4+1 monster)", () => {
    const weak: DndCampaignDefinition = structuredClone(testCampaign);
    weak.nodes.start.monsters = [
      { id: "blight", name: "Twig Blight", hp: 4, ac: 13, attack: "+3 to hit, 1d4+1 piercing", dexMod: 1, passivePerception: 8 },
    ];
    const base = freshState();
    base.character.currentHp = 2;
    const { state } = applyMove(base, weak, { checkboxesMarked: ["Attack"], diceRolls: [{ label: "to hit", total: 3 }], damageTaken: 6 });
    expect(state.gameState.status).toBe("active");
    expect(state.character.currentHp).toBe(2);
  });

  it("doesn't apply a Damage dealt higher than the hero's weapon can roll, but the monster still swings", () => {
    const { state, events } = applyMove(freshState(), testCampaign, {
      checkboxesMarked: ["Attack"],
      diceRolls: [{ label: "to hit", total: 17 }],
      damageDealt: 9,
      damageTaken: 3,
    });
    expect(state.gameState.monsterHp.goblin).toBe(7);
    expect(events.some((e) => e.includes("Damage read as 9, but your Longsword deals at most 8 (1d8)"))).toBe(true);
    expect(state.character.currentHp).toBe(state.character.maxHp - 3);
  });
});

describe("applyMove — potion misread guard", () => {
  it.each([3, 11])("doesn't drink a potion when the Heal box reads %i (outside 2d4+2's 4-10)", (heal) => {
    const base = freshState();
    base.character.currentHp = 2;
    const potionsBefore = base.character.inventory.filter((i) => i.toLowerCase().includes("potion"));
    const { state, events } = applyMove(base, testCampaign, { checkboxesMarked: ["Drink Potion"], healAmount: heal });
    expect(state.character.currentHp).toBe(2);
    expect(state.character.inventory.filter((i) => i.toLowerCase().includes("potion"))).toEqual(potionsBefore);
    expect(events.some((e) => e.includes(`Heal read as ${heal}, but a potion heals 4-10 (2d4+2)`))).toBe(true);
  });

  it.each([4, 10])("drinks the potion at the edges of the range (%i)", (heal) => {
    const base = freshState();
    base.character.currentHp = 1;
    const { state } = applyMove(base, testCampaign, { checkboxesMarked: ["Drink Potion"], healAmount: heal });
    expect(state.character.currentHp).toBe(Math.min(state.character.maxHp, 1 + heal));
  });
});

describe("maxDiceTotal", () => {
  it("reads the dice out of an attack string", () => {
    expect(maxDiceTotal("+3 to hit, 1d4+1 piercing")).toBe(5);
    expect(maxDiceTotal("+4 to hit, 1d6+2 slashing (scimitar)")).toBe(8);
    expect(maxDiceTotal("1d8")).toBe(8);
    expect(maxDiceTotal("2d6-1")).toBe(11);
    expect(maxDiceTotal("a bite")).toBeNull();
  });

  it("has a matching minimum", () => {
    expect(minDiceTotal("2d4+2")).toBe(4);
    expect(minDiceTotal("1d6-1")).toBe(0);
    expect(minDiceTotal("a bite")).toBeNull();
  });
});

describe("after a win", () => {
  function wonState(): DndPlayState {
    const base = freshState();
    return {
      ...base,
      character: { ...base.character, currentHp: 3, inventory: [...base.character.inventory, "Shiny Coin"] },
      gameState: { ...base.gameState, campaignId: "sunken_vault", status: "won", turnCount: 12 },
    };
  }

  it("records the adventure as won", () => {
    const { state } = applyMove(freshState({ gameState: { ...freshState().gameState, monsterHp: { goblin: 0 } } }), testCampaign, {
      chosenExit: "north",
    });
    expect(state.gameState.status).toBe("won");
    expect(state.gameState.completedCampaigns).toEqual(["test"]);
  });

  it("keeps the hero: a level up, full HP, same inventory, fresh run in the chosen adventure", () => {
    const { state } = continueWithHero(wonState(), MOUNTAIN_FORGE_CAMPAIGN);
    // Fighter, CON 10: d10 average (6) + 0 on top of level 1's 10.
    expect(state.character.level).toBe(2);
    expect(state.character.maxHp).toBe(16);
    expect(state.character.currentHp).toBe(16);
    expect(state.character.inventory).toContain("Shiny Coin");
    expect(state.gameState).toMatchObject({
      campaignId: "mountain_forge",
      completedCampaigns: ["sunken_vault"],
      currentNode: MOUNTAIN_FORGE_CAMPAIGN.startNode,
      status: "active",
      turnCount: 0,
    });
    expect(state.turnLog).toHaveLength(1);
  });

  it("counts a win from before wins were recorded, and defaults to the next unwon adventure", () => {
    const legacy = { ...wonState().gameState, campaignId: undefined };
    expect(completedCampaignIds(legacy)).toEqual(["sunken_vault"]);
    expect(defaultNextCampaign(DND_CAMPAIGNS, legacy).id).toBe("mountain_forge");
    const allWon = { ...legacy, completedCampaigns: DND_CAMPAIGNS.map((c) => c.id) };
    expect(defaultNextCampaign(DND_CAMPAIGNS, allWon).id).toBe(SUNKEN_VAULT_CAMPAIGN.id);
  });

  it("a new hero starts with no wins", () => {
    const { state } = applyCharacterSheet(MOUNTAIN_FORGE_CAMPAIGN, { name: "Bryn", class: "rogue", scores: {} });
    expect(state.gameState.campaignId).toBe("mountain_forge");
    expect(state.gameState.completedCampaigns).toEqual([]);
  });
});

describe("addToInventory", () => {
  it("stacks counted items onto one already carried", () => {
    expect(addToInventory(["Longsword", "Health Potion x1"], ["Health Potion x1", "Silver key"])).toEqual([
      "Longsword",
      "Health Potion x2",
      "Silver key",
    ]);
  });

  it("adds a counted item fresh when none is carried", () => {
    expect(addToInventory(["Longsword"], ["Health Potion x1"])).toEqual(["Longsword", "Health Potion x1"]);
  });
});

describe("built-in adventures", () => {
  it("every exit leads to a real room, and the goal is reachable", () => {
    for (const c of DND_CAMPAIGNS) {
      for (const [id, node] of Object.entries(c.nodes)) {
        for (const dest of Object.values(node.exits)) expect(c.nodes[dest], `${c.id}/${id} -> ${dest}`).toBeDefined();
      }
      const seen = new Set([c.startNode]);
      const queue = [c.startNode];
      while (queue.length > 0) {
        for (const dest of Object.values(c.nodes[queue.shift()!].exits)) {
          if (seen.has(dest)) continue;
          seen.add(dest);
          queue.push(dest);
        }
      }
      expect(seen.has(c.goalNode), c.id).toBe(true);
      expect(c.nodes[c.goalNode].isGoal).toBe(true);
    }
  });
});
