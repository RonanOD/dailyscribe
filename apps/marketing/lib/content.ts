import { readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export interface Teaser {
  kicker: string;
  title: string;
  body: string;
  anchor: string;
}

export interface HowItWorksStep {
  numeral: string;
  title: string;
  body: string;
}

export interface Feature {
  id: string;
  kicker: string;
  title: string;
  body: string;
  note: string;
  coming_soon: boolean;
  media_right: boolean;
  image: string;
  image_alt: string;
}

export interface PremiumPoint {
  heading: string;
  body: string;
}

export interface Vignette {
  caption: string;
  image: string;
  image_alt: string;
}

export interface SampleEdition {
  kicker: string;
  heading: string;
  body: string;
  button_label: string;
  file: string;
}

export interface LandingContent {
  dateline: string;
  hero_heading: string;
  hero_subheading: string;
  hero_image: string;
  hero_image_alt: string;
  teasers: Teaser[];
  how_it_works: HowItWorksStep[];
  sample_edition: SampleEdition;
  features: Feature[];
  premium_callout: {
    heading: string;
    body: string;
    points: PremiumPoint[];
  };
  plain_email_note: {
    heading: string;
    body: string;
    image: string;
    image_alt: string;
  };
  vignettes: Vignette[];
  final_cta: {
    heading: string;
    body: string;
  };
}

// Read at module scope: for the marketing page (statically rendered), this runs
// once at build time, not per request.
const contentPath = path.join(process.cwd(), "content", "landing.yml");

export function getLandingContent(): LandingContent {
  const raw = readFileSync(contentPath, "utf8");
  return yaml.load(raw) as LandingContent;
}
