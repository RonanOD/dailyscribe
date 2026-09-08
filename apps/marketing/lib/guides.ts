import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

// Guides are plain Markdown files with YAML frontmatter under content/guides/,
// read at build time the same way lib/content.ts reads landing.yml. Editable in
// Decap CMS via the "Guides" folder collection (see app/admin/config.yml).

export interface GuideMeta {
  slug: string;
  title: string;
  description: string;
  /** ISO date, e.g. "2026-09-08". */
  updated: string;
  /** Lower sorts earlier on the index. */
  order: number;
}

export interface Guide extends GuideMeta {
  /** Markdown body (frontmatter stripped). */
  body: string;
}

const guidesDir = path.join(process.cwd(), "content", "guides");

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFile(file: string): Guide {
  const raw = readFileSync(path.join(guidesDir, file), "utf8");
  const match = raw.match(FRONTMATTER);
  if (!match) {
    throw new Error(`Guide "${file}" is missing YAML frontmatter.`);
  }
  const fm = (yaml.load(match[1]) ?? {}) as Record<string, unknown>;
  const slug = file.replace(/\.md$/, "");
  return {
    slug,
    title: String(fm.title ?? slug),
    description: String(fm.description ?? ""),
    updated: String(fm.updated ?? ""),
    order: typeof fm.order === "number" ? fm.order : 999,
    body: match[2].trim(),
  };
}

function guideFiles(): string[] {
  return readdirSync(guidesDir).filter((f) => f.endsWith(".md"));
}

export function getGuideSlugs(): string[] {
  return guideFiles().map((f) => f.replace(/\.md$/, ""));
}

export function getAllGuides(): Guide[] {
  return guideFiles()
    .map(parseFile)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function getGuide(slug: string): Guide | undefined {
  if (!/^[a-z0-9-]+$/.test(slug)) return undefined;
  try {
    return parseFile(`${slug}.md`);
  } catch {
    return undefined;
  }
}
