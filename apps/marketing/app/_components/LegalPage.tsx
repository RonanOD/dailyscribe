import type { ReactNode } from "react";
import { LEGAL_EFFECTIVE_DATE } from "@/lib/site";
import { SiteFooter } from "./SiteFooter";

// Minimal shell for the Privacy / Terms pages: a plain wordmark that links back
// to the home page, the article body, and the shared footer. No client JS.
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
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
        <p className="legal-updated">Last updated {LEGAL_EFFECTIVE_DATE}</p>
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
