import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fontDisplay, fontBody } from "@dailyscribe/theme/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Scribe",
  description: "Daily crosswords and more, delivered to your Kindle.",
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
