import { GoogleGenAI, Type, createPartFromBase64, type Schema } from "@google/genai";
import type { DndCharacterSheetInput, DndConfidence } from "./dnd/types";

const CONFIDENCES: DndConfidence[] = ["high", "medium", "low"];

/**
 * Two Gemini vision reads for the DnD mail-back loop, ported from the old
 * repo's `dnd/process_vision.py` — but not its mechanism. The old repo sent
 * Gemini the whole page for every reply; here, only the *rare* path
 * (character creation/restart, at most twice per campaign) still does a
 * whole-page read. The *frequent* path (every ordinary move) uses
 * deterministic checkbox detection (see apps/web/lib/dnd/mark-reader.ts) and
 * sends Gemini only small per-field crops — see `readMoveFields` below and
 * the Milestone 3 cost decision in the project plan.
 */

// ---------------------------------------------------------------------------
// Move fields: several small crops in one call, one result per field.
// ---------------------------------------------------------------------------

export interface DndMoveFieldOcrInput {
  id: string;
  label: string;
  valueType: "number" | "word";
  /** A small PNG crop of just this field's box (plus a little padding). */
  imageBytes: Buffer;
}

export interface DndMoveFieldOcrResult {
  id: string;
  /** Exactly what's written, or null if blank/illegible. Numeric coercion
   *  happens at the call site, which knows each field's expected shape. */
  value: string | null;
  confidence: DndConfidence;
}

const MOVE_FIELD_SYSTEM_INSTRUCTION =
  "You are a data-extraction layer reading small cropped regions of a handwritten tabletop RPG " +
  "move sheet on a Kindle Scribe. Each crop is labeled with a field id and what it expects. Read " +
  "ONLY what is physically written in that crop — do not infer, guess, or fill in a value that " +
  "isn't actually written, and do not use game context to correct it. If a crop is blank or " +
  "illegible, report a null value and lower your confidence. Report exactly what you see.";

const MOVE_FIELD_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      description: "One result per field crop, in the same order given in the prompt, using each field's exact id.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "The field id this result is for, copied exactly." },
          value: {
            type: Type.STRING,
            nullable: true,
            description: "Exactly what is written in the crop, or null if blank/illegible.",
          },
          confidence: { type: Type.STRING, enum: CONFIDENCES },
        },
        required: ["id", "confidence"],
      },
    },
  },
  required: ["results"],
};

