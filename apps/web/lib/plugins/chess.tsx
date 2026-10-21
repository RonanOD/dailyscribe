import {
  CHESS_DIFFICULTY_LABELS,
  fenToBoard,
  formatIsoDate,
  formatSolution,
  parseChessConfig,
  selectChessPuzzles,
  sideToMove,
  type Asset,
  type ChessDifficulty,
  type ChessPuzzle,
  type RunContext,
  type ServicePlugin,
} from "@dailyscribe/core";
import { Document, Font, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { BUY_ME_A_COFFEE_URL } from "@/lib/site";
import { DEJAVU_CHESS } from "./fonts/dejavu-chess";

Font.register({ family: "DejaVuChess", src: DEJAVU_CHESS });

/** Unicode chess glyphs: outline for White, solid for Black (the usual print convention). */
const GLYPHS: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};
const FILES = "abcdefgh";
// Mid-grey reads clearly on e-ink without swallowing the solid black pieces.
const DARK_SQUARE = "#c4c4c4";

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 36, paddingHorizontal: 40, fontFamily: "Helvetica", color: "#111111" },
  // Room for the digest's "‹ Contents" button (see crossword-render.tsx).
  pageDigestPad: { paddingBottom: 92 },
  masthead: { fontSize: 24, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  date: { fontSize: 11, color: "#444444", marginBottom: 2 },
  subtitle: { fontSize: 10.5, color: "#555555", marginBottom: 12, fontFamily: "Helvetica-Oblique" },
  coffee: { fontSize: 9, color: "#888888", marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  puzzle: { marginBottom: 18 },
  puzzleTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 1 },
  puzzleTask: { fontSize: 9.5, color: "#444444", marginBottom: 5 },
  coord: { fontSize: 7, color: "#555555", textAlign: "center" },
  answerLine: { marginTop: 14, borderBottom: "0.75pt solid #000000", fontSize: 8, color: "#666666", paddingBottom: 2 },
  answerRow: { marginBottom: 14 },
  answerHeading: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  answerMoves: { fontSize: 12, marginTop: 3 },
  answerMeta: { fontSize: 8.5, color: "#666666", marginTop: 3 },
  link: { color: "#666666" },
  spacerText: { fontSize: 11, color: "#888888", textAlign: "center", marginTop: 260, fontFamily: "Helvetica-Oblique" },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7.5, color: "#888888", textAlign: "center" },
});

/** One diagram, oriented from the solver's side, with file/rank labels. */
function Board({ fen, square }: { fen: string; square: number }) {
  const flip = sideToMove(fen) === "black";
  const board = fenToBoard(fen);
  const ranks = flip ? [...board].reverse().map((r) => [...r].reverse()) : board;
  const rankLabels = flip ? ["1", "2", "3", "4", "5", "6", "7", "8"] : ["8", "7", "6", "5", "4", "3", "2", "1"];
  const fileLabels = flip ? [...FILES].reverse() : [...FILES];
  const label = 10;
  return (
    <View>
      {ranks.map((row, r) => (
        <View key={r} style={{ flexDirection: "row" }}>
          <View style={{ width: label, height: square, justifyContent: "center" }}>
            <Text style={styles.coord}>{rankLabels[r]}</Text>
          </View>
          {row.map((piece, c) => (
            <View
              key={c}
              style={{
                width: square,
                height: square,
                backgroundColor: (r + c) % 2 === 1 ? DARK_SQUARE : "#ffffff",
                justifyContent: "center",
                alignItems: "center",
                borderTop: r === 0 ? "1pt solid #000000" : undefined,
                borderBottom: r === 7 ? "1pt solid #000000" : undefined,
                borderLeft: c === 0 ? "1pt solid #000000" : undefined,
                borderRight: c === 7 ? "1pt solid #000000" : undefined,
              }}
            >
              {piece && (
                <Text style={{ fontFamily: "DejaVuChess", fontSize: square * 0.82, lineHeight: 1 }}>
                  {GLYPHS[piece]}
                </Text>
              )}
            </View>
          ))}
        </View>
      ))}
      <View style={{ flexDirection: "row", marginLeft: label, marginTop: 2 }}>
        {fileLabels.map((f) => (
          <Text key={f} style={[styles.coord, { width: square }]}>
            {f}
          </Text>
        ))}
      </View>
    </View>
  );
}

