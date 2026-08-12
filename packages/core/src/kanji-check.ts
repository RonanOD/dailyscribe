import { GoogleGenAI, Type, createPartFromBase64, type Schema } from "@google/genai";
import type { KanjiCharCheckResult, KanjiCharCheckStatus } from "./types";

const DEFAULT_MODEL = "gemini-flash-lite-latest";
const CHECK_STATUSES: KanjiCharCheckStatus[] = ["matched", "unclear", "no_attempt"];

const SYSTEM_INSTRUCTION = `You are checking a Kindle Scribe kanji handwriting practice
page against a fixed list of expected characters, not doing open-ended OCR. You are given a
scanned or photographed page and the exact kanji the learner was asked to practice, listed
below. For EACH expected character, decide: was it attempted anywhere on the page, and if
so, does the handwriting reasonably resemble the target character's structure (rough stroke
shapes/composition — messy or shaky handwriting still counts if the structure is
recognizable; do not grade stroke order or penmanship quality). Ignore any other handwriting
or notes on the page — only judge the characters listed. If no legible attempt exists for a
character, report no_attempt. If it was attempted but you're not confident (illegible, or
looks like a different character), report unclear. Report exactly what you see; do not guess
generously.`;

export interface KanjiCheckTarget {
  char: string;
  meanings: string[];
}

function buildKanjiCheckPrompt(expected: KanjiCheckTarget[]): string {
  const lines = expected.map((e) => `- ${e.char} (${e.meanings.slice(0, 2).join(", ")})`).join("\n");
  return `The learner was asked to practice these ${expected.length} kanji:\n${lines}\n\nFor each one, judge whether it was attempted on this page and whether it reasonably matches. Respond with one result per expected character listed above, in the same order.`;
}

const KANJI_CHECK_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      description: "One result per expected character, in the same order given in the prompt.",
      items: {
        type: Type.OBJECT,
        properties: {
          char: { type: Type.STRING, description: "The expected kanji character this result is for." },
          status: {
            type: Type.STRING,
            enum: CHECK_STATUSES,
            description:
              "matched = clearly attempted and resembles the target; unclear = attempted but ambiguous/illegible/possibly wrong; no_attempt = no legible attempt found.",
          },
        },
        required: ["char", "status"],
      },
    },
  },
  required: ["results"],
};

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const withoutOpenFence = trimmed.replace(/^```[a-zA-Z]*\n?/, "");
  return withoutOpenFence.replace(/```\s*$/, "").trim();
}

/**
 * Parses Gemini's JSON response and reconciles it against expectedChars:
 * chars the model omitted default to "no_attempt"; chars it reported that
 * aren't in expectedChars are dropped — the closed set is authoritative,
 * never the model's own idea of what it saw.
 */
export function parseKanjiCheckResponse(rawText: string, expectedChars: string[]): KanjiCharCheckResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(rawText));
  } catch {
    throw new Error(`Gemini kanji check response was not valid JSON: ${rawText.slice(0, 200)}`);
  }

  const results =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { results?: unknown }).results)
      ? ((parsed as { results: unknown[] }).results as unknown[])
      : null;
  if (!results) {
    throw new Error(`Gemini kanji check response missing "results" array: ${rawText.slice(0, 200)}`);
  }

  const byChar = new Map<string, KanjiCharCheckStatus>();
  for (const entry of results) {
    if (!entry || typeof entry !== "object") continue;
    const char = (entry as { char?: unknown }).char;
    const status = (entry as { status?: unknown }).status;
    if (typeof char !== "string" || typeof status !== "string") continue;
    if (!CHECK_STATUSES.includes(status as KanjiCharCheckStatus)) continue;
    byChar.set(char, status as KanjiCharCheckStatus);
  }

  return expectedChars.map((char) => ({ char, status: byChar.get(char) ?? "no_attempt" }));
}

export interface KanjiCheckClient {
  check(input: { attachmentBytes: Buffer; contentType: string; expected: KanjiCheckTarget[] }): Promise<KanjiCharCheckResult[]>;
}

export interface GeminiKanjiCheckConfig {
  apiKey: string;
  /** Defaults to "gemini-flash-lite-latest" — Google's self-updating alias for
   *  the current cheapest/fastest Flash-Lite model. */
  model?: string;
}

/** Thin wrapper around GoogleGenAI — not unit-tested, same as createResendDeliverer. */
export function createGeminiKanjiCheckClient(config: GeminiKanjiCheckConfig): KanjiCheckClient {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const model = config.model ?? DEFAULT_MODEL;
  return {
    async check({ attachmentBytes, contentType, expected }) {
      const response = await ai.models.generateContent({
        model,
        contents: [
          buildKanjiCheckPrompt(expected),
          createPartFromBase64(attachmentBytes.toString("base64"), contentType),
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: KANJI_CHECK_RESPONSE_SCHEMA,
          abortSignal: AbortSignal.timeout(20_000),
        },
      });
      return parseKanjiCheckResponse(response.text ?? "", expected.map((e) => e.char));
    },
  };
}
