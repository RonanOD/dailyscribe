import { Playfair_Display, PT_Serif } from "next/font/google";

// Shared with both apps so headings/body text render identically across
// dailyscribe.ca (apps/marketing) and my.dailyscribe.ca (apps/web). next/font
// runs per call site, so each app must still import and apply these itself
// (via transpilePackages) rather than importing pre-built CSS.
export const fontDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

export const fontBody = PT_Serif({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-body",
  display: "swap",
});
