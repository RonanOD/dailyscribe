/**
 * The service catalog — the single source of truth for a service's *identity*
 * (label, icon, one-line blurb, whether it needs a stored secret, whether it
 * shows up in the onboarding picker). Plain data, safe to import from client
 * components (only a type-only import from core) — mirrors the `*-feeds.ts`
 * convention in this folder.
 *
 * The heterogeneous per-service *config* UI still lives hand-written in
 * `app/dashboard/dashboard-form.tsx`; this module is the connective metadata,
 * not a generic field-rendering engine.
 */
import type { BundleableServiceId, SecretProvider } from "@dailyscribe/core";

export interface ServiceCatalogEntry {
  id: BundleableServiceId;
  /** Human-readable name — used for dashboard tabs and onboarding cards. */
  label: string;
  /** Emoji fallback glyph (shown when `iconSrc` is absent). */
  icon: string;
  /** Path to a real logo under /public; takes priority over `icon`. */
  iconSrc?: string;
  /** One sentence, shown on the onboarding picker card. */
  blurb: string;
  /** Provider whose credentials this service needs stored before it can run. */
  needsSecret?: SecretProvider;
  /** Offered as a selectable card in the /onboarding flow. */
  showInOnboarding: boolean;
  /** Rendered as a disabled "coming soon" card — no plugin exists yet. */
  comingSoon?: boolean;
}

/**
 * Order matters: it drives the dashboard tab order AND (via `lib/digest.ts`)
 * the digest cover's table-of-contents order. `nyt-crossword` is intentionally
 * omitted — its plugin is paused (per-user cookie privacy); the subscriptions
 * API route still accepts it separately for back-compat.
 */
export const SERVICE_CATALOG: ServiceCatalogEntry[] = [
  {
    id: "rte",
    label: "RTÉ News",
    icon: "📰",
    iconSrc: "/icons/rte.svg",
    blurb: "A daily PDF of RTÉ headlines and summaries. Choose your sections.",
    showInOnboarding: true,
  },
  {
    id: "cbc",
    label: "CBC News",
    icon: "📰",
    iconSrc: "/icons/cbc.svg",
    blurb: "A daily PDF of CBC headlines and summaries. Choose your sections.",
    showInOnboarding: true,
  },
  {
    id: "bbc",
    label: "BBC News",
    icon: "📰",
    iconSrc: "/icons/bbc.svg",
    blurb: "A daily PDF of BBC headlines and summaries. Choose your sections.",
    showInOnboarding: true,
  },
  {
    id: "ha-summary",
    label: "Home Assistant",
    icon: "🏠",
    iconSrc: "/icons/home-assistant.svg",
    blurb:
      "A morning briefing of your home status, 12-hour weather forecast, climate, and security alerts.",
    needsSecret: "ha",
    showInOnboarding: true,
  },
  {
    id: "kanji",
    label: "Kanji",
    icon: "🈷️",
    blurb:
      "A daily kanji practice sheet — stroke order, readings, an example word, and a writing grid.",
    showInOnboarding: true,
  },
  {
    id: "universal-crossword",
    label: "Universal Crossword",
    icon: "🧩",
    iconSrc: "/icons/crossword.svg",
    blurb:
      "The real daily Universal Crossword — grid and clues on page one, the answer key on page two.",
    showInOnboarding: true,
  },
];

/** Services offered as pickable cards in the /onboarding flow. */
export const ONBOARDING_SERVICES = SERVICE_CATALOG.filter(
  (s) => s.showInOnboarding && !s.comingSoon,
);

const BY_ID = new Map<string, ServiceCatalogEntry>(SERVICE_CATALOG.map((s) => [s.id, s]));

export function getCatalogEntry(id: string): ServiceCatalogEntry | undefined {
  return BY_ID.get(id);
}
