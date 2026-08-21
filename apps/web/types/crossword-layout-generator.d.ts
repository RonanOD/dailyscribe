declare module "crossword-layout-generator" {
  export interface CrosswordWordInput {
    clue?: string;
    answer: string;
  }

  export interface CrosswordPlacement {
    clue: string;
    answer: string;
    /** 1-indexed column of the word's start cell — subtract 1 to index into `table`. */
    startx: number;
    /** 1-indexed row of the word's start cell — subtract 1 to index into `table`. */
    starty: number;
    /** The clue number shown in the grid and clue list. */
    position: number;
    /** "none" means this word didn't fit and was dropped from the layout. */
    orientation: "across" | "down" | "none";
  }

  export interface CrosswordLayout {
    rows: number;
    cols: number;
    /** 0-indexed rows x cols grid; "-" marks a blocked/black cell, otherwise the letter. */
    table: string[][];
    table_string: string;
    result: CrosswordPlacement[];
  }

  export function generateLayout(words: CrosswordWordInput[]): CrosswordLayout;
}
