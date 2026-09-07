import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fontDisplay, fontBody } from "@dailyscribe/theme/fonts";
import "./globals.css";

const SITE_URL = "https://dailyscribe.ca";
const DESCRIPTION =
  "One inbox. One PDF. The news, a fresh write-in crossword, Kanji practice and your Home Assistant briefing, bound into one edition and emailed to your Kindle Scribe, any e-reader, or plain inbox every morning.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "The Daily Scribe — your morning edition, built for your Kindle",
    template: "%s — The Daily Scribe",
  },
  description: DESCRIPTION,
  applicationName: "The Daily Scribe",
  keywords: [
    "Kindle Scribe",
    "daily PDF to Kindle",
    "send news to Kindle",
    "e-reader daily delivery",
    "Kindle crossword",
    "Kanji practice",
    "Home Assistant morning summary",
  ],
  authors: [{ name: "Ronan O'Driscoll" }],
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "The Daily Scribe",
    title: "The Daily Scribe — your morning edition, built for your Kindle",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "The Daily Scribe — your morning edition, built for your Kindle",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fontDisplay.variable} ${fontBody.variable}`}>
      <body>
        {children}
        {/* Vercel Web Analytics — no dependency; served automatically for
            projects with Web Analytics enabled in the Vercel dashboard. */}
        <script defer src="/_vercel/insights/script.js" />
      </body>
    </html>
  );
}
