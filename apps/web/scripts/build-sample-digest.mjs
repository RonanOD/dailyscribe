#!/usr/bin/env -S npx tsx
/**
 * Regenerate the public sample digest at
 * apps/marketing/public/uploads/daily-scribe-sample-digest.pdf
 *
 * The news / Home Assistant / Kanji sections are built from synthetic data
 * defined in this file — no user config, no stored secrets, no database — so
 * the output carries NO PII. The crossword section, by default, embeds a real
 * Universal Crossword from the same public feed the product uses (third-party
 * content, not PII); pass SAMPLE_CROSSWORD=synthetic for a hand-built grid.
 *
 * It IS a real run of the pipeline (renderDigestCoverPdf + assembleDigestPdf),
 * so unlike a hand-made mock it has working table-of-contents jumps and
 * tappable article headlines.
 *
 * Run from apps/web:  pnpm build:sample
 * (that sets TSX_TSCONFIG_PATH=scripts/tsconfig.json, which forces the
 *  automatic JSX runtime tsx needs to execute the .tsx renderers directly —
 *  the app's own tsconfig keeps `jsx: preserve` for Next.)
 *
 * Commit the regenerated PDF. Re-run whenever a renderer's layout changes so
 * the public sample keeps matching what subscribers actually receive.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  assembleDigestPdf,
  fetchUniversalPuzzleRaw,
  getPdfPageCount,
  KANJI_CURRICULUM,
  parseUniversalPuzzle,
} from "@dailyscribe/core";

// pdf-lib isn't a direct dep of apps/web; reach it through @dailyscribe/core
// (which is) so the verify step below can introspect the finished document.
const coreRequire = createRequire(import.meta.resolve("@dailyscribe/core"));
const { PDFDocument, PDFName, PDFArray } = coreRequire("pdf-lib");
import { renderRtePdf } from "../lib/plugins/rte";
import { renderHaPdf } from "../lib/plugins/ha";
import { renderKanjiPdf } from "../lib/plugins/kanji";
import { renderCrosswordPdf } from "../lib/plugins/crossword-render";
import { renderDigestCoverPdf } from "../lib/plugins/digest-cover";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(
  __dirname,
  "../../marketing/public/uploads/daily-scribe-sample-digest.pdf",
);

// A fixed date keeps the sample byte-stable across rebuilds (no diff churn).
const DATE = new Date("2026-01-06T00:00:00Z");

// ---------------------------------------------------------------------------
// Synthetic section data. Everything below is invented; none of it is real.
// ---------------------------------------------------------------------------

const NEWS_SECTIONS = [
  {
    label: "Top Stories",
    items: [
      {
        title: "Budget puts housing and childcare at centre of spending plan",
        summary:
          "The package sets aside funds for new builds, cuts to childcare fees and a small rise in carer payments, with the main measures taking effect from April.",
        link: "https://www.rte.ie/news/",
      },
      {
        title: "Wind warning issued for western and northern counties",
        summary:
          "Forecasters expect gusts of up to 110 km/h along exposed coasts overnight, with the warning in place until midday tomorrow.",
        link: "https://www.rte.ie/news/weather/",
      },
      {
        title: "Cross-city rail line clears its final planning hurdle",
        summary:
          "Construction on the long-delayed route is expected to begin next year, with services projected to start by the end of the decade.",
        link: "https://www.rte.ie/news/",
      },
    ],
  },
  {
    label: "Business",
    items: [
      {
        title: "Software firm to add 200 roles at expanded campus",
        summary:
          "The jobs will be split between engineering and support functions and are expected to be filled over the next 18 months.",
        link: "https://www.rte.ie/news/business/",
      },
      {
        title: "Retail sales edged up over the quarter, official figures show",
        summary:
          "Spending on food and household goods rose modestly while sales of larger items were broadly flat.",
        link: "https://www.rte.ie/news/business/",
      },
    ],
  },
];

// The crossword section, by default, embeds a REAL Universal Crossword pulled
// from the same public feed the product uses (see
// packages/core/src/crossword-sources/universal.ts and its licensing note) —
// so the sample matches what subscribers actually receive, at full 15x15 size.
// Set SAMPLE_CROSSWORD=synthetic to use the small hand-built grid below
// instead (also the automatic fallback if the feed can't be reached).
const REAL_CROSSWORD_DATE = "2026-08-18"; // a fixed weekday, so the sample is stable

/** Tiny hand-built grid — a valid 5x5 word square (every row and column is a
 *  real word). Only used offline / when SAMPLE_CROSSWORD=synthetic. */
