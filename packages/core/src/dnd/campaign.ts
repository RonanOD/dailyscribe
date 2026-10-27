import type { DndCampaignDefinition } from "./types";

/** The first adventure, ported verbatim from the old repo's `dnd/campaign.json`.
 *  A fixed, shared dungeon — every user plays the same one, with independent
 *  per-user progress (the same shape as the Kanji curriculum + per-user cursor).
 *  A loose, original-text homage to The Sunless Citadel. */
export const SUNKEN_VAULT_CAMPAIGN: DndCampaignDefinition = {
  id: "sunken_vault",
  campaignName: "The Sunken Vault (Solo Edition)",
  blurb: "Climb down into a citadel swallowed by the earth, past rats and goblins, to a grove that should not exist.",
  schemaVersion: 1,
  grid: { cols: 5, rows: 5 },
  startNode: "ravine_ledge",
  goalNode: "twisted_grove",
  nodes: {
    ravine_ledge: {
      title: "The Ravine Ledge",
      x: 2,
      y: 0,
      description:
        "A ledge overlooks a citadel sunk deep into the earth. A sturdy rope, knotted at intervals, is tied to a leaning pillar and drops into the dark below.",
      monsters: [],
      exits: { down: "tower_entry" },
    },
    tower_entry: {
      title: "The Tower Entry",
      x: 2,
      y: 1,
      description:
        "The rope ends on the masonry floor of a round, roofless tower room. Rubble and old leaves cover the ground. Two giant rats startle from a nest in the debris.",
      monsters: [
        {
          id: "rat_a",
          name: "Giant Rat",
          hp: 7,
          ac: 12,
          attack: "+4 to hit, 1d4+2 piercing",
          dexMod: 2,
          passivePerception: 10,
        },
        {
          id: "rat_b",
          name: "Giant Rat",
          hp: 7,
          ac: 12,
          attack: "+4 to hit, 1d4+2 piercing",
          dexMod: 2,
          passivePerception: 10,
        },
      ],
      exits: { north: "dry_fountain", east: "rat_warren", west: "goblin_guardpost" },
    },
    dry_fountain: {
      title: "The Dry Fountain",
      x: 2,
      y: 2,
      description:
        "A cracked stone fountain dominates this chamber, long dry. Faded carvings of a thorned tree ring its basin. A dark passage continues south.",
      monsters: [],
      exits: { down: "twisted_grove", back: "tower_entry" },
    },
    rat_warren: {
      title: "The Rat Warren",
      x: 3,
      y: 1,
      description:
        "A low side-chamber packed with shredded nesting material. The stink is overwhelming. A lone giant rat guards a glint of metal in the muck.",
      monsters: [
        {
          id: "rat_c",
          name: "Giant Rat",
          hp: 7,
          ac: 12,
          attack: "+4 to hit, 1d4+2 piercing",
          dexMod: 2,
          passivePerception: 10,
        },
      ],
      loot: ["Tarnished silver key"],
      exits: { west: "tower_entry" },
    },
    goblin_guardpost: {
      title: "The Goblin Guardpost",
      x: 1,
      y: 1,
      description:
        "Crude barricades of broken furniture block half the room. A goblin sentry crouches behind them, scimitar drawn, eyes wide in the gloom.",
      monsters: [
        {
          id: "goblin_a",
          name: "Goblin",
          hp: 7,
          ac: 15,
          attack: "+4 to hit, 1d6+2 slashing (scimitar)",
          dexMod: 2,
          passivePerception: 9,
        },
      ],
      exits: { east: "tower_entry" },
    },
    twisted_grove: {
      title: "The Twisted Grove",
      x: 2,
      y: 3,
      description:
        "The passage opens into an impossible underground grove lit by pale luminescent fungus. A gnarled white tree stands at its centre. Two twig blights skitter from its roots to bar your way.",
      monsters: [
        {
          id: "blight_a",
          name: "Twig Blight",
          hp: 4,
          ac: 13,
          attack: "+3 to hit, 1d4+1 piercing",
          dexMod: 1,
          passivePerception: 8,
        },
        {
          id: "blight_b",
          name: "Twig Blight",
          hp: 4,
          ac: 13,
          attack: "+3 to hit, 1d4+1 piercing",
          dexMod: 1,
          passivePerception: 8,
        },
      ],
      isGoal: true,
      exits: { up: "dry_fountain" },
    },
  },
};

/** The second adventure: an original-text homage to The Forge of Fury, the
 *  Sunless Citadel's sequel in Tales from the Yawning Portal. Pitched a step
 *  harder than the vault for a hero kept from it (still level 1), with a
 *  potion to find on the side. */
