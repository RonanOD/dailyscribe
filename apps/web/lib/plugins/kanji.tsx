import path from "node:path";
import {
  collections,
  DATASET_VERSION,
  formatIsoDate,
  KANJI_CURRICULUM,
  parseKanjiConfig,
  selectBatch,
  type Asset,
  type KanjiBatch,
  type KanjiEntry,
  type RunContext,
  type ServicePlugin,
} from "@dailyscribe/core";
import { Document, Font, G, Line, Page, Path, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";

const PRACTICE_BOXES = 6;
const GLYPH_VIEWBOX = 109; // KanjiVG's native coordinate space
const FONT_FAMILY = "NotoSansJP";

// Helvetica (react-pdf's default) has no Japanese glyphs; every kanji/kana
// string in this document needs a CJK-capable font instead. The bundled TTFs
// are a Noto Sans JP subset containing only hiragana/katakana + the kanji
// curriculum's own glyphs (built via Google Fonts' `text=` subsetting param),
// to keep the file small rather than shipping full Noto Sans JP.
const FONTS_DIR = path.join(__dirname, "fonts");
Font.register({
  family: FONT_FAMILY,
  fonts: [
    { src: path.join(FONTS_DIR, "noto-sans-jp-400.ttf"), fontWeight: "normal" },
    { src: path.join(FONTS_DIR, "noto-sans-jp-700.ttf"), fontWeight: "bold" },
  ],
});

// React-PDF Stylesheet
const styles = StyleSheet.create({
  page: { paddingVertical: 40, paddingHorizontal: 48, fontFamily: FONT_FAMILY, color: "#111111" },
  masthead: { fontSize: 24, fontWeight: "bold", marginBottom: 2 },
  date: { fontSize: 11, color: "#444444", marginBottom: 14 },
  completedNote: { fontSize: 9.5, color: "#666666", marginBottom: 14 },
  card: { marginBottom: 22, paddingBottom: 16, borderBottom: "0.5pt solid #dddddd" },
  cardHeader: { flexDirection: "row", marginBottom: 8 },
  glyphCol: { width: 100, alignItems: "center" },
  jlptBadge: { fontSize: 8, color: "#666666", marginTop: 2 },
  infoCol: { flex: 1, paddingLeft: 16 },
  meanings: { fontSize: 13, fontWeight: "bold", marginBottom: 4 },
  readingRow: { fontSize: 9.5, color: "#333333", marginBottom: 2 },
  readingLabel: { fontWeight: "bold" },
  exampleRow: { fontSize: 9.5, color: "#222222", marginTop: 4 },
  practiceLabel: { fontSize: 8, color: "#888888", marginBottom: 4 },
  practiceRow: { flexDirection: "row" },
  footer: { position: "absolute", bottom: 20, left: 48, right: 48, fontSize: 7.5, color: "#888888", textAlign: "center" },
});

/** The full character rendered from its KanjiVG stroke paths, as a static outline. */
function GlyphSvg({ entry, size }: { entry: KanjiEntry; size: number }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${GLYPH_VIEWBOX} ${GLYPH_VIEWBOX}`}>
      <G fill="none" stroke="#111111" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        {entry.strokes.map((s, i) => (
          <Path key={i} d={s.d} />
        ))}
      </G>
    </Svg>
  );
}

/** One genkouyoushi-style practice box: a bordered square with a light dashed
 *  center guide, optionally showing a faint reference glyph to trace first. */
function PracticeBox({ size, traceChar }: { size: number; traceChar?: string }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect x={0} y={0} width={size} height={size} fill="none" stroke="#999999" strokeWidth={1} />
      <Line x1={size / 2} y1={0} x2={size / 2} y2={size} stroke="#dddddd" strokeWidth={0.5} strokeDasharray="2,2" />
      <Line x1={0} y1={size / 2} x2={size} y2={size / 2} stroke="#dddddd" strokeWidth={0.5} strokeDasharray="2,2" />
      {traceChar && (
        <Text
          x={size / 2}
          y={size / 2 + size * 0.17}
          textAnchor="middle"
          style={{ fontFamily: FONT_FAMILY, fontSize: size * 0.55, fill: "#cccccc" }}
        >
          {traceChar}
        </Text>
      )}
    </Svg>
  );
}

function KanjiCard({ entry }: { entry: KanjiEntry }) {
  const boxSize = 52;
  return (
    <View style={styles.card} wrap={false}>
      <View style={styles.cardHeader}>
        <View style={styles.glyphCol}>
          <GlyphSvg entry={entry} size={72} />
          <Text style={styles.jlptBadge}>
            N{entry.jlpt} · {entry.strokeCount} strokes
          </Text>
        </View>
        <View style={styles.infoCol}>
          <Text style={styles.meanings}>{entry.meanings.join(", ")}</Text>
          {entry.onyomi.length > 0 && (
            <Text style={styles.readingRow}>
              <Text style={styles.readingLabel}>On: </Text>
              {entry.onyomi.join("、")}
            </Text>
          )}
          {entry.kunyomi.length > 0 && (
            <Text style={styles.readingRow}>
              <Text style={styles.readingLabel}>Kun: </Text>
              {entry.kunyomi.join("、")}
            </Text>
          )}
          <Text style={styles.exampleRow}>
            {entry.example.word} ({entry.example.reading}) — {entry.example.meaning}
          </Text>
        </View>
      </View>
      <Text style={styles.practiceLabel}>Practice</Text>
      <View style={styles.practiceRow}>
        {Array.from({ length: PRACTICE_BOXES }).map((_, i) => (
          <View key={i} style={{ marginRight: 6 }}>
            <PracticeBox size={boxSize} traceChar={i === 0 ? entry.char : undefined} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function KanjiDocument({ batch, date }: { batch: KanjiBatch; date: Date }) {
  const dateFormatted = new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);

  return (
    <Document title={`Kanji A Day — ${formatIsoDate(date)}`} author="Daily Scribe">
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.masthead}>Kanji A Day</Text>
        <Text style={styles.date}>{dateFormatted}</Text>
        {batch.levelCompleted && (
          <Text style={styles.completedNote}>
            You&apos;ve reached the end of this level — here&apos;s a review of the last batch.
          </Text>
        )}
        {batch.entries.map((entry) => (
          <KanjiCard key={entry.char} entry={entry} />
        ))}
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Delivered by Daily Scribe · Page ${pageNumber} of ${totalPages} · Kanji data: KANJIDIC2/EDRDG (CC BY-SA 4.0). Stroke diagrams: KanjiVG, © Ulrich Apel (CC BY-SA 3.0).`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

export async function renderKanjiPdf(batch: KanjiBatch, date: Date): Promise<Buffer> {
  return renderToBuffer(<KanjiDocument batch={batch} date={date} />);
}

export const kanjiPlugin: ServicePlugin = {
  id: "kanji",
  label: "Kanji A Day",
  async run(ctx: RunContext): Promise<Asset[]> {
    const config = parseKanjiConfig(ctx.config);
    const pool = KANJI_CURRICULUM.filter((e) => e.jlpt >= config.maxJlptLevel);
    if (pool.length === 0) {
      throw new Error(`No kanji available for JLPT N${config.maxJlptLevel}+.`);
    }

    const { kanjiProgress } = await collections();
    let progress = await kanjiProgress.findOneAndUpdate(
      { userId: ctx.userId },
      { $setOnInsert: { userId: ctx.userId, cursor: 0, datasetVersion: DATASET_VERSION, updatedAt: new Date() } },
      { upsert: true, returnDocument: "after" },
    );
    if (!progress) throw new Error("Failed to load kanji progress.");

    // A regenerated/reordered dataset invalidates a stored numeric cursor.
    if (progress.datasetVersion !== DATASET_VERSION) {
      await kanjiProgress.updateOne(
        { userId: ctx.userId },
        { $set: { cursor: 0, datasetVersion: DATASET_VERSION, updatedAt: new Date() } },
      );
      progress = { ...progress, cursor: 0, datasetVersion: DATASET_VERSION };
    }

    const batch = selectBatch(pool, progress.cursor, config.kanjiPerDay);
    const bytes = await renderKanjiPdf(batch, ctx.date);

    // Only advance the cursor once the PDF has actually been built, so a
    // render failure never skips kanji the user never received.
    if (!batch.levelCompleted) {
      await kanjiProgress.updateOne(
        { userId: ctx.userId },
        { $inc: { cursor: batch.entries.length }, $set: { updatedAt: new Date() } },
      );
    }

    return [
      {
        filename: `kanji-${formatIsoDate(ctx.date)}.pdf`,
        contentType: "application/pdf",
        bytes,
      },
    ];
  },
};
