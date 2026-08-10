#!/usr/bin/env -S npx tsx
/**
 * Generates lib/plugins/fonts/noto-sans-jp.ts — a base64-inlined Noto Sans JP
 * *subset* containing only the glyphs the current KANJI_CURRICULUM actually
 * needs, plus full hiragana/katakana/ASCII as a fixed safety net. Not part of
 * the app build or runtime; run manually (`npx tsx scripts/build-kanji-font.mjs`
 * from apps/web) whenever packages/core/src/data/kanji.ts grows to cover more
 * JLPT levels, and commit the regenerated output.
 *
 * Must run under tsx (not plain node) because it imports @dailyscribe/core,
 * which ships as raw TypeScript source rather than compiled JS.
 *
 * Why base64-inlined rather than a plain .ttf file loaded via fs at runtime:
 * Next's serverless file tracing didn't reliably bundle a file-based font
 * across a Vercel monorepo build (ENOENT in production even though the local
 * build's .nft.json trace listed it). @react-pdf/font supports `data:` URI
 * font sources directly (decoded via atob, no fs/network involved), so the
 * font bytes are embedded as ordinary JS instead.
 *
 * Why a subset at all, and why Google Fonts specifically: the full Noto Sans
 * JP file is tens of MB; Google Fonts' css2 endpoint accepts a `text=` query
 * param and returns a font containing only the requested glyphs. Requesting
 * with an old-browser User-Agent forces a .ttf response instead of .woff2,
 * since that's what @react-pdf/font's data-URI path expects.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KANJI_CURRICULUM } from "@dailyscribe/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, "../lib/plugins/fonts");
const OUT_TS_PATH = path.join(FONTS_DIR, "noto-sans-jp.ts");

const WEIGHTS = [400, 700];
const OLD_BROWSER_UA = "Mozilla/5.0 (Windows NT 6.1)"; // forces a .ttf response, not .woff2

function buildGlyphSet() {
  const chars = new Set();
  for (const e of KANJI_CURRICULUM) {
    chars.add(e.char);
    for (const s of [...e.onyomi, ...e.kunyomi]) for (const c of s) chars.add(c);
    for (const c of e.example.word) chars.add(c);
    for (const c of e.example.reading) chars.add(c);
    for (const c of e.meanings.join(" ")) chars.add(c);
  }
  // Full hiragana + katakana + ASCII printable, so future data changes
  // (new example words, etc.) can't silently introduce an uncovered kana.
  for (let cp = 0x3040; cp <= 0x30ff; cp++) chars.add(String.fromCodePoint(cp));
  for (let cp = 0x20; cp <= 0x7e; cp++) chars.add(String.fromCodePoint(cp));
  chars.add("、");
  return [...chars].join("");
}

async function fetchSubsetTtf(weight, text) {
  const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await fetch(url, { headers: { "User-Agent": OLD_BROWSER_UA } }).then((r) => r.text());
  const match = css.match(/url\(([^)]+)\)/);
  if (!match) throw new Error(`No font url() found in Google Fonts CSS response for weight ${weight}`);
  const fontUrl = match[1];
  const bytes = await fetch(fontUrl).then((r) => r.arrayBuffer());
  return Buffer.from(bytes);
}

async function main() {
  const glyphs = buildGlyphSet();
  console.error(`Requesting a ${glyphs.length}-glyph Noto Sans JP subset ...`);

  const buffers = {};
  for (const weight of WEIGHTS) {
    buffers[weight] = await fetchSubsetTtf(weight, glyphs);
    await writeFile(path.join(FONTS_DIR, `noto-sans-jp-${weight}.ttf`), buffers[weight]);
    console.error(`  weight ${weight}: ${buffers[weight].length} bytes`);
  }

  const out = `// Base64-inlined so the font ships inside the JS bundle itself instead of
// as a separate file — Next's serverless file tracing didn't reliably pick
// up .ttf files referenced via fs/path.join(__dirname, ...) across a Vercel
// monorepo build, causing an ENOENT in production. Regenerate by running
// \`npx tsx scripts/build-kanji-font.mjs\` from apps/web whenever
// packages/core/src/data/kanji.ts grows to cover more JLPT levels.

export const NOTO_SANS_JP_400 = "data:font/ttf;base64,${buffers[400].toString("base64")}";
export const NOTO_SANS_JP_700 = "data:font/ttf;base64,${buffers[700].toString("base64")}";
`;

  await writeFile(OUT_TS_PATH, out);
  console.error(`Wrote ${OUT_TS_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
