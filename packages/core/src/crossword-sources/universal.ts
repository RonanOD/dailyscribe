import type { CrosswordClue } from "../types";
import { formatIsoDate } from "../plugins/nyt-crossword";

/**
 * Universal Crossword's public data feed — the same one Universal's own free
 * embeddable widget uses on newspaper sites. No login, no obfuscation: a
 * plain JSON payload at a date-addressed URL. Unlike the NYT plugin, this
 * isn't a personal-subscription credential — it's a shared public syndication
 * feed, so this relies on an undocumented endpoint with no explicit license
 * for third-party redistribution. Accepted, deliberate risk (see the plan
 * this shipped under) — not a personal-use automation like NYT's cookie.
 */
const UNIVERSAL_FEED_BASE =
  "https://gamedata.services.amuniversal.com/c/uucom/l/U2FsdGVkX18YuMv20%2B8cekf85%2Friz1H%2FzlWW4bn0cizt8yclLsp7UYv34S77X0aX%0Axa513fPTc5RoN2wa0h4ED9QWuBURjkqWgHEZey0WFL8%3D/g/fcx/d/";

export function buildUniversalDataUrl(date: Date): string {
  return `${UNIVERSAL_FEED_BASE}${formatIsoDate(date)}/data.json`;
}

/** Raw shape of the feed's JSON payload — field names as Universal sends them. */
export interface UniversalRawPuzzle {
  Title?: string;
  Author?: string;
  Editor?: string;
  Copyright?: string;
  Width: number | string;
  Height: number | string;
  /** Flat, row-major solution string; `"-"` marks a blocked/black cell. */
  AllAnswer: string;
  /** Newline-separated `"number|clue text"` entries. */
  AcrossClue: string;
  DownClue: string;
}

function isUniversalRawPuzzle(data: unknown): data is UniversalRawPuzzle {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.AllAnswer === "string" &&
    typeof d.AcrossClue === "string" &&
    typeof d.DownClue === "string" &&
    (typeof d.Width === "number" || typeof d.Width === "string") &&
    (typeof d.Height === "number" || typeof d.Height === "string")
  );
}

export async function fetchUniversalPuzzleRaw(date: Date): Promise<UniversalRawPuzzle> {
  const url = buildUniversalDataUrl(date);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DailyScribe/0.1)",
      Accept: "application/json,*/*;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`Universal Crossword fetch failed (${res.status} ${res.statusText}) for ${formatIsoDate(date)}`);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Universal Crossword returned non-JSON data for ${formatIsoDate(date)}`);
  }
  if (!isUniversalRawPuzzle(data)) {
    throw new Error(`Universal Crossword response missing expected fields for ${formatIsoDate(date)}`);
  }
  return data;
}

export interface ParsedCrosswordPuzzle {
  title: string;
  author: string;
  copyright: string;
  rows: number;
  cols: number;
  /** rows x cols; null = blocked/black cell, otherwise the solution letter. */
  grid: (string | null)[][];
  clues: CrosswordClue[];
}

function decodeField(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

/** `AllAnswer` is a flat row-major string; reshape into a 2D grid, `"-"` -> blocked. */
function reshapeGrid(allAnswer: string, rows: number, cols: number): (string | null)[][] {
  if (allAnswer.length !== rows * cols) {
    throw new Error(`Universal Crossword AllAnswer length (${allAnswer.length}) doesn't match ${rows}x${cols}.`);
  }
  const grid: (string | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: (string | null)[] = [];
    for (let c = 0; c < cols; c++) {
      const ch = allAnswer[r * cols + c];
      row.push(ch === "-" ? null : ch);
    }
    grid.push(row);
  }
  return grid;
}

interface NumberedCell {
  number: number;
  row: number;
  col: number;
  startsAcross: boolean;
  startsDown: boolean;
}

/**
 * The feed gives clue text with a clue number but no cell position, so we
 * derive standard crossword numbering ourselves from the completed grid: walk
 * row-major, a cell starts an across/down entry if it's unblocked with a
 * blocked (or edge) neighbor on that side and an unblocked one past it: any
 * cell starting either gets the next sequential number. This is the same
 * numbering every crossword grid follows, not anything specific to Universal.
 */
function numberGrid(grid: (string | null)[][]): NumberedCell[] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const blocked = (r: number, c: number) => r < 0 || r >= rows || c < 0 || c >= cols || grid[r][c] === null;

  const cells: NumberedCell[] = [];
  let counter = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (blocked(r, c)) continue;
      const startsAcross = blocked(r, c - 1) && !blocked(r, c + 1);
      const startsDown = blocked(r - 1, c) && !blocked(r + 1, c);
      if (startsAcross || startsDown) {
        cells.push({ number: counter, row: r, col: c, startsAcross, startsDown });
        counter++;
      }
    }
  }
  return cells;
}

