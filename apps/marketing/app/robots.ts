import type { MetadataRoute } from "next";

// Served at /robots.txt. Keeps the Decap CMS admin out of the index; everything
// else is fair game.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/admin" },
    sitemap: "https://dailyscribe.ca/sitemap.xml",
    host: "https://dailyscribe.ca",
  };
}