const FALLBACK_CROSSWORD = {
  date: "2026-01-06",
  title: "Sample Crossword",
  author: "Daily Scribe",
  copyright: "Sample puzzle for demonstration — Daily Scribe",
  rows: 5,
  cols: 5,
  grid: [
    ["H", "E", "A", "R", "T"],
    ["E", "M", "B", "E", "R"],
    ["A", "B", "U", "S", "E"],
    ["R", "E", "S", "I", "N"],
    ["T", "R", "E", "N", "T"],
  ],
  clues: [
    { position: 1, orientation: "across", clue: "Ticker", row: 0, col: 0, length: 5 },
    { position: 6, orientation: "across", clue: "Dying-fire remnant", row: 1, col: 0, length: 5 },
    { position: 7, orientation: "across", clue: "Mistreat", row: 2, col: 0, length: 5 },
    { position: 8, orientation: "across", clue: "Violin-bow application", row: 3, col: 0, length: 5 },
    { position: 9, orientation: "across", clue: "River through Nottingham", row: 4, col: 0, length: 5 },
    { position: 1, orientation: "down", clue: "Where affection sits", row: 0, col: 0, length: 5 },
    { position: 2, orientation: "down", clue: "Glowing coal", row: 0, col: 1, length: 5 },
    { position: 3, orientation: "down", clue: "Heap scorn on", row: 0, col: 2, length: 5 },
    { position: 4, orientation: "down", clue: "Amber, essentially", row: 0, col: 3, length: 5 },
    { position: 5, orientation: "down", clue: "Council of ___ (1545)", row: 0, col: 4, length: 5 },
  ],
  createdAt: DATE,
};

/** Synthetic Home Assistant briefing — invented rooms, devices and events. */
const HA_DATA = {
  todayFormatted: "Tuesday, 6 January 2026",
  sunInfo: "Sunrise 08:41  ·  Sunset 16:29",
  weatherNow: {
    condition: "Partly cloudy",
    tempStr: "4°C",
    highLowStr: "High 7°  ·  Low 1°",
    detailsStr: "Feels like 1°C  ·  Humidity 82%  ·  Wind 18 km/h",
  },
  hourlyForecast: {
    points: [
      { hourLabel: "09", temp: 4, precip: 10 },
      { hourLabel: "12", temp: 6, precip: 20 },
      { hourLabel: "15", temp: 7, precip: 45 },
      { hourLabel: "18", temp: 5, precip: 30 },
      { hourLabel: "21", temp: 3, precip: 10 },
    ],
    tMin: 3,
    tMax: 7,
  },
  anomalies: [
    "Back door was open from 23:38 to 23:52, now closed.",
    "Garage freezer rose to -12°C overnight (setpoint -18°C).",
  ],
  calendarRows: [
    "Today  ·  Recycling and food-waste collection",
    "Today 19:30  ·  Book club",
    "Tomorrow 09:00  ·  Boiler service",
  ],
  climateRows: [
    { room: "Living room", temp: "20.5°C", rh: "44%", target: "21°C", action: "Heating" },
    { room: "Study", temp: "18.1°C", rh: "47%", target: "18°C", action: "Idle" },
    { room: "Bedroom", temp: "17.4°C", rh: "51%", target: "16°C", action: "Idle" },
  ],
  batteryRows: [
    { name: "Front-door sensor", level: 14, isLow: true },
    { name: "Living-room motion", level: 68, isLow: false },
    { name: "Thermostat", level: 92, isLow: false },
  ],
};

// ---------------------------------------------------------------------------

/** Returns the crossword to render: a real Universal puzzle by default, the
 *  hand-built fallback when SAMPLE_CROSSWORD=synthetic or the feed is
 *  unreachable. */