function entryLength(grid: (string | null)[][], row: number, col: number, orientation: "across" | "down"): number {
  let length = 0;
  let r = row;
  let c = col;
  while (r < grid.length && c < (grid[0]?.length ?? 0) && grid[r][c] !== null) {
    length++;
    if (orientation === "across") c++;
    else r++;
  }
  return length;
}

function parseClueLines(block: string): { number: number; clue: string }[] {
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.indexOf("|");
      if (sep === -1) throw new Error(`Universal Crossword clue line missing "|": ${line}`);
      const number = Number(line.slice(0, sep));
      if (!Number.isFinite(number)) throw new Error(`Universal Crossword clue line has a bad number: ${line}`);
      return { number, clue: decodeField(line.slice(sep + 1)) };
    })
    .sort((a, b) => a.number - b.number);
}

/**
 * Reshape the raw feed payload into our own puzzle shape, deriving cell
 * positions the feed doesn't provide. Fails loudly (rather than delivering a
 * broken puzzle) if the grid's derived clue count doesn't match the feed's
 * clue list, or numbering doesn't line up — either would mean our numbering
 * derivation disagrees with Universal's own, which should never happen for a
 * well-formed puzzle.
 */
export function parseUniversalPuzzle(raw: UniversalRawPuzzle): ParsedCrosswordPuzzle {
  const rows = Number(raw.Height);
  const cols = Number(raw.Width);
  if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows <= 0 || cols <= 0) {
    throw new Error("Universal Crossword response has invalid grid dimensions.");
  }
  const grid = reshapeGrid(raw.AllAnswer, rows, cols);
  const acrossClueLines = parseClueLines(raw.AcrossClue);
  const downClueLines = parseClueLines(raw.DownClue);

  const numbered = numberGrid(grid);
  const acrossStarts = numbered.filter((c) => c.startsAcross);
  const downStarts = numbered.filter((c) => c.startsDown);

  if (acrossStarts.length !== acrossClueLines.length || downStarts.length !== downClueLines.length) {
    throw new Error(
      `Universal Crossword grid/clue count mismatch (across: ${acrossStarts.length} cells vs ` +
        `${acrossClueLines.length} clues, down: ${downStarts.length} cells vs ${downClueLines.length} clues).`,
    );
  }

  const buildClues = (
    starts: NumberedCell[],
    clueLines: { number: number; clue: string }[],
    orientation: "across" | "down",
  ): CrosswordClue[] =>
    starts.map((cell, i) => {
      if (cell.number !== clueLines[i].number) {
        throw new Error(`Universal Crossword ${orientation} clue numbering mismatch at index ${i}.`);
      }
      return {
        position: cell.number,
        orientation,
        clue: clueLines[i].clue,
        row: cell.row,
        col: cell.col,
        length: entryLength(grid, cell.row, cell.col, orientation),
      };
    });

  return {
    title: decodeField(raw.Title),
    // The feed's Author field already reads "By Jane Doe" — strip the
    // redundant prefix so callers can compose their own "by {author}".
    author: decodeField(raw.Author).replace(/^by\s+/i, ""),
    copyright: decodeField(raw.Copyright),
    rows,
    cols,
    grid,
    clues: [...buildClues(acrossStarts, acrossClueLines, "across"), ...buildClues(downStarts, downClueLines, "down")],
  };
}
