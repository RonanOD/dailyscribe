import type { Metadata } from "next";
import { LegalPage } from "../_components/LegalPage";
import { getAllGuides } from "@/lib/guides";

const PAGE_URL = "https://dailyscribe.ca/guides";

export const metadata: Metadata = {
  title: "Guides",
  description:
    "Practical guides to getting a daily edition onto your Kindle Scribe — sending the news, a daily crossword, scheduling a PDF, and the one Amazon setting to change.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    url: PAGE_URL,
    title: "Guides — The Daily Scribe",
    description:
      "Getting a daily edition onto your Kindle Scribe: the news, a crossword, scheduling a PDF, and setup.",
  },
};

export default function GuidesIndexPage() {
  const guides = getAllGuides();
  return (
    <LegalPage title="Guides" updated={false}>
      <p>
        Short, practical guides to getting a personalised daily edition onto a Kindle
        Scribe (or any e-reader) &mdash; what the device can and can&rsquo;t do on its
        own, and how Daily Scribe fills the gaps.
      </p>
      <ul className="guide-index">
        {guides.map((g) => (
          <li key={g.slug}>
            <a href={`/guides/${g.slug}`}>{g.title}</a>
            {g.description && <p>{g.description}</p>}
          </li>
        ))}
      </ul>
    </LegalPage>
  );
}
