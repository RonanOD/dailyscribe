import { deriveCharacter } from "./rules";
import type {
  DndCampaignDefinition,
  DndCampaignNode,
  DndCharacterSheetInput,
  DndCombatTracker,
  DndEngineResult,
  DndGameState,
  DndMonster,
  DndMoveInput,
  DndPlayState,
} from "./types";

/**
 * Apply one interpreted move (or a character-creation sheet) to campaign
 * state. Pure and deterministic — ported from the old repo's `dnd/engine.py`.
 * No AI, no dice rolling here: the *player* rolls physically and records the
 * totals; the engine only does bookkeeping (compare to-hit vs AC, subtract
 * HP, move rooms, detect win/lose). Every function returns a new state
 * rather than mutating its input.
 */

/** Flat DC for a Perception check when searching a room — not in the old
 *  repo, which resolved search unconditionally with no roll. Deliberately
 *  a single flat constant rather than a per-node value, at the user's
 *  request ("keep it simple for now"). */
const SEARCH_DC = 12;

function consumePotion(inventory: string[], idx: number): string[] {
  const item = inventory[idx];
  const match = /x\s*(\d+)/i.exec(item);
  const next = [...inventory];
  if (match) {
    const remaining = Number(match[1]) - 1;
    if (remaining <= 0) {
      next.splice(idx, 1);
    } else {
      next[idx] = item.replace(/x\s*\d+/i, `x${remaining}`);
    }
  } else {
    next.splice(idx, 1);
  }
  return next;
}

function fmtBonus(n: number): string {
  return n === 0 ? "" : n > 0 ? `+${n}` : `${n}`;
}

function findRoll(move: DndMoveInput, keyword: string): number | null {
  for (const roll of move.diceRolls ?? []) {
    if ((roll.label ?? "").toLowerCase().includes(keyword)) return roll.total;
  }
  return null;
}

function livingIn(node: DndCampaignNode, monsterHp: Record<string, number>): DndMonster[] {
  return node.monsters.filter((m) => (monsterHp[m.id] ?? m.hp) > 0);
}

function ensureMonsters(node: DndCampaignNode, monsterHp: Record<string, number>): void {
  for (const m of node.monsters) {
    if (!(m.id in monsterHp)) monsterHp[m.id] = m.hp;
  }
}

function monsterPassivePerception(m: DndMonster): number {
  return m.passivePerception ?? 10;
}

/** Highest total a dice expression like "1d4+1" or "2d6-1" can roll, or null
 *  if there's none in the string. Used to reject handwriting misreads: there
 *  are no critical hits in this ruleset, so nothing can legitimately exceed it. */
