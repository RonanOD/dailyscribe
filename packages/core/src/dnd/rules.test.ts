import { describe, expect, it } from "vitest";
import { abilityMod, deriveCharacter, hpPerLevel, levelUp, normalizeClass, proficiencyBonus } from "./rules";

describe("abilityMod", () => {
  it("matches standard 5e ability modifier table", () => {
    expect(abilityMod(10)).toBe(0);
    expect(abilityMod(11)).toBe(0);
    expect(abilityMod(8)).toBe(-1);
    expect(abilityMod(18)).toBe(4);
    expect(abilityMod(3)).toBe(-4);
  });
});

describe("proficiencyBonus", () => {
  it("is +2 at level 1-4 and increases every 4 levels", () => {
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(4)).toBe(2);
    expect(proficiencyBonus(5)).toBe(3);
    expect(proficiencyBonus(9)).toBe(4);
  });
});

describe("normalizeClass", () => {
  it("passes through a known class, case-insensitively", () => {
    expect(normalizeClass("Rogue")).toBe("rogue");
    expect(normalizeClass("BARBARIAN")).toBe("barbarian");
  });

  it("defaults to fighter for unknown/missing input", () => {
    expect(normalizeClass("wizard")).toBe("fighter");
    expect(normalizeClass(null)).toBe("fighter");
    expect(normalizeClass(undefined)).toBe("fighter");
  });
});

describe("deriveCharacter", () => {
  it("derives a fighter with fixed AC 18 and HP = d10 + CON mod", () => {
    const ch = deriveCharacter({ name: "Rowan", class: "fighter", scores: { constitution: 14 } });
    expect(ch.class).toBe("Fighter");
    expect(ch.ac).toBe(18);
    expect(ch.maxHp).toBe(12); // hit die 10 + CON mod (+2)
    expect(ch.currentHp).toBe(ch.maxHp);
    expect(ch.weapon).toBe("Longsword");
  });

  it("derives a rogue with AC = 11 + DEX mod", () => {
    const ch = deriveCharacter({ name: "Vex", class: "rogue", scores: { dexterity: 16 } });
    expect(ch.ac).toBe(14); // 11 + 3
    expect(ch.skillProficiencies).toContain("Stealth");
  });

  it("derives a barbarian with AC = 10 + DEX mod + CON mod", () => {
    const ch = deriveCharacter({ name: "Krag", class: "barbarian", scores: { dexterity: 14, constitution: 16 } });
    expect(ch.ac).toBe(15); // 10 + 2 + 3
    expect(ch.maxHp).toBe(15); // hit die 12 + CON mod (+3)
  });

  it("defaults every missing score to 10 and clamps out-of-range scores to 1-20", () => {
    const ch = deriveCharacter({ name: "Test", class: "fighter", scores: { strength: 99, wisdom: -5 } });
    expect(ch.scores.strength).toBe(20);
    expect(ch.scores.wisdom).toBe(1);
    expect(ch.scores.dexterity).toBe(10);
  });

  it("defaults an unknown class to fighter and a blank/missing name to Hero", () => {
    const ch = deriveCharacter({ name: "  ", class: "wizard", scores: {} });
    expect(ch.class).toBe("Fighter");
    expect(ch.name).toBe("Hero");
  });
});

describe("levelUp", () => {
  it("adds the hit-die average plus CON per level, heals to full, and keeps the gear", () => {
    const barbarian = { ...deriveCharacter({ name: "Ash", class: "barbarian", scores: { constitution: 14 } }), currentHp: 1 };
    expect(barbarian.maxHp).toBe(14); // d12 + 2
    expect(hpPerLevel(barbarian)).toBe(9); // 12 / 2 + 1 + 2
    const up = levelUp(barbarian);
    expect(up).toMatchObject({ level: 2, maxHp: 23, currentHp: 23, inventory: barbarian.inventory });
  });

  it("always gains at least 1 HP", () => {
    const frail = deriveCharacter({ name: "Pip", class: "rogue", scores: { constitution: 1 } });
    expect(hpPerLevel(frail)).toBe(1); // 8 / 2 + 1 - 5, floored at 1
  });
});
