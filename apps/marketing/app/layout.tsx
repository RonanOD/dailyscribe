import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fontDisplay, fontBody } from "@dailyscribe/theme/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Daily Scribe",
  description:
    "One inbox. One PDF. Everything worth reading before breakfast — delivered daily to your Kindle Scribe or your inbox.",
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