async function resolveCrossword() {
  if (process.env.SAMPLE_CROSSWORD === "synthetic") {
    return { puzzle: FALLBACK_CROSSWORD, masthead: "Daily Crossword", real: false };
  }
  try {
    const raw = await fetchUniversalPuzzleRaw(new Date(`${REAL_CROSSWORD_DATE}T00:00:00Z`));
    const parsed = parseUniversalPuzzle(raw);
    return {
      puzzle: { ...parsed, date: REAL_CROSSWORD_DATE, createdAt: DATE },
      masthead: "Universal Crossword",
      real: true,
    };
  } catch (err) {
    console.warn(
      `  crossword: live feed unavailable (${err instanceof Error ? err.message : err}) — using the synthetic fallback grid.`,
    );
    return { puzzle: FALLBACK_CROSSWORD, masthead: "Daily Crossword", real: false };
  }
}

async function main() {
  const crossword = await resolveCrossword();

  const sections = [
    {
      label: "The News",
      bytes: await renderRtePdf(NEWS_SECTIONS, DATE, true),
    },
    {
      label: "Home Assistant",
      bytes: await renderHaPdf(HA_DATA, DATE, true),
    },
    {
      label: "Kanji A Day",
      bytes: await renderKanjiPdf(
        { entries: KANJI_CURRICULUM.slice(0, 3), levelCompleted: false, isRetry: false },
        DATE,
        // Not a real routing token — a mailed-back sample simply won't match.
        "0000000000000000",
        true,
      ),
    },
    {
      label: "Crossword",
      bytes: await renderCrosswordPdf(crossword.puzzle, DATE, { masthead: crossword.masthead, digest: true }),
    },
  ];

  // Front matter is the 2-page cover + TOC, so the first section starts on page 3.
  let startPage = 3;
  const coverSections = [];
  for (const s of sections) {
    coverSections.push({ label: s.label, startPage });
    startPage += await getPdfPageCount(s.bytes);
  }

  const { asset: cover, tocLinkRects } = await renderDigestCoverPdf(coverSections, DATE);

  const digest = await assembleDigestPdf(
    cover,
    sections.map((s) => ({
      label: s.label,
      asset: { filename: `${s.label}.pdf`, contentType: "application/pdf", bytes: s.bytes },
    })),
    tocLinkRects,
    "daily-scribe-sample-digest.pdf",
  );

  writeFileSync(OUT, digest.bytes);

  // Verify the finished PDF actually carries the links (object streams hide
  // them from a raw grep). Count Link annotations per page and how many are
  // internal jumps (/Dest or a GoTo action) vs. external (/URI).
  const doc = await PDFDocument.load(digest.bytes);
  let internal = 0;
  let external = 0;
  const perPage = [];
  doc.getPages().forEach((page, i) => {
    const annots = page.node.Annots?.();
    const arr = annots instanceof PDFArray ? annots.asArray() : [];
    let onPage = 0;
    for (const ref of arr) {
      const dict = doc.context.lookup(ref);
      const subtype = dict?.get?.(PDFName.of("Subtype"));
      if (subtype?.encodedName !== "/Link") continue;
      onPage += 1;
      const hasDest = dict.get(PDFName.of("Dest")) !== undefined;
      const action = dict.get(PDFName.of("A"));
      const isGoTo =
        action && doc.context.lookup(action)?.get?.(PDFName.of("S"))?.encodedName === "/GoTo";
      if (hasDest || isGoTo) internal += 1;
      else external += 1;
    }
    if (onPage) perPage.push(`p${i + 1}:${onPage}`);
  });

  const totalPages = doc.getPageCount();
  console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
  console.log(`  ${totalPages} pages, ${digest.bytes.length.toLocaleString()} bytes`);
  console.log(`  link annotations: ${internal} internal (TOC / cross-refs) + ${external} external (article headlines)`);
  console.log(`  links by page: ${perPage.join(", ") || "none"}`);
  console.log(`  sections: ${coverSections.map((s) => `${s.label} p${s.startPage}`).join(", ")}`);
  console.log(
    crossword.real
      ? `  crossword: real Universal puzzle (${REAL_CROSSWORD_DATE}) — third-party content, same feed the product uses`
      : `  crossword: synthetic fallback grid`,
  );
  console.log(
    `  PII: none — news / Home Assistant / Kanji are all synthetic (no config, secrets, DB).` +
      (crossword.real ? " The crossword is a real syndicated puzzle." : ""),
  );

  if (internal === 0) {
    console.error("\n!! No internal links in the output — the TOC would be dead. Not a valid sample.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
