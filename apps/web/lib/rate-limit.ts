import { collections } from "@dailyscribe/core";

export interface RateLimitResult {
  ok: boolean;
  /** Count after this hit. */
  count: number;
  limit: number;
  /** When the current window resets. */
  resetAt: Date;
}

/**
 * Fixed-window rate limit backed by MongoDB — no in-memory state, so it holds
 * across serverless invocations. Each call counts as one hit against
 * `key` for the current `windowMs` bucket; `ok` is false once the bucket
 * exceeds `limit`.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const { rateLimits } = await collections();
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const resetAt = new Date(windowStart.getTime() + windowMs);

  const doc = await rateLimits.findOneAndUpdate(
    { key, windowStart },
    { $inc: { count: 1 }, $setOnInsert: { key, windowStart, expiresAt: resetAt } },
    { upsert: true, returnDocument: "after" },
  );

  const count = doc?.count ?? 1;
  return { ok: count <= limit, count, limit, resetAt };
}

/** Check several limits at once (e.g. per-hour and per-day); every one is hit. */
export async function rateLimitAll(
  checks: { key: string; limit: number; windowMs: number }[],
): Promise<RateLimitResult> {
  const results = await Promise.all(checks.map((c) => rateLimit(c.key, c.limit, c.windowMs)));
  const blocked = results.find((r) => !r.ok);
  return blocked ?? results[0];
}