function PuzzleCell({ puzzle, n, square }: { puzzle: ChessPuzzle; n: number; square: number }) {
  const side = sideToMove(puzzle.fen) === "white" ? "White" : "Black";
  return (
    <View style={[styles.puzzle, { width: square * 8 + 10 }]} wrap={false}>
      <Text style={styles.puzzleTitle}>
        Puzzle {n} · {side} to move
      </Text>
      <Text style={styles.puzzleTask}>{puzzle.hint}</Text>
      <Board fen={puzzle.fen} square={square} />
      <Text style={styles.answerLine}>Your move</Text>
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

function ChessDocument({
  puzzles,
  difficulty,
  date,
  digest,
}: {
  puzzles: ChessPuzzle[];
  difficulty: ChessDifficulty;
  date: Date;
  digest?: boolean;
}) {
  const pageStyle = digest ? [styles.page, styles.pageDigestPad] : styles.page;
  // One puzzle gets a big board; two to four share a 2-column grid.
  const square = puzzles.length === 1 ? 42 : 25;
  const footer = (
    <Text
      style={styles.footer}
      render={({ pageNumber, totalPages }) =>
        "Puzzles from the Lichess puzzle database (lichess.org, CC0) · Delivered by Daily Scribe" +
        (digest ? "" : ` · Page ${pageNumber} of ${totalPages}`)
      }
      fixed
    />
  );
  return (
    <Document title={`Chess Puzzles — ${formatIsoDate(date)}`} author="Daily Scribe">
      <Page size="A4" style={pageStyle}>
        <Text style={styles.masthead}>Chess Puzzles</Text>
        <Text style={styles.date}>{formatLongDate(date)}</Text>
        <Text style={styles.subtitle}>{CHESS_DIFFICULTY_LABELS[difficulty]}</Text>
        {!digest && (
          <Link src={BUY_ME_A_COFFEE_URL} style={styles.coffee}>
            Enjoy this with your coffee? Consider buying the creator one, it helps cover the running costs.
          </Link>
        )}
        <View style={[styles.grid, puzzles.length === 1 ? { justifyContent: "center" } : {}]}>
          {puzzles.map((p, i) => (
            <PuzzleCell key={p.id} puzzle={p} n={i + 1} square={square} />
          ))}
        </View>
        {footer}
      </Page>
      {/* Spacer page so flipping back and forth doesn't land on the answers by accident. */}
      <Page size="A4" style={pageStyle}>
        <Text style={styles.spacerText}>— Turn the page for today&apos;s solutions —</Text>
        {footer}
      </Page>
      <Page size="A4" style={pageStyle}>
        <Text style={styles.masthead}>Chess Puzzles — Solutions</Text>
        <Text style={[styles.date, { marginBottom: 16 }]}>{formatLongDate(date)}</Text>
        {puzzles.map((p, i) => (
          <View key={p.id} style={styles.answerRow} wrap={false}>
            <Text style={styles.answerHeading}>Puzzle {i + 1}</Text>
            <Text style={styles.answerMoves}>{formatSolution(p.fen, p.solution)}</Text>
            <Text style={styles.answerMeta}>
              Rated {p.rating} ·{" "}
              <Link src={`https://lichess.org/training/${p.id}`} style={styles.link}>
                lichess.org/training/{p.id}
              </Link>
            </Text>
          </View>
        ))}
        {footer}
      </Page>
    </Document>
  );
}

export async function renderChessPdf(
  puzzles: ChessPuzzle[],
  difficulty: ChessDifficulty,
  date: Date,
  opts: { digest?: boolean } = {},
): Promise<Buffer> {
  return renderToBuffer(<ChessDocument puzzles={puzzles} difficulty={difficulty} date={date} digest={opts.digest} />);
}

export const chessPlugin: ServicePlugin = {
  id: "chess",
  label: "Chess Puzzles",
  async run(ctx: RunContext): Promise<Asset[]> {
    const config = parseChessConfig(ctx.config);
    const puzzles = selectChessPuzzles(ctx.date, config);
    if (puzzles.length === 0) throw new Error(`No chess puzzles available for ${config.difficulty}.`);
    const bytes = await renderChessPdf(puzzles, config.difficulty, ctx.date, { digest: ctx.digest });
    return [{ filename: `chess-puzzles-${formatIsoDate(ctx.date)}.pdf`, contentType: "application/pdf", bytes }];
  },
};
