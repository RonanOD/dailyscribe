import type { Asset } from "@dailyscribe/core";
import { Document, Image, Page, StyleSheet, Text, renderToBuffer } from "@react-pdf/renderer";

import { heroCoverArtBase64 } from "./digest-cover-art";

const styles = StyleSheet.create({
  page: {
    paddingVertical: 48,
    paddingHorizontal: 56,
    fontFamily: "Helvetica",
    color: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  art: { width: 146, height: 160 },
  title: { fontSize: 28, fontWeight: "bold", marginTop: 24, textAlign: "center" },
  subtitle: { fontSize: 14, color: "#444444", marginTop: 10, textAlign: "center" },
  body: { fontSize: 11, color: "#444444", marginTop: 28, maxWidth: 380, textAlign: "center", lineHeight: 1.5 },
  footer: { fontSize: 9, color: "#888888", marginTop: 36, textAlign: "center" },
});

/**
 * The one-page "it worked" PDF sent by onboarding's Kindle test send. Its only
 * job is to land on the device: if the user sees it, my@dailyscribe.ca is on
 * their Approved list and the Kindle address is right.
 */
export async function renderWelcomePdf(): Promise<Asset> {
  const bytes = await renderToBuffer(
    <Document title="Welcome to Daily Scribe" author="Daily Scribe">
      <Page size="A4" style={styles.page}>
        <Image style={styles.art} src={`data:image/png;base64,${heroCoverArtBase64}`} />
        <Text style={styles.title}>Your Kindle is connected</Text>
        <Text style={styles.subtitle}>Welcome to Daily Scribe.</Text>
        <Text style={styles.body}>
          If you can read this, Amazon accepted mail from my@dailyscribe.ca and your daily editions will
          arrive here too. Head back to the setup page, tell us it arrived, and pick your services.
        </Text>
        <Text style={styles.footer}>my.dailyscribe.ca</Text>
      </Page>
    </Document>,
  );
  return { filename: "welcome-to-daily-scribe.pdf", contentType: "application/pdf", bytes };
}
