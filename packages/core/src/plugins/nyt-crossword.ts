import type { CrosswordVersion } from "../types";
import type { Asset, RunContext, ServicePlugin } from "./index";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const NYT_BASE = "https://www.nytimes.com/svc/crosswords";

/** Format a date as NYT's "newspaper" print path token, e.g. 2025-01-01 -> "Jan0125". */
export function formatNytPrintDate(date: Date): string {
  const mon = MONTHS[date.getUTCMonth()];
  const day = String(date.getUTCDate()).padStart(2, "0");
  const yy = String(date.getUTCFullYear()).slice(-2);
  return `${mon}${day}${yy}`;
}

/** Calendar date as YYYY-MM-DD (UTC getters). */
export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Date-based print PDF (newspaper layout). */
export function buildNewspaperUrl(date: Date): string {
  return `${NYT_BASE}/v2/puzzle/print/${formatNytPrintDate(date)}.pdf`;
}

/** Puzzle-id-based games PDF, with optional large_print / southpaw flags. */
export function buildGamesUrl(puzzleId: number, version: CrosswordVersion): string {
  const params = new URLSearchParams();
  if (version === "big") params.set("large_print", "true");
  if (version === "southpaw") params.set("southpaw", "true");
  const qs = params.toString();
  return `${NYT_BASE}/v2/puzzle/${puzzleId}.pdf${qs ? `?${qs}` : ""}`;
}

/** puzzles.json lookup to resolve a daily puzzle id by date. */
export function buildPuzzleLookupUrl(date: Date): string {
  const iso = formatIsoDate(date);
  const params = new URLSearchParams({
    publish_type: "daily",
    date_start: iso,
    date_end: iso,
  });
  return `${NYT_BASE}/v3/puzzles.json?${params.toString()}`;
}

function nytFetch(url: string, cookie: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Cookie: cookie,
      "User-Agent": "Mozilla/5.0 (compatible; DailyScribe/0.1)",
      Accept: "application/pdf,application/json;q=0.9,*/*;q=0.8",
    },
  });
}

async function resolvePuzzleId(date: Date, cookie: string): Promise<number> {
  const res = await nytFetch(buildPuzzleLookupUrl(date), cookie);
  if (!res.ok) {
    throw new Error(`NYT puzzle lookup failed (${res.status} ${res.statusText})`);
  }
  const data = (await res.json()) as { results?: Array<{ puzzle_id?: number }> };
  const puzzleId = data.results?.[0]?.puzzle_id;
  if (typeof puzzleId !== "number") {
    throw new Error(`No NYT puzzle found for ${formatIsoDate(date)}`);
  }
  return puzzleId;
}

interface NytConfig {
  version: CrosswordVersion;
}

function parseConfig(config: unknown): NytConfig {
  const version = (config as { version?: string } | null)?.version;
  if (version === "games" || version === "newspaper" || version === "big" || version === "southpaw") {
    return { version };
  }
  return { version: "games" };
}

/**
 * Fetch the user's NYT crossword PDF. The newspaper layout is date-addressed; the
 * games/big/southpaw layouts need a puzzle id resolved via puzzles.json first.
 * Auth is the user's own NYT-S session cookie (decrypted, per-tenant).
 */
export const nytCrosswordPlugin: ServicePlugin = {
  id: "nyt-crossword",
  async run(ctx: RunContext): Promise<Asset[]> {
    const { version } = parseConfig(ctx.config);
    const cookie = ctx.secrets.nyt;
    if (!cookie || !cookie.includes("NYT-S")) {
      throw new Error("Missing or invalid NYT cookie (no NYT-S token). Re-authentication needed.");
    }

    const url =
      version === "newspaper"
        ? buildNewspaperUrl(ctx.date)
        : buildGamesUrl(await resolvePuzzleId(ctx.date, cookie), version);

    const res = await nytFetch(url, cookie);
    if (!res.ok) {
      throw new Error(`NYT fetch failed (${res.status} ${res.statusText}) for ${url}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("pdf")) {
      throw new Error(`Expected a PDF but got "${contentType}". NYT cookie may be expired.`);
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    return [
      {
        filename: `nyt-crossword-${formatIsoDate(ctx.date)}-${version}.pdf`,
        contentType: "application/pdf",
        bytes,
      },
    ];
  },
};
