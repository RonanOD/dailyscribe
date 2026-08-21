import { GoogleGenAI, Type, type Schema } from "@google/genai";

const DEFAULT_MODEL = "gemini-flash-lite-latest";
/** Over-provisioned: the grid-layout algorithm won't fit every candidate word,
 *  so asking for more than a 15x15 grid needs gives it room to pick a good set. */
const CANDIDATE_WORD_COUNT = 80;

const SYSTEM_INSTRUCTION = `You write word+clue pairs for a full-size (15x15-ish) crossword
puzzle that a reader fills in by hand. Answers must be single English words or short
compound words with NO spaces, hyphens, or punctuation, using only the letters A-Z, between
3 and 12 letters long. Clues should be concise, accurate, and in the style of a newspaper
crossword clue (a definition, wordplay, or fill-in-the-blank) — never contain the answer word
itself or an obvious substring of it. Vary the answers' lengths so a grid-layout algorithm has
a good mix of short and long words to interlock. Do not repeat answers.`;

export interface CrosswordWordClue {
  answer: string;
  clue: string;
}

export interface CrosswordWordBatch {
  theme: string;
  words: CrosswordWordClue[];
}

function buildPrompt(theme: string): string {
  const themeLine = theme
    ? `Theme: "${theme}". Every word should relate to this theme where reasonably possible.`
    : "Pick a fresh, fun theme yourself (e.g. a topic, category, or wordplay conceit) and name it.";
  return `${themeLine}\n\nGenerate ${CANDIDATE_WORD_COUNT} distinct word+clue pairs for today's crossword.`;
}

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    theme: { type: Type.STRING, description: "A short (2-5 word) name for this puzzle's theme." },
    words: {
      type: Type.ARRAY,
      description: `Exactly ${CANDIDATE_WORD_COUNT} distinct word+clue pairs.`,
      items: {
        type: Type.OBJECT,
        properties: {
          answer: {
            type: Type.STRING,
            description: "A single word, letters A-Z only, no spaces/punctuation, 3-12 letters.",
          },
          clue: { type: Type.STRING, description: "A concise crossword-style clue; must not contain the answer." },
        },
        required: ["answer", "clue"],
      },
    },
  },
  required: ["theme", "words"],
};

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const withoutOpenFence = trimmed.replace(/^```[a-zA-Z]*\n?/, "");
  return withoutOpenFence.replace(/```\s*$/, "").trim();
}

/** Parses and sanitizes Gemini's response: uppercases answers, strips anything but
 *  A-Z, drops out-of-range lengths, and dedupes by answer text. */
export function parseCrosswordWordResponse(rawText: string): CrosswordWordBatch {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(rawText));
  } catch {
    throw new Error(`Gemini crossword-word response was not valid JSON: ${rawText.slice(0, 200)}`);
  }

  const obj = parsed as { theme?: unknown; words?: unknown };
  const theme = typeof obj.theme === "string" && obj.theme.trim() ? obj.theme.trim() : "Crossword";
  const rawWords = Array.isArray(obj.words) ? obj.words : [];

  const seen = new Set<string>();
  const words: CrosswordWordClue[] = [];
  for (const entry of rawWords) {
    if (!entry || typeof entry !== "object") continue;
    const answerRaw = (entry as { answer?: unknown }).answer;
    const clueRaw = (entry as { clue?: unknown }).clue;
    if (typeof answerRaw !== "string" || typeof clueRaw !== "string") continue;
    const answer = answerRaw.toUpperCase().replace(/[^A-Z]/g, "");
    const clue = clueRaw.trim();
    if (answer.length < 3 || answer.length > 12 || !clue) continue;
    if (seen.has(answer)) continue;
    seen.add(answer);
    words.push({ answer, clue });
  }

  return { theme, words };
}

export interface CrosswordWordClient {
  generate(theme: string): Promise<CrosswordWordBatch>;
}

export interface GeminiCrosswordConfig {
  apiKey: string;
  /** Defaults to "gemini-flash-lite-latest" — Google's self-updating alias for
   *  the current cheapest/fastest Flash-Lite model. */
  model?: string;
}

/** Thin wrapper around GoogleGenAI — not unit-tested, same as createGeminiKanjiCheckClient. */
export function createGeminiCrosswordClient(config: GeminiCrosswordConfig): CrosswordWordClient {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const model = config.model ?? DEFAULT_MODEL;
  return {
    async generate(theme) {
      const response = await ai.models.generateContent({
        model,
        contents: [buildPrompt(theme)],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.9,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          abortSignal: AbortSignal.timeout(30_000),
        },
      });
      return parseCrosswordWordResponse(response.text ?? "");
    },
  };
}
