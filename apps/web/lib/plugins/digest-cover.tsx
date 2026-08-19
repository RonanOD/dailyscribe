import type { Asset } from "@dailyscribe/core";
import {
  Circle,
  Document,
  G,
  Line,
  Link,
  Page,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

// A4 in PDF points (pdfkit's own PAGE_SIZES constant) — needed here (not
// just passed to <Page size="A4">) because tocRowRect must compute each
// TOC row's on-page rectangle in the same coordinate space pdf-lib will
// place a Link annotation in.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 48;
const HEADING_BLOCK_HEIGHT = 64;
const ROW_HEIGHT = 34;
const TOC_ROWS_TOP = MARGIN_TOP + HEADING_BLOCK_HEIGHT;

const styles = StyleSheet.create({
  coverPage: {
    paddingVertical: 48,
    paddingHorizontal: 56,
    fontFamily: "Helvetica",
    color: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  coverTitle: { fontSize: 30, fontWeight: "bold", marginTop: 24, textAlign: "center" },
  coverDate: { fontSize: 13, color: "#444444", marginTop: 8, textAlign: "center" },
  coverTagline: { fontSize: 10, color: "#888888", marginTop: 16, textAlign: "center" },

  tocPage: { paddingVertical: MARGIN_TOP, paddingHorizontal: MARGIN_X, fontFamily: "Helvetica", color: "#111111" },
  tocHeading: { fontSize: 20, fontWeight: "bold" },
  tocRow: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "0.5pt solid #dddddd",
  },
  tocLabel: { fontSize: 12 },
  tocPageNum: { fontSize: 11, color: "#666666" },

  legal: { position: "absolute", bottom: 40, left: MARGIN_X, right: MARGIN_X, fontSize: 8, color: "#888888", textAlign: "center" },
  legalLink: { color: "#6ea8fe" },
});

/** tablet-stylus.svg (apps/web/public), hand-translated to react-pdf's own
 *  SVG primitives — react-pdf's <Image> only rasterizes PNG/JPG, it can't
 *  load an .svg file directly (same reason kanji.tsx's GlyphSvg hand-draws
 *  stroke paths instead of embedding an image). Re-stroked from the
 *  source's pale #e7e9ee (styled for a dark web background) to #111111 so
 *  it reads on a printed/white page. */
function CoverArt({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 640 800">
      <G fill="none" stroke="#111111" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
        <Rect x={120} y={70} width={300} height={470} rx={26} />
        <Rect x={144} y={100} width={252} height={392} rx={10} strokeWidth={4} />
        <Circle cx={270} cy={520} r={6} strokeWidth={4} />
        <Line x1={170} y1={170} x2={370} y2={170} strokeWidth={3} />
        <Line x1={170} y1={210} x2={370} y2={210} strokeWidth={3} />
        <Line x1={170} y1={250} x2={330} y2={250} strokeWidth={3} />
        <Rect x={480} y={100} width={28} height={360} rx={14} />
        <Line x1={480} y1={440} x2={508} y2={440} strokeWidth={4} />
        <Path d="M480 460 L508 460 L494 496 Z" />
      </G>
    </Svg>
  );
}

/** A TOC row's clickable rectangle in PDF points (bottom-left origin) —
 *  must exactly match tocRow's layout (fixed heading block + fixed-height,
 *  unpadded rows) so the link annotation pdf-lib adds later lands where
 *  the row actually is. */
function tocRowRect(index: number): [number, number, number, number] {
  const topFromPageTop = TOC_ROWS_TOP + index * ROW_HEIGHT;
  const bottomFromPageTop = topFromPageTop + ROW_HEIGHT;
  return [MARGIN_X, PAGE_HEIGHT - bottomFromPageTop, PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - topFromPageTop];
}

export interface DigestCoverSection {
  label: string;
  /** 1-indexed page number in the final assembled digest. */
  startPage: number;
}

export interface DigestCoverResult {
  /** 2-page PDF: page 1 cover, page 2 table of contents. */
  asset: Asset;
  /** One rect per section, same order as the input — for wiring TOC links. */
  tocLinkRects: [number, number, number, number][];
}

function DigestCoverDocument({ sections, dateFormatted }: { sections: DigestCoverSection[]; dateFormatted: string }) {
  return (
    <Document title="Daily Scribe Digest" author="Daily Scribe">
      <Page size="A4" style={styles.coverPage}>
        <CoverArt size={160} />
        <Text style={styles.coverTitle}>Daily Scribe</Text>
        <Text style={styles.coverDate}>{dateFormatted}</Text>
        <Text style={styles.coverTagline}>Your daily services, bundled into one PDF.</Text>
      </Page>
      <Page size="A4" style={styles.tocPage}>
        <View style={{ height: HEADING_BLOCK_HEIGHT, justifyContent: "flex-end" }}>
          <Text style={styles.tocHeading}>Table of Contents</Text>
        </View>
        {sections.map((s) => (
          <View key={s.label} style={styles.tocRow}>
            <Text style={styles.tocLabel}>{s.label}</Text>
            <Text style={styles.tocPageNum}>page {s.startPage}</Text>
          </View>
        ))}
        <View style={styles.legal}>
          <Text>
            <Link src="https://www.dailyscribe.ca" style={styles.legalLink}>
              www.dailyscribe.ca
            </Link>
          </Text>
          <Text style={{ marginTop: 4 }}>
            Bundled content is aggregated from third-party sources for personal use. Daily Scribe claims no
            copyright over it and is not liable for its accuracy or any issues arising from its use.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderDigestCoverPdf(sections: DigestCoverSection[], date: Date): Promise<DigestCoverResult> {
  const dateFormatted = new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);

  const bytes = await renderToBuffer(<DigestCoverDocument sections={sections} dateFormatted={dateFormatted} />);

  return {
    asset: { filename: "digest-cover.pdf", contentType: "application/pdf", bytes },
    tocLinkRects: sections.map((_, i) => tocRowRect(i)),
  };
}