function describeExpectation(valueType: "number" | "word"): string {
  return valueType === "number"
    ? "a short handwritten integer (typically 1-30)"
    : "a short handwritten word (a compass or relative direction, e.g. north, down, back)";
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```\s*$/, "")
    .trim();
}

/** Reconciles Gemini's JSON against the known field ids: an id it omitted
 *  defaults to a null/low-confidence result; an id it invented is dropped —
 *  same reconciliation pattern as kanji-check.ts's parseKanjiCheckResponse. */
export function parseMoveFieldOcrResponse(rawText: string, expectedIds: string[]): DndMoveFieldOcrResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(rawText));
  } catch {
    throw new Error(`Gemini DnD move-field response was not valid JSON: ${rawText.slice(0, 200)}`);
  }

  const results =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { results?: unknown }).results)
      ? ((parsed as { results: unknown[] }).results as unknown[])
      : null;
  if (!results) {
    throw new Error(`Gemini DnD move-field response missing "results" array: ${rawText.slice(0, 200)}`);
  }

  const byId = new Map<string, { value: string | null; confidence: DndConfidence }>();
  for (const entry of results) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as { id?: unknown }).id;
    const value = (entry as { value?: unknown }).value;
    const confidence = (entry as { confidence?: unknown }).confidence;
    if (typeof id !== "string") continue;
    if (typeof confidence !== "string" || !CONFIDENCES.includes(confidence as DndConfidence)) continue;
    byId.set(id, { value: typeof value === "string" ? value : null, confidence: confidence as DndConfidence });
  }

  return expectedIds.map((id) => ({ id, ...(byId.get(id) ?? { value: null, confidence: "low" as DndConfidence }) }));
}

export interface DndMoveFieldOcrClient {
  readFields(inputs: DndMoveFieldOcrInput[]): Promise<DndMoveFieldOcrResult[]>;
}

// ---------------------------------------------------------------------------
// Character creation/restart sheet: one whole-page read (rare — at most
// twice per campaign), ported closely from process_vision.py's CHAR_PROMPT.
// ---------------------------------------------------------------------------

const CHARACTER_SYSTEM_INSTRUCTION =
  "You are reading a hand-filled tabletop RPG character sheet. Extract ONLY what is written or " +
  "ticked. Ability scores are integers, typically 3-18. Exactly one class checkbox should be " +
  "ticked. Report exactly what you see; if a field is blank or unreadable, use null and lower " +
  "your confidence.";

const CHARACTER_PROMPT =
  'Read this character sheet. Respond with JSON only, matching this shape:\n{\n  "name": <the ' +
  'hero name written on the Name line, or null>,\n  "class": "fighter"|"rogue"|"barbarian"|null ' +
  "(which ONE class box is ticked),\n" +
  '  "scores": {"strength": <int>, "dexterity": <int>, "constitution": <int>, "intelligence": ' +
  '<int>, "wisdom": <int>, "charisma": <int>} (the number written in each labelled ability box; ' +
  'null if blank),\n  "confidence": "high"|"medium"|"low"\n}';

const CHARACTER_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, nullable: true },
    class: { type: Type.STRING, enum: ["fighter", "rogue", "barbarian"], nullable: true },
    scores: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        strength: { type: Type.INTEGER, nullable: true },
        dexterity: { type: Type.INTEGER, nullable: true },
        constitution: { type: Type.INTEGER, nullable: true },
        intelligence: { type: Type.INTEGER, nullable: true },
        wisdom: { type: Type.INTEGER, nullable: true },
        charisma: { type: Type.INTEGER, nullable: true },
      },
    },
    confidence: { type: Type.STRING, enum: CONFIDENCES },
  },
  required: ["confidence"],
};

export function parseCharacterSheetResponse(rawText: string): DndCharacterSheetInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(rawText));
  } catch {
    throw new Error(`Gemini DnD character-sheet response was not valid JSON: ${rawText.slice(0, 200)}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Gemini DnD character-sheet response was not a JSON object: ${rawText.slice(0, 200)}`);
  }
  const obj = parsed as Record<string, unknown>;
  const rawScores = obj.scores && typeof obj.scores === "object" ? (obj.scores as Record<string, unknown>) : {};
  const scores: DndCharacterSheetInput["scores"] = {};
  for (const key of ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const) {
    const v = rawScores[key];
    scores[key] = typeof v === "number" ? v : null;
  }
  const confidence = typeof obj.confidence === "string" && CONFIDENCES.includes(obj.confidence as DndConfidence) ? (obj.confidence as DndConfidence) : "low";
  return {
    name: typeof obj.name === "string" ? obj.name : null,
    class: typeof obj.class === "string" ? obj.class : null,
    scores,
    confidence,
  };
}

export interface DndCharacterSheetOcrClient {
  read(input: { pdfBytes: Buffer; contentType: string }): Promise<DndCharacterSheetInput>;
}

export interface GeminiDndVisionConfig {
  apiKey: string;
  model?: string;
}

const DEFAULT_MODEL = "gemini-2.5-pro"; // old repo found flash-tier models misread handwritten digits — see dnd/process_vision.py.

/** Thin wrapper around GoogleGenAI for both DnD reads — not unit-tested,
 *  same as createGeminiKanjiCheckClient / createResendDeliverer. */
export function createDndMoveFieldOcrClient(config: GeminiDndVisionConfig): DndMoveFieldOcrClient {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const model = config.model ?? DEFAULT_MODEL;
  return {
    async readFields(inputs) {
      if (inputs.length === 0) return [];
      const parts = inputs.flatMap((input) => [
        `Field "${input.id}" (${input.label}): expects ${describeExpectation(input.valueType)}.`,
        createPartFromBase64(input.imageBytes.toString("base64"), "image/png"),
      ]);
      const response = await ai.models.generateContent({
        model,
        contents: [
          ...parts,
          "Respond with one result per field above, in the same order, using each field's exact id.",
        ],
        config: {
          systemInstruction: MOVE_FIELD_SYSTEM_INSTRUCTION,
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: MOVE_FIELD_RESPONSE_SCHEMA,
          abortSignal: AbortSignal.timeout(20_000),
        },
      });
      return parseMoveFieldOcrResponse(
        response.text ?? "",
        inputs.map((i) => i.id),
      );
    },
  };
}

export function createDndCharacterSheetOcrClient(config: GeminiDndVisionConfig): DndCharacterSheetOcrClient {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const model = config.model ?? DEFAULT_MODEL;
  return {
    async read({ pdfBytes, contentType }) {
      const response = await ai.models.generateContent({
        model,
        contents: [CHARACTER_PROMPT, createPartFromBase64(pdfBytes.toString("base64"), contentType)],
        config: {
          systemInstruction: CHARACTER_SYSTEM_INSTRUCTION,
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: CHARACTER_RESPONSE_SCHEMA,
          abortSignal: AbortSignal.timeout(20_000),
        },
      });
      return parseCharacterSheetResponse(response.text ?? "");
    },
  };
}
