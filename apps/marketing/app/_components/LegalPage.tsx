import type { ReactNode } from "react";
import { LEGAL_EFFECTIVE_DATE } from "@/lib/site";
import { SiteFooter } from "./SiteFooter";

// Minimal shell for the Privacy / Terms / FAQ pages: a plain wordmark that links
// back to the home page, the article body, and the shared footer. No client JS.
// `updated` shows the "Last updated" line — on by default for the legal pages,
// pass `updated={false}` for pages (e.g. the FAQ) where a legal date is noise.
export function LegalPage({
  title,
  children,
  updated = true,
}: {
  title: string;
  children: ReactNode;
  updated?: boolean;
}) {
  return (
    <div className="page">
      <header className="legal-masthead">
        <div className="container">
          <a className="legal-wordmark" href="/">
            The Daily Scribe
          </a>
        </div>
      </header>

      <main className="container legal">
        <h1>{title}</h1>
        {updated && <p className="legal-updated">Last updated {LEGAL_EFFECTIVE_DATE}</p>}
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