export const MOUNTAIN_FORGE_CAMPAIGN: DndCampaignDefinition = {
  id: "mountain_forge",
  campaignName: "The Mountain Forge (Solo Edition)",
  blurb: "Force the doors of a dwarven stronghold held by orcs, and find what still guards its legendary forge.",
  schemaVersion: 1,
  grid: { cols: 5, rows: 5 },
  startNode: "stone_doors",
  goalNode: "black_forge",
  nodes: {
    stone_doors: {
      title: "The Stone Doors",
      x: 2,
      y: 0,
      description:
        "A switchback trail ends at a pair of great doors carved into the mountainside, each taller than three men. One stands ajar. Narrow arrow slits flank them, dark and silent.",
      monsters: [],
      exits: { in: "arrow_hall" },
    },
    arrow_hall: {
      title: "The Arrow Hall",
      x: 2,
      y: 1,
      description:
        "A long hall runs behind the arrow slits, its floor littered with broken shafts and gnawed bones. An orc sentry looks up from a smoky brazier and reaches for its axe.",
      monsters: [
        {
          id: "orc_sentry",
          name: "Orc Sentry",
          hp: 11,
          ac: 13,
          attack: "+5 to hit, 1d6+3 slashing (handaxe)",
          dexMod: 1,
          passivePerception: 10,
        },
      ],
      exits: { down: "crystal_cavern", east: "orc_barracks", out: "stone_doors" },
    },
    orc_barracks: {
      title: "The Orc Barracks",
      x: 3,
      y: 1,
      description:
        "Filthy bedrolls and a toppled cookpot fill a low chamber. Two stirges hang from the ceiling like ripe fruit, then drop toward the warmth of your blood.",
      monsters: [
        {
          id: "stirge_a",
          name: "Stirge",
          hp: 2,
          ac: 14,
          attack: "+5 to hit, 1d4+3 piercing",
          dexMod: 3,
          passivePerception: 9,
        },
        {
          id: "stirge_b",
          name: "Stirge",
          hp: 2,
          ac: 14,
          attack: "+5 to hit, 1d4+3 piercing",
          dexMod: 3,
          passivePerception: 9,
        },
      ],
      loot: ["Health Potion x1"],
      exits: { west: "arrow_hall" },
    },
    crystal_cavern: {
      title: "The Crystal Cavern",
      x: 2,
      y: 2,
      description:
        "A wide stair spills into a natural cavern whose walls glitter with crystal veins. Something long and many-legged unfolds from a crack in the rock.",
      monsters: [
        {
          id: "centipede_a",
          name: "Giant Centipede",
          hp: 4,
          ac: 13,
          attack: "+4 to hit, 1d4+2 piercing",
          dexMod: 2,
          passivePerception: 8,
        },
      ],
      exits: { south: "black_forge", west: "dwarven_shrine", up: "arrow_hall" },
    },
    dwarven_shrine: {
      title: "The Dwarven Shrine",
      x: 1,
      y: 2,
      description:
        "A small shrine to a forge god, its altar split by a fallen stone. Offerings of tools and coins lie scattered where looters left them.",
      monsters: [],
      loot: ["Dwarven smith's hammer"],
      exits: { east: "crystal_cavern" },
    },
    black_forge: {
      title: "The Black Forge",
      x: 2,
      y: 3,
      description:
        "Heat still breathes from a vast forge cut into the living rock, its anvil black with age. A dwarf skeleton in rusted mail stands before it, and turns its empty eyes on you.",
      monsters: [
        {
          id: "forge_skeleton",
          name: "Skeleton",
          hp: 13,
          ac: 13,
          attack: "+4 to hit, 1d6+2 piercing (shortsword)",
          dexMod: 2,
          passivePerception: 9,
        },
      ],
      isGoal: true,
      exits: { north: "crystal_cavern" },
    },
  },
};

/** Every adventure, in the order the "next adventure" page lists them. */
export const DND_CAMPAIGNS: DndCampaignDefinition[] = [SUNKEN_VAULT_CAMPAIGN, MOUNTAIN_FORGE_CAMPAIGN];

/** An adventure by id. Unknown or missing ids (docs from before there was a
 *  choice) are the first adventure, which is all there was. */
export function getDndCampaign(id: string | null | undefined): DndCampaignDefinition {
  return DND_CAMPAIGNS.find((c) => c.id === id) ?? SUNKEN_VAULT_CAMPAIGN;
}
