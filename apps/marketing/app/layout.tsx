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
      <body>{children}</body>
    </html>
  );
}