export function maxDiceTotal(expr: string): number | null {
  const m = /(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?/i.exec(expr);
  if (!m) return null;
  const bonus = m[3] ? (m[3] === "-" ? -1 : 1) * Number(m[4]) : 0;
  return Number(m[1]) * Number(m[2]) + bonus;
}

/** Lowest total a dice expression can roll (every die showing 1), or null. */
export function minDiceTotal(expr: string): number | null {
  const m = /(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?/i.exec(expr);
  if (!m) return null;
  const bonus = m[3] ? (m[3] === "-" ? -1 : 1) * Number(m[4]) : 0;
  return Number(m[1]) + bonus;
}

/** A potion heals a flat 2d4+2 (no ability bonus), so the Heal box can only hold 4-10. */
const POTION_HEAL = "2d4+2";
const POTION_MIN = minDiceTotal(POTION_HEAL)!;
const POTION_MAX = maxDiceTotal(POTION_HEAL)!;

/** Deterministic "take 10" initiative for the monster (no engine dice). */
function monsterInitiative(m: DndMonster): number {
  return 10 + (m.dexMod ?? 0);
}

/** Move the player along an exit, discovering + seeding the destination and
 *  resetting the per-encounter combat tracker. Returns true on success. */
function moveToExit(
  gs: DndGameState,
  campaign: DndCampaignDefinition,
  monsterHp: Record<string, number>,
  direction: string,
  events: string[],
  verb: string,
): boolean {
  const currentNode = campaign.nodes[gs.currentNode];
  const exits = Object.fromEntries(Object.entries(currentNode.exits).map(([k, v]) => [k.toLowerCase(), v]));
  const dest = exits[direction];
  if (!dest || !campaign.nodes[dest]) {
    events.push(`There is no "${direction}" exit from here.`);
    return false;
  }
  gs.currentNode = dest;
  if (!gs.discoveredNodes.includes(dest)) gs.discoveredNodes.push(dest);
  const destNode = campaign.nodes[dest];
  ensureMonsters(destNode, monsterHp);
  gs.combat = { node: dest, playerFirst: null };
  events.push(`${verb} ${direction} to ${destNode.title}.`);
  return true;
}

export function applyMove(state: DndPlayState, campaign: DndCampaignDefinition, move: DndMoveInput): DndEngineResult {
  const gs = structuredClone(state.gameState);
  const ch = structuredClone(state.character);
  const events: string[] = [];

  const checkboxes = (move.checkboxesMarked ?? []).map((c) => String(c).toLowerCase());
  const marked = (substr: string) => checkboxes.some((c) => c.includes(substr));

  const monsterHp = gs.monsterHp;
  const node = campaign.nodes[gs.currentNode];
  ensureMonsters(node, monsterHp);

  if (move.misreadFlag) {
    events.push("You flagged the previous read as a misread.");
  }

  const living = livingIn(node, monsterHp);
  const target = living[0] ?? null;

  // Most a turn's numbers could legitimately be, from the dice on the page.
  // Anything higher is a misread (e.g. a "0" with a tail read as "6"), so
  // it's reported back instead of applied.
  const monsterMaxes = living
    .map((m) => ({ m, max: maxDiceTotal(m.attack) }))
    .filter((x): x is { m: DndMonster; max: number } => x.max != null);
  const worstHitter = monsterMaxes.sort((a, b) => b.max - a.max)[0] ?? null;
  const weaponMax = maxDiceTotal(ch.damageDie);
  const playerDamageMax = weaponMax == null ? null : weaponMax + (ch.modifiers[ch.attackAbility] ?? 0);
  const chosen = (move.chosenExit ?? "").trim().toLowerCase() || null;

  const sneak = Boolean(target) && (marked("sneak") || marked("stealth"));
  const flee = Boolean(target) && (marked("flee") || marked("retreat"));
  const dodge = Boolean(target) && marked("dodge");

  const toHit = findRoll(move, "hit");
  const damage = move.damageDealt ?? findRoll(move, "damage");
  const attackMarked = Boolean(target) && (damage != null || toHit != null || marked("attack"));
  const attack = !(sneak || flee || dodge) && attackMarked;

  // Only one primary action resolves per turn, in this priority order. If the
  // player marked more than one (e.g. Attack + Dodge), say so explicitly
  // instead of silently dropping the others — see the D&D combat-clarity fix.
  if (target) {
    const primaryActions = [
      { name: "Sneak", flag: sneak },
      { name: "Flee", flag: flee },
      { name: "Dodge", flag: dodge },
      { name: "Attack", flag: attackMarked },
    ];
    const markedNames = primaryActions.filter((a) => a.flag).map((a) => a.name);
    if (markedNames.length > 1) {
      const [applied, ...dropped] = markedNames;
      const verb = dropped.length > 1 ? "were" : "was";
      events.push(
        `You marked ${markedNames.join(" and ")} this turn — only ${applied} was applied (priority: Sneak > Flee > Dodge > Attack). ${dropped.join(" and ")} ${verb} ignored.`,
      );
    }
  }

  function applyDamageTaken(note = ""): void {
    const taken = move.damageTaken;
    if (taken && worstHitter && taken > worstHitter.max) {
      const dice = /\d+\s*d\s*\d+(\s*[+-]\s*\d+)?/i.exec(worstHitter.m.attack)?.[0] ?? "";
      events.push(
        `Damage Taken read as ${taken}, but ${worstHitter.m.name} deals at most ${worstHitter.max} (${dice}), so I didn't apply it. If I misread you, nothing to do; otherwise write the right number next turn.`,
      );
      return;
    }
    if (taken) {
      ch.currentHp = Math.max(0, ch.currentHp - taken);
      const suffix = note ? ` ${note}` : "";
      events.push(`You took ${taken} damage${suffix} (HP ${ch.currentHp}/${ch.maxHp}).`);
    }
  }

  // --- Initiative (add-on, resolved once per encounter) ------------------
  let combat: DndCombatTracker = gs.combat.node === gs.currentNode ? gs.combat : { node: gs.currentNode, playerFirst: null };
  gs.combat = combat;
  const initRoll = move.initiativeRoll;
  if (target && initRoll != null && combat.playerFirst === null) {
    const monInit = Math.max(...living.map(monsterInitiative));
    combat.playerFirst = initRoll >= monInit;
    const verdict = combat.playerFirst ? "you act first!" : "the enemy acts first.";
    events.push(`Initiative: ${initRoll} vs ${monInit} — ${verdict}`);
  }

  // --- Primary action: sneak > flee > dodge > attack ---------------------
  let sneakSuccess = false;
  if (sneak) {
    const stealth = move.stealthRoll;
    const dc = Math.max(...living.map(monsterPassivePerception));
    if (stealth == null) {
      events.push("You try to sneak, but no Stealth roll was read — write your total in the Stealth box.");
    } else if (stealth >= dc) {
      sneakSuccess = true;
      events.push(`You move unseen (Stealth ${stealth} vs passive Perception ${dc}).`);
    } else {
      events.push(`You are spotted! (Stealth ${stealth} vs passive Perception ${dc})`);
      applyDamageTaken("as you are caught");
    }
  } else if (flee) {
    applyDamageTaken("as you turn to run"); // leaving melee provokes an attack
  } else if (dodge) {
    events.push("You take the Dodge action — the enemy attacks at disadvantage.");
    applyDamageTaken();
  } else if (attack && target) {
    const ac = target.ac;
    if (toHit != null && ac != null && toHit < ac) {
      events.push(`Missed ${target.name} (rolled ${toHit} vs AC ${ac}).`);
    } else if (damage != null && playerDamageMax != null && damage > playerDamageMax) {
      events.push(
        `Damage read as ${damage}, but your ${ch.weapon} deals at most ${playerDamageMax} (${ch.damageDie}${fmtBonus(ch.modifiers[ch.attackAbility] ?? 0)}), so I didn't apply it. Attack again next turn.`,
      );
    } else {
      const dealt = damage ?? 0;
      monsterHp[target.id] = Math.max(0, (monsterHp[target.id] ?? target.hp) - dealt);
      const rollNote = toHit != null ? ` (rolled ${toHit} vs AC ${ac})` : "";
      events.push(`Hit ${target.name} for ${dealt}${rollNote}.`);
      if (monsterHp[target.id] === 0) {
        if (!gs.defeatedMonsters.includes(target.id)) gs.defeatedMonsters.push(target.id);
        events.push(`${target.name} defeated!`);
      }
    }
    // The monster swings back, unless you won initiative and cleared the room.
    if (combat.playerFirst && livingIn(node, monsterHp).length === 0) {
      events.push("You struck first and dropped it before it could swing — no damage taken.");
    } else {
      applyDamageTaken();
    }
  } else {
    applyDamageTaken();
  }

  // --- Drink a potion (player rolls POTION_HEAL and writes the total) -----
  if (marked("potion")) {
    const idx = ch.inventory.findIndex((it) => it.toLowerCase().includes("potion"));
    const heal = move.healAmount;
    if (idx === -1) {
      events.push("You reach for a potion, but have none left.");
    } else if (heal == null) {
      events.push(`You ready a potion, but no healing roll was read — write your ${POTION_HEAL} total in the Heal box.`);
    } else if (heal < POTION_MIN || heal > POTION_MAX) {
      // Same misread guard as damage: the potion stays in the pack.
      events.push(
        `Heal read as ${heal}, but a potion heals ${POTION_MIN}-${POTION_MAX} (${POTION_HEAL}), so I didn't drink it. Write the right total next turn.`,
      );
    } else {
      const before = ch.currentHp;
      const newHp = Math.min(ch.maxHp, before + heal);
      ch.currentHp = newHp;
      ch.inventory = consumePotion(ch.inventory, idx);
      events.push(`You drink a potion and recover ${newHp - before} HP (now ${newHp}/${ch.maxHp}).`);
    }
  }

  // --- Search the room for loot (Perception vs. a flat DC) ----------------
  if (marked("search")) {
    const loot = node.loot ?? [];
    if (gs.searchedNodes.includes(gs.currentNode)) {
      events.push("You search again, but find nothing new.");
    } else if (move.perceptionRoll == null) {
      events.push("You search, but no Perception roll was read — write your total in the Perception box.");
    } else if (move.perceptionRoll < SEARCH_DC) {
      gs.searchedNodes.push(gs.currentNode);
      events.push(`You search but don't find anything (Perception ${move.perceptionRoll} vs DC ${SEARCH_DC}).`);
    } else if (loot.length > 0) {
      ch.inventory = [...ch.inventory, ...loot];
      gs.searchedNodes.push(gs.currentNode);
      events.push(`You search and find: ${loot.join(", ")} (Perception ${move.perceptionRoll} vs DC ${SEARCH_DC}).`);
    } else {
      gs.searchedNodes.push(gs.currentNode);
      events.push(`You search carefully but find nothing of value (Perception ${move.perceptionRoll} vs DC ${SEARCH_DC}).`);
    }
  }

  // --- Death check (after any healing applied this turn) -----------------
  if (ch.currentHp <= 0) {
    gs.status = "dead";
    events.push("You have fallen. The campaign ends here.");
  }

  // --- Movement ------------------------------------------------------------
  if (gs.status === "active" && chosen) {
    if (sneakSuccess) {
      moveToExit(gs, campaign, monsterHp, chosen, events, "You slip");
    } else if (flee) {
      moveToExit(gs, campaign, monsterHp, chosen, events, "You flee");
    } else if (livingIn(node, monsterHp).length > 0) {
      if (!(sneak || flee)) {
        events.push("Enemies still block the way — clear the room, or Sneak past / Flee.");
      }
    } else {
      moveToExit(gs, campaign, monsterHp, chosen, events, "You go");
    }
  }

  // --- Victory: goal node reached and cleared ------------------------------
  const cur = campaign.nodes[gs.currentNode];
  if (gs.status === "active" && cur.isGoal && livingIn(cur, monsterHp).length === 0) {
    gs.status = "won";
    events.push(`You have cleared ${cur.title}. Victory!`);
  }

  // --- Bookkeeping -----------------------------------------------------------
  gs.turnCount += 1;
  const turnLog = [
    ...state.turnLog,
    {
      turn: gs.turnCount,
      read: move.actionsSummary ?? "",
      result: events.length > 0 ? events.join(" ") : "No effect.",
      confidence: move.confidence ?? null,
      misreadFlag: Boolean(move.misreadFlag),
    },
  ];

  return { state: { character: ch, gameState: gs, turnLog }, events };
}

/** Build a fresh hero from a filled creation sheet and (re)start the
 *  campaign at the first room. Used on a new campaign or after death. */
export function applyCharacterSheet(campaign: DndCampaignDefinition, sheet: DndCharacterSheetInput): DndEngineResult {
  const character = deriveCharacter(sheet);
  const start = campaign.startNode ?? Object.keys(campaign.nodes)[0];

  const gameState: DndGameState = {
    currentNode: start,
    discoveredNodes: [start],
    defeatedMonsters: [],
    monsterHp: {},
    searchedNodes: [],
    combat: { node: null, playerFirst: null },
    status: "active",
    turnCount: 0,
  };

  const intro = `${character.name} the ${character.class} (HP ${character.maxHp}, AC ${character.ac}) enters ${campaign.campaignName}.`;

  const turnLog = [
    {
      turn: 0,
      read: `New hero: ${character.name} the ${character.class}.`,
      result: intro,
      confidence: sheet.confidence ?? null,
      misreadFlag: false,
    },
  ];

  return { state: { character, gameState, turnLog }, events: [intro] };
}
