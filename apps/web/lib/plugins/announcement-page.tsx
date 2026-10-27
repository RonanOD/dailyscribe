import type { Asset, EditionAnnouncement } from "@dailyscribe/core";
import { Document, Image, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { heroCoverArtBase64 } from "./digest-cover-art";

const styles = StyleSheet.create({
  page: { paddingVertical: 56, paddingHorizontal: 64, fontFamily: "Helvetica", color: "#111111" },
  header: { alignItems: "center" },
  art: { width: 88, height: 96 },
  heading: { fontSize: 26, fontFamily: "Helvetica-Bold", marginTop: 18, textAlign: "center" },
  intro: { fontSize: 12, color: "#444444", marginTop: 8, textAlign: "center", lineHeight: 1.4 },
  item: { marginTop: 26, paddingTop: 16, borderTop: "0.5pt solid #cccccc" },
  itemTitle: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  itemBody: { fontSize: 11, color: "#222222", marginTop: 6, lineHeight: 1.5 },
  itemHowTo: { fontSize: 10, color: "#555555", marginTop: 6 },
  link: { color: "#555555", textDecoration: "none" },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 64,
    right: 64,
    fontSize: 9,
    color: "#888888",
    textAlign: "center",
  },
});

/** Turns a bare "my.dailyscribe.ca/…" in a how-to line into a tappable link. */
function HowTo({ text }: { text: string }) {
  const match = text.match(/(my\.dailyscribe\.ca\S*)/);
  if (!match) return <Text style={styles.itemHowTo}>{text}</Text>;
  const [before, after] = [text.slice(0, match.index), text.slice((match.index ?? 0) + match[1].length)];
  return (
    <Text style={styles.itemHowTo}>
      {before}
      <Link style={styles.link} src={`https://${match[1]}`}>
        {match[1]}
      </Link>
      {after}
    </Text>
  );
}

/**
 * The one-page "What's new" announcement (packages/core/src/announcements.ts):
 * the front page of an edition while an announcement runs, and the whole PDF
 * of a win-back send to users who've stopped getting editions.
 */
export async function renderAnnouncementPdf(
  announcement: EditionAnnouncement,
  opts: { footer?: string } = {},
): Promise<Asset> {
  const bytes = await renderToBuffer(
    <Document title={announcement.heading} author="Daily Scribe">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image style={styles.art} src={`data:image/png;base64,${heroCoverArtBase64}`} />
          <Text style={styles.heading}>{announcement.heading}</Text>
          <Text style={styles.intro}>{announcement.intro}</Text>
        </View>
        {announcement.items.map((item) => (
          <View key={item.title} style={styles.item} wrap={false}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.itemBody}>{item.body}</Text>
            <HowTo text={item.howTo} />
          </View>
        ))}
        <Text style={styles.footer}>
          {opts.footer ?? "This page appears once. Your edition continues on the next page."}
        </Text>
      </Page>
    </Document>,
  );
  return { filename: `whats-new-${announcement.id}.pdf`, contentType: "application/pdf", bytes };
}
