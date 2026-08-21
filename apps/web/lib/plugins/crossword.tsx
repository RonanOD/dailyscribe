import {
  collections,
  createGeminiCrosswordClient,
  formatIsoDate,
  type Asset,
  type CrosswordClue,
  type CrosswordPuzzle,
  type RunContext,
  type ServicePlugin,
} from "@dailyscribe/core";
import { generateLayout } from "crossword-layout-generator";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

/** Below this many successfully-placed words, the puzzle is too sparse to be
 *  worth sending — fail loudly (dropped from a digest, or the standalone
 *  send fails) rather than deliver a near-empty grid. */
const MIN_PLACED_WORDS = 12;
/** Caps how many candidate words get fed to the grid-fitting algorithm. Left
 *  uncapped, ~70-80 Gemini candidates produce a sprawling grid (30+ rows) with
 *  a clue list too long to fit under it on one page — this keeps the puzzle
 *  compact enough that "grid + clues on page 1, answers on page 2" reliably
 *  holds. Longest-first sorting happens before this cap is applied, so the
 *  words most useful for a well-connected grid are the ones kept. */
const MAX_LAYOUT_WORDS = 46;

export interface CrosswordConfig {
  /** Optional theme to steer word/clue generation; blank lets Gemini pick a fresh one daily. */
  theme?: string;
}

export function parseCrosswordConfig(config: unknown): CrosswordConfig {
  const raw = (config ?? {}) as { theme?: unknown };
  const theme = typeof raw.theme === "string" ? raw.theme.trim().slice(0, 80) : "";
  return { theme };
}

/** Feeds a Gemini-generated word list into the crossword-layout-generator's grid-fitting
 *  algorithm and reshapes its output into our own `CrosswordPuzzle` fields. Longest words
 *  first — a common crossword-construction heuristic that gives the fitting algorithm the
 *  hardest-to-place words first, for a better-connected grid. `startx`/`starty` in the
 *  library's result are 1-indexed relative to `table` (confirmed empirically — there's no
 *  type/documentation for this), hence the -1 below. */
function buildGrid(words: { answer: string; clue: string }[]): {
  rows: number;
  cols: number;
  grid: (string | null)[][];
  clues: CrosswordClue[];
} {
  const sorted = [...words].sort((a, b) => b.answer.length - a.answer.length).slice(0, MAX_LAYOUT_WORDS);
  const layout = generateLayout(sorted);
  const grid: (string | null)[][] = layout.table.map((row) => row.map((cell) => (cell === "-" ? null : cell)));
  const clues: CrosswordClue[] = layout.result
    .filter((r) => r.orientation !== "none")
    .map((r) => ({
      position: r.position,
      orientation: r.orientation as "across" | "down",
      clue: r.clue,
      row: r.starty - 1,
      col: r.startx - 1,
      length: r.answer.length,
    }))
    .sort((a, b) => a.position - b.position);
  return { rows: layout.rows, cols: layout.cols, grid, clues };
}

/** Same-day cache: a "Send test now" or a cron retry later the same day reuses the day's
 *  puzzle instead of re-burning a Gemini call and handing the user a different puzzle
 *  mid-day. Keyed by userId + the plugin's own calendar date, same convention as
 *  Delivery.puzzleDate. */
async function getOrCreateCrosswordPuzzle(userId: string, date: Date, theme: string): Promise<CrosswordPuzzle> {
  const isoDate = formatIsoDate(date);
  const { crosswordPuzzles } = await collections();
  const existing = await crosswordPuzzles.findOne({ userId, date: isoDate });
  if (existing) return existing;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const client = createGeminiCrosswordClient({ apiKey, model: process.env.GEMINI_MODEL });
  const batch = await client.generate(theme);
  if (batch.words.length < MIN_PLACED_WORDS) {
    throw new Error("Gemini didn't return enough usable words to build a crossword today.");
  }

  const { rows, cols, grid, clues } = buildGrid(batch.words);
  if (clues.length < MIN_PLACED_WORDS) {
    throw new Error("Not enough of today's words fit together into a grid — try again later.");
  }

  const puzzle: CrosswordPuzzle = {
    userId,
    date: isoDate,
    theme: batch.theme,
    rows,
    cols,
    grid,
    clues,
    createdAt: new Date(),
  };
  await crosswordPuzzles.insertOne(puzzle);
  return puzzle;
}

const styles = StyleSheet.create({
  page: { paddingVertical: 36, paddingHorizontal: 40, fontFamily: "Helvetica", color: "#111111" },
  masthead: { fontSize: 24, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  date: { fontSize: 11, color: "#444444", marginBottom: 2 },
  theme: { fontSize: 10.5, color: "#555555", marginBottom: 14, fontFamily: "Helvetica-Oblique" },
  gridWrap: { alignItems: "center", marginBottom: 14 },
  row: { flexDirection: "row" },
  cluesRow: { flexDirection: "row" },
  cluesCol: { flex: 1, paddingRight: 12 },
  cluesHeading: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    borderBottom: "0.5pt solid #000000",
    paddingBottom: 2,
  },
  clueLine: { fontSize: 7.5, lineHeight: 1.35, marginBottom: 2 },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7.5, color: "#888888", textAlign: "center" },
});

