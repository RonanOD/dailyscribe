#!/usr/bin/env node
/**
 * Occasional generator for packages/core/src/data/chess-puzzles.json. Not part
 * of the app build or runtime; run manually and commit the output:
 *
 *   curl -LO https://database.lichess.org/lichess_db_puzzle.csv.zst
 *   zstd -dc lichess_db_puzzle.csv.zst | node scripts/build-chess-data.mjs
 *
 * Source: the Lichess puzzle database (https://database.lichess.org/#puzzles),
 * released under CC0. No attribution is required, but the PDF credits Lichess
 * anyway and links each answer back to its lichess.org/training page.
 *
 * Each Lichess row's FEN is the position *before* the opponent's move, and its
 * first UCI move is that opponent move. This script applies it (chess.js, a
 * dev-only dependency) so the stored FEN is the position the solver sees, and
 * converts the rest of the line to SAN for the answer key. The UCI line is
 * kept too, so the app can replay it for the solution diagrams with a tiny
 * move applier (plugins/chess.ts) instead of a chess library.
 *
 * Selection: well-tested, well-liked puzzles only (low rating deviation, high
 * popularity, many plays), solutions short enough to write by hand, then a
 * seeded random sample per difficulty band so themes vary. The sample is
 * shuffled with a fixed seed, so re-running on the same CSV is reproducible.
 * Re-running on a newer CSV reshuffles everything: bump DATASET_VERSION.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_JSON_PATH = path.join(__dirname, "../src/data/chess-puzzles.json");

const DATASET_VERSION = "2026-10-21";
const PER_BAND = 2000;
const MAX_SOLUTION_PLIES = 7; // up to 4 of the solver's own moves
const BANDS = [
  { key: "beginner", min: 400, max: 1199 },
  { key: "intermediate", min: 1200, max: 1599 },
  { key: "club", min: 1600, max: 1999 },
  { key: "advanced", min: 2000, max: 2399 },
  { key: "expert", min: 2400, max: 3400 },
];

/** mulberry32: small seeded PRNG so the sample and shuffle are reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uciToMove(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

/** Short hint shown above the board, from Lichess's theme tags. */
function hintFor(themes) {
  const mate = themes.find((t) => /^mateIn[1-5]$/.test(t));
  if (mate) return `Mate in ${mate.slice(6)}`;
  if (themes.includes("mate")) return "Find the mate";
  if (themes.includes("crushing")) return "Win decisive material";
  if (themes.includes("advantage")) return "Gain the advantage";
  if (themes.includes("equality")) return "Save the game";
  return "Find the best move";
}

const random = rng(20261021);
const reservoirs = new Map(BANDS.map((b) => [b.key, { seen: 0, rows: [] }]));
let total = 0;
let eligible = 0;

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (total++ === 0 && line.startsWith("PuzzleId")) continue;
  // PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate
  const [id, fen, moves, rating, rd, popularity, plays, themes] = line.split(",");
  const r = Number(rating);
  const plies = moves.split(" ").length - 1;
  if (Number(rd) > 80 || Number(popularity) < 90 || Number(plays) < 2000) continue;
  if (plies < 1 || plies > MAX_SOLUTION_PLIES) continue;
  const band = BANDS.find((b) => r >= b.min && r <= b.max);
  if (!band) continue;
  eligible++;
  // Reservoir sampling (Algorithm R): a uniform sample without holding 6M rows.
  const res = reservoirs.get(band.key);
  res.seen++;
  const row = { id, fen, moves, rating: r, themes: themes.split(" ") };
  if (res.rows.length < PER_BAND) res.rows.push(row);
  else {
    const j = Math.floor(random() * res.seen);
    if (j < PER_BAND) res.rows[j] = row;
  }
}

const out = { version: DATASET_VERSION, bands: {} };
for (const band of BANDS) {
  const rows = reservoirs.get(band.key).rows;
  // Fisher-Yates, seeded: the stored order is the delivery order.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  out.bands[band.key] = rows.map((row) => {
    const game = new Chess(row.fen);
    const [setup, ...solution] = row.moves.split(" ");
    game.move(uciToMove(setup));
    const fen = game.fen();
    const san = solution.map((uci) => game.move(uciToMove(uci)).san);
    return { id: row.id, fen, solution: san, uci: solution, rating: row.rating, hint: hintFor(row.themes) };
  });
  console.error(`${band.key}: ${rows.length} of ${reservoirs.get(band.key).seen} eligible`);
}

await writeFile(OUT_JSON_PATH, JSON.stringify(out));
console.error(`Read ${total} rows, ${eligible} eligible; wrote ${OUT_JSON_PATH}`);
