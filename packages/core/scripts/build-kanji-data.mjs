#!/usr/bin/env node
/**
 * One-time (or occasional, e.g. to extend JLPT coverage) generator for
 * packages/core/src/data/kanji.ts. Not part of the app build or runtime —
 * run manually with `node scripts/build-kanji-data.mjs [maxJlptLevel]` and
 * commit the regenerated output.
 *
 * Sources:
 *  - davidluzgouveia/kanji-data (MIT) — meanings/readings/JLPT level, itself
 *    derived from KANJIDIC2 (EDRDG, CC BY-SA 4.0) plus the community JLPT
 *    backfill (official KANJIDIC2 dropped JLPT levels after 2010).
 *  - KanjiVG (Ulrich Apel, CC BY-SA 3.0) — per-character stroke-order SVGs.
 *
 * Both sources require attribution on redistribution; the generated PDF
 * template carries a fixed attribution line instead of doing this at
 * request time (see apps/web/lib/plugins/kanji.tsx).
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "../src/data/kanji.ts");
const DATASET_VERSION = "2026-08-10";

const KANJI_DATA_URL = "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json";
const KANJIVG_BASE = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji";

const maxJlptLevel = Number(process.argv[2] ?? 5); // include JLPT levels [maxJlptLevel..5], e.g. 5 = N5 only

function codepointFile(char) {
  return char.codePointAt(0).toString(16).padStart(5, "0");
}

/** Derive one example "word" from a KANJIDIC-style kun reading list.
 * Kun readings use a dot to mark okurigana, e.g. "ひと.つ" -> word "一つ" /
 * reading "ひとつ" — these make the most natural standalone example words
 * (numeral counters, i-adjectives), so they're preferred first. A reading
 * with no dot and no dash is already a standalone word (e.g. "みず" for 水).
 * A leading "-" marks a suffix-only reading and a trailing "-" marks a
 * prefix-only reading (e.g. "ひと-" for 一, or "-た.い" for 度) — neither
 * stands alone even if it also happens to contain a dot, so dash-marked
 * readings are excluded from the dotted/plain buckets entirely and only
 * used as a last resort (dash and dot both stripped). Falls back to the
 * bare kanji + first on-yomi reading if the kanji has no kun readings at
 * all. Note: this only fixes the mechanical dash/dot bug — it can't tell
 * which reading is the *most idiomatic* one when a kanji has several
 * unrelated-looking kun readings (e.g. 事's rarely-used つか.う), so a few
 * entries may still read oddly; spot-check the generated output. */
function deriveExample(char, meanings, kunReadings) {
  const readings = kunReadings ?? [];
  const isAffix = (r) => r.startsWith("-") || r.endsWith("-");
  const dotted = readings.filter((r) => r.includes(".") && !isAffix(r));
  const plain = readings.filter((r) => !r.includes(".") && !isAffix(r));
  const affix = readings.filter(isAffix);

  for (const reading of dotted) {
    const dot = reading.indexOf(".");
    const stem = reading.slice(0, dot);
    const okurigana = reading.slice(dot + 1);
    return { word: `${char}${okurigana}`, reading: `${stem}${okurigana}`, meaning: meanings[0] ?? "" };
  }
  for (const reading of plain) {
    return { word: char, reading, meaning: meanings[0] ?? "" };
  }
  for (const reading of affix) {
    const stripped = reading.replace(/^-|-$/g, "");
    const dot = stripped.indexOf(".");
    const clean = dot === -1 ? stripped : stripped.slice(0, dot) + stripped.slice(dot + 1);
    return { word: char, reading: clean, meaning: meanings[0] ?? "" };
  }
  return null; // caller falls back to on-yomi
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.json();
}

async function fetchStrokes(char) {
  const file = codepointFile(char);
  const url = `${KANJIVG_BASE}/${file}.svg`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const svg = await res.text();
  const strokePaths = svg.match(/<path[^>]*\bd="([^"]+)"/g) ?? [];
  const ds = strokePaths.map((tag) => tag.match(/\bd="([^"]+)"/)[1]);
  return ds.length > 0 ? ds : null;
}

async function main() {
  console.error(`Fetching kanji-data.json ...`);
  const all = await fetchJson(KANJI_DATA_URL);

  // Group by JLPT level first (5 = easiest, taught first), then by frequency
  // rank within each level — a pure frequency sort would interleave levels
  // and could teach a rarer N5 kanji after a more common N4 one.
  const candidates = Object.entries(all)
    .filter(([, v]) => typeof v.jlpt_new === "number" && v.jlpt_new >= maxJlptLevel)
    .sort((a, b) => b[1].jlpt_new - a[1].jlpt_new || (a[1].freq ?? 9999) - (b[1].freq ?? 9999));

  console.error(`${candidates.length} candidate kanji at JLPT N${maxJlptLevel}+; fetching stroke data ...`);

  const entries = [];
  for (const [char, v] of candidates) {
    const strokes = await fetchStrokes(char);
    if (!strokes) {
      console.error(`  skip ${char}: no KanjiVG stroke data`);
      continue;
    }
    const example =
      deriveExample(char, v.meanings, v.readings_kun) ?? {
        word: char,
        reading: (v.readings_on ?? [""])[0],
        meaning: v.meanings?.[0] ?? "",
      };
    entries.push({
      char,
      jlpt: v.jlpt_new,
      strokeCount: v.strokes,
      meanings: v.meanings ?? [],
      onyomi: v.readings_on ?? [],
      kunyomi: v.readings_kun ?? [],
      example,
      strokes: strokes.map((d) => ({ d })),
    });
  }

  console.error(`Writing ${entries.length} entries to ${OUT_PATH}`);

  const header = `// Generated by scripts/build-kanji-data.mjs — do not hand-edit.
// Kanji data: KANJIDIC2 / EDRDG (CC BY-SA 4.0), via davidluzgouveia/kanji-data (MIT).
// Stroke diagrams: KanjiVG, © Ulrich Apel (CC BY-SA 3.0).

export const DATASET_VERSION = ${JSON.stringify(DATASET_VERSION)};

export interface KanjiExample {
  word: string;
  reading: string;
  meaning: string;
}

export interface KanjiEntry {
  char: string;
  jlpt: 1 | 2 | 3 | 4 | 5;
  strokeCount: number;
  meanings: string[];
  onyomi: string[];
  kunyomi: string[];
  example: KanjiExample;
  strokes: { d: string }[];
}

export const KANJI_CURRICULUM: KanjiEntry[] = `;

  const body = JSON.stringify(entries, null, 2);
  await writeFile(OUT_PATH, header + body + ";\n");
  console.error("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