// A4 at 72dpi, minus this page's horizontal padding.
const GRID_MAX_WIDTH = 595 - 2 * 40;
const MIN_CELL = 11;
const MAX_CELL = 26;

/** Cell size that fits the grid within a width/height budget — smaller on the puzzle page
 *  (clues need room underneath) than the answer page (nothing else on it). */
function cellSizeFor(rows: number, cols: number, maxHeight: number): number {
  return Math.max(MIN_CELL, Math.min(MAX_CELL, GRID_MAX_WIDTH / cols, maxHeight / rows));
}

function CrosswordGrid({
  puzzle,
  reveal,
  maxHeight,
}: {
  puzzle: Pick<CrosswordPuzzle, "grid" | "rows" | "cols" | "clues">;
  reveal: boolean;
  maxHeight: number;
}) {
  const cell = cellSizeFor(puzzle.rows, puzzle.cols, maxHeight);
  const numberAt = new Map<string, number>();
  for (const c of puzzle.clues) {
    const key = `${c.row},${c.col}`;
    if (!numberAt.has(key)) numberAt.set(key, c.position);
  }
  return (
    <View style={styles.gridWrap}>
      {puzzle.grid.map((rowCells, r) => (
        <View key={r} style={styles.row}>
          {rowCells.map((letter, c) => {
            const blocked = letter === null;
            const num = numberAt.get(`${r},${c}`);
            return (
              <View
                key={c}
                style={{
                  width: cell,
                  height: cell,
                  borderWidth: blocked ? 0 : 0.75,
                  borderColor: "#000000",
                  backgroundColor: blocked ? "#000000" : "#ffffff",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {!blocked && num !== undefined && (
                  <Text style={{ position: "absolute", top: 1, left: 1.5, fontSize: Math.max(5, cell * 0.24) }}>
                    {num}
                  </Text>
                )}
                {!blocked && reveal && (
                  <Text style={{ fontSize: cell * 0.55, fontFamily: "Helvetica-Bold" }}>{letter}</Text>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function ClueColumns({ clues }: { clues: CrosswordClue[] }) {
  const across = clues.filter((c) => c.orientation === "across").sort((a, b) => a.position - b.position);
  const down = clues.filter((c) => c.orientation === "down").sort((a, b) => a.position - b.position);
  return (
    <View style={styles.cluesRow}>
      <View style={styles.cluesCol}>
        <Text style={styles.cluesHeading}>Across</Text>
        {across.map((c) => (
          <Text key={`a${c.position}`} style={styles.clueLine}>
            {c.position}. {c.clue}
          </Text>
        ))}
      </View>
      <View style={styles.cluesCol}>
        <Text style={styles.cluesHeading}>Down</Text>
        {down.map((c) => (
          <Text key={`d${c.position}`} style={styles.clueLine}>
            {c.position}. {c.clue}
          </Text>
        ))}
      </View>
    </View>
  );
}

function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

/** `digest` suppresses this document's own "Page X of Y" (only correct relative to its own
 *  PDF) since a digest bundle gets one correct page count drawn across the whole assembled
 *  document instead — see packages/core/src/delivery/merge.ts. */
function CrosswordDocument({ puzzle, date, digest }: { puzzle: CrosswordPuzzle; date: Date; digest?: boolean }) {
  const dateFormatted = formatLongDate(date);
  const footer = (
    <Text
      style={styles.footer}
      render={({ pageNumber, totalPages }) =>
        digest ? "Delivered by Daily Scribe" : `Delivered by Daily Scribe · Page ${pageNumber} of ${totalPages}`
      }
      fixed
    />
  );
  return (
    <Document title={`Crossword — ${formatIsoDate(date)}`} author="Daily Scribe">
      <Page size="A4" style={styles.page}>
        <Text style={styles.masthead}>Crossword</Text>
        <Text style={styles.date}>{dateFormatted}</Text>
        <Text style={styles.theme}>Theme: {puzzle.theme}</Text>
        <CrosswordGrid puzzle={puzzle} reveal={false} maxHeight={330} />
        <ClueColumns clues={puzzle.clues} />
        {footer}
      </Page>
      <Page size="A4" style={styles.page}>
        <Text style={styles.masthead}>Crossword — Answers</Text>
        <Text style={styles.date}>{dateFormatted}</Text>
        <CrosswordGrid puzzle={puzzle} reveal maxHeight={660} />
        {footer}
      </Page>
    </Document>
  );
}

/** Render a crossword puzzle to a PDF buffer (pure JS — no native deps, runs on Vercel). */
export async function renderCrosswordPdf(puzzle: CrosswordPuzzle, date: Date, digest?: boolean): Promise<Buffer> {
  return renderToBuffer(<CrosswordDocument puzzle={puzzle} date={date} digest={digest} />);
}

export const crosswordPlugin: ServicePlugin = {
  id: "crossword",
  label: "Crossword",
  async run(ctx: RunContext): Promise<Asset[]> {
    const config = parseCrosswordConfig(ctx.config);
    const puzzle = await getOrCreateCrosswordPuzzle(ctx.userId, ctx.date, config.theme ?? "");
    const bytes = await renderCrosswordPdf(puzzle, ctx.date, ctx.digest);
    return [
      {
        filename: `crossword-${formatIsoDate(ctx.date)}.pdf`,
        contentType: "application/pdf",
        bytes,
      },
    ];
  },
};
