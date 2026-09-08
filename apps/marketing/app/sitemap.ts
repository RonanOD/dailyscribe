import type { MetadataRoute } from "next";
import { getAllGuides } from "@/lib/guides";

const BASE = "https://dailyscribe.ca";

// Served at /sitemap.xml. Static pages are listed explicitly; the guides are
// pulled from content/guides/ so a new .md file appears here automatically.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const guides: MetadataRoute.Sitemap = getAllGuides().map((g) => ({
    url: `${BASE}/guides/${g.slug}`,
    lastModified: g.updated ? new Date(g.updated) : now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/guides`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    ...guides,
    { url: `${BASE}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
