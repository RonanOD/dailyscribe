import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { LegalPage } from "../../_components/LegalPage";
import { GuideCta } from "../../_components/GuideCta";
import { getGuide, getGuideSlugs } from "@/lib/guides";

// Guides are known at build time; anything else is a 404, not an on-demand render.
export const dynamicParams = false;

export function generateStaticParams() {
  return getGuideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  const url = `https://dailyscribe.ca/guides/${guide.slug}`;
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: `${guide.title} — The Daily Scribe`,
      description: guide.description,
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.description,
    },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  return (
    <LegalPage title={guide.title} updated={false}>
      <p className="legal-updated">
        <a href="/guides">Guides</a>
        {guide.updated ? ` · updated ${guide.updated}` : ""}
      </p>
      <div className="guide-body">
        <ReactMarkdown>{guide.body}</ReactMarkdown>
      </div>
      <GuideCta slug={guide.slug} />
    </LegalPage>
  );
}
