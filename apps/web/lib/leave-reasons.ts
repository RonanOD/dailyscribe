/**
 * One-tap answers to "what didn't work?" when a user stops all deliveries or
 * deletes their account. Framework-free so the client form, the API routes and
 * the admin report share one list. Ids are stored in `accountFeedback.reasons`,
 * so keep them stable: relabel freely, but don't rename or reuse an id.
 */
export const LEAVE_REASONS = [
  { id: "too-much", label: "Too much to read" },
  { id: "not-arriving", label: "Editions didn't show up on my device" },
  { id: "hard-to-read", label: "Hard to read on my screen" },
  { id: "not-expected", label: "Not what I expected" },
  { id: "wrong-time", label: "Wrong time of day" },
  { id: "taking-break", label: "Taking a break" },
  { id: "just-trying", label: "Just trying it out" },
  { id: "other", label: "Something else" },
] as const;

export type LeaveReasonId = (typeof LEAVE_REASONS)[number]["id"];

const KNOWN = new Map<string, string>(LEAVE_REASONS.map((r) => [r.id, r.label]));

/** Known reason ids from an untrusted request body, deduplicated, in list order. */
export function cleanLeaveReasons(input: unknown): LeaveReasonId[] {
  if (!Array.isArray(input)) return [];
  const picked = new Set(input.filter((x): x is string => typeof x === "string" && KNOWN.has(x)));
  return LEAVE_REASONS.map((r) => r.id).filter((id) => picked.has(id));
}

/** Label for a stored id; an id dropped from the list shows as itself. */
export function leaveReasonLabel(id: string): string {
  return KNOWN.get(id) ?? id;
}
