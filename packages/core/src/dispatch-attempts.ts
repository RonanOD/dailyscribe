import { collections } from "./db";
import type { DispatchAttempt, ServiceId } from "./types";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Scheduled attempts per subscription per local day before giving up. */
export const MAX_DISPATCH_ATTEMPTS = 4;
/** Wait before attempt 2, 3, 4. Dispatch ticks every 10 min, so these are minimums. */
export const RETRY_DELAYS_MS = [10 * MINUTE_MS, 30 * MINUTE_MS, 2 * 60 * MINUTE_MS];
/** How long a claim blocks other runs. Comfortably above the dispatch route's
 *  60s maxDuration, so a run killed mid-send is retried on a later tick
 *  (its attempt still counts, so a send that always times out still gives up). */
export const CLAIM_LOCK_MS = 5 * MINUTE_MS;
/** A user hears about a failing service at most once per this window, so a
 *  setting that stays broken doesn't turn into a daily email. */
export const USER_ALERT_COOLDOWN_MS = 7 * DAY_MS;
/** Consecutive days of give-ups after which the subscription is paused
 *  (`enabled: false` + `disabledReason`), so a setting nobody fixes stops
 *  being attempted, and reported, every day. */
export const PAUSE_AFTER_GAVE_UP_DAYS = 7;

export interface AttemptKey {
  userId: string;
  service: ServiceId;
  puzzleDate: string;
}

/**
 * Failures no retry can fix: they need the user to change a setting. These give
 * up on the first attempt instead of burning the day's retries (and, for Home
 * Assistant, hitting the user's server on every tick).
 */
export function isPermanentFailure(error: string): boolean {
  return (
    /HTTP 40[13]\b/.test(error) ||
    /not configured/i.test(error) ||
    /^Digest has /.test(error) ||
    /^Unknown service/.test(error)
  );
}

/** Delay before the next attempt, after `attempts` have been made (1-based). */
export function retryDelayMs(attempts: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1];
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

/**
 * Claim today's dispatch for one subscription. Atomic across overlapping runs
 * (Cloudflare Worker, GitHub Actions, Vercel Cron): the unique index on the key
 * means exactly one caller gets the document back. Returns null when the day is
 * already done, given up, waiting out a retry delay, or locked by another run.
 */
export async function claimDispatchAttempt(key: AttemptKey, now: Date): Promise<DispatchAttempt | null> {
  const { dispatchAttempts } = await collections();
  try {
    return await dispatchAttempts.findOneAndUpdate(
      {
        ...key,
        status: "pending",
        attempts: { $lt: MAX_DISPATCH_ATTEMPTS },
        nextAttemptAt: { $lte: now },
        lockedUntil: { $lte: now },
      },
      {
        $inc: { attempts: 1 },
        $set: { lockedUntil: new Date(now.getTime() + CLAIM_LOCK_MS), updatedAt: now },
        $setOnInsert: { nextAttemptAt: now, createdAt: now },
      },
      { upsert: true, returnDocument: "after" },
    );
  } catch (err) {
    // The day's document exists but didn't match: someone else holds it, or it's finished.
    if (isDuplicateKey(err)) return null;
    throw err;
  }
}

export async function recordDispatchSuccess(key: AttemptKey, now: Date): Promise<void> {
  const { dispatchAttempts } = await collections();
  await dispatchAttempts.updateOne(key, {
    $set: { status: "success", lockedUntil: now, updatedAt: now },
    $unset: { lastError: "" },
  });
}

/**
 * Record a failed attempt and schedule the next one, or give up for the day.
 * Returns true when this call gave up, so the caller notifies exactly once.
 */
export async function recordDispatchFailure(
  attempt: DispatchAttempt,
  error: string,
  now: Date,
): Promise<{ gaveUp: boolean }> {
  const { dispatchAttempts } = await collections();
  const key = { userId: attempt.userId, service: attempt.service, puzzleDate: attempt.puzzleDate };
  const gaveUp = attempt.attempts >= MAX_DISPATCH_ATTEMPTS || isPermanentFailure(error);
  const delay = retryDelayMs(attempt.attempts);
  await dispatchAttempts.updateOne(key, {
    $set: gaveUp
      ? { status: "gave-up", lastError: error, lockedUntil: now, updatedAt: now }
      : { lastError: error, nextAttemptAt: new Date(now.getTime() + delay), lockedUntil: now, updatedAt: now },
  });
  return { gaveUp };
}

/**
 * Stamp `userNotifiedAt` on today's attempt if this user hasn't been told about
 * this service within the cooldown. Returns true when the caller should send.
 */
export async function claimUserAlert(
  key: AttemptKey,
  now: Date,
  opts: { ignoreCooldown?: boolean } = {},
): Promise<boolean> {
  const { dispatchAttempts } = await collections();
  if (!opts.ignoreCooldown) {
    const recent = await dispatchAttempts.findOne({
      userId: key.userId,
      service: key.service,
      userNotifiedAt: { $gte: new Date(now.getTime() - USER_ALERT_COOLDOWN_MS) },
    });
    if (recent) return false;
  }
  const res = await dispatchAttempts.updateOne(
    { ...key, userNotifiedAt: { $exists: false } },
    { $set: { userNotifiedAt: now } },
  );
  return res.modifiedCount === 1;
}

/** Release a user-alert claim whose email failed to send, so a later run can retry it. */
export async function releaseUserAlert(key: AttemptKey): Promise<void> {
  const { dispatchAttempts } = await collections();
  await dispatchAttempts.updateOne(key, { $unset: { userNotifiedAt: "" } });
}

function isFailedAttempt(row: Pick<DispatchAttempt, "status" | "attempts">): boolean {
  return row.status === "gave-up" || (row.status === "pending" && row.attempts >= MAX_DISPATCH_ATTEMPTS);
}

/**
 * How many days in a row (most recent first) this subscription's scheduled
 * send has failed. Counts only days created after `since`, the last auto-pause,
 * so re-enabling a paused subscription starts a fresh count. Days with no row
 * (dispatch didn't run) neither break nor extend the streak. `asOf` (a
 * puzzleDate) counts back from that day instead of the latest.
 */
export async function failureStreak(
  userId: string,
  service: ServiceId,
  since?: Date,
  asOf?: string,
): Promise<number> {
  const { dispatchAttempts } = await collections();
  const rows = await dispatchAttempts
    .find(
      {
        userId,
        service,
        ...(since ? { createdAt: { $gt: since } } : {}),
        ...(asOf ? { puzzleDate: { $lte: asOf } } : {}),
      },
      { projection: { status: 1, attempts: 1 } },
    )
    .sort({ puzzleDate: -1 })
    .limit(60)
    .toArray();
  let streak = 0;
  for (const row of rows) {
    if (!isFailedAttempt(row)) break;
    streak++;
  }
  return streak;
}

/** Flag the day's row as the one that paused the subscription, for the admin report. */
export async function markAttemptPaused(key: AttemptKey): Promise<void> {
  const { dispatchAttempts } = await collections();
  await dispatchAttempts.updateOne(key, { $set: { paused: true } });
}

/** Attempts that gave up (or exhausted their tries) since `since`, for the admin report. */
export async function findFailedDispatches(since: Date): Promise<DispatchAttempt[]> {
  const { dispatchAttempts } = await collections();
  return dispatchAttempts
    .find({
      updatedAt: { $gte: since },
      $or: [{ status: "gave-up" }, { status: "pending", attempts: { $gte: MAX_DISPATCH_ATTEMPTS } }],
    })
    .sort({ updatedAt: 1 })
    .toArray();
}

const APP_URL = "https://my.dailyscribe.ca";

/** One line telling the user what to do about a failure, for the common cases. */
export function failureHint(error: string): string {
  if (/^Digest has no configured\/enabled member/.test(error)) {
    return "Your digest is switched on, but none of the services it bundles are. Turn on at least one service (news, a crossword, kanji...) in your dashboard and it'll go out again.";
  }
  if (/Home Assistant/.test(error) && /HTTP 40[13]\b/.test(error)) {
    return "Home Assistant rejected the access token we have for you. It may have been revoked or expired. Create a new Long-Lived Access Token in Home Assistant and paste it into your dashboard.";
  }
  if (/not configured/i.test(error)) {
    return "A setting this service needs is missing. Fill it in on your dashboard.";
  }
  return "This may sort itself out by tomorrow. If it keeps happening, reply to this email and I'll look into it.";
}

export interface DeliveryFailureEmail {
  subject: string;
  text: string;
}

export function deliveryFailureEmail(
  label: string,
  puzzleDate: string,
  error: string,
  opts: { pausedAfterDays?: number } = {},
): DeliveryFailureEmail {
  if (opts.pausedAfterDays) {
    return {
      subject: `Your ${label} is paused`,
      text: [
        "Hi,",
        "",
        `Daily Scribe hasn't been able to deliver your ${label} for ${opts.pausedAfterDays} days in a row, so I've paused it.`,
        "",
        failureHint(error),
        "",
        "Once that's fixed, switch it back on from your dashboard and it'll start arriving again.",
        "",
        `Dashboard: ${APP_URL}/dashboard`,
        "",
        `What went wrong: ${error}`,
        "",
        "Ronan",
        "Daily Scribe",
      ].join("\n"),
    };
  }
  return {
    subject: `Your ${label} didn't go out today`,
    text: [
      "Hi,",
      "",
      `Daily Scribe couldn't deliver your ${label} for ${puzzleDate}.`,
      "",
      failureHint(error),
      "",
      `Dashboard: ${APP_URL}/dashboard`,
      "",
      `What went wrong: ${error}`,
      "",
      `You won't get another email about this for a week. If it's still failing after ${PAUSE_AFTER_GAVE_UP_DAYS} days, I'll pause it, and you can switch it back on from your dashboard.`,
      "",
      "Ronan",
      "Daily Scribe",
    ].join("\n"),
  };
}

/** The dashboard banner (`subscriptions.disabledReason`) for an auto-paused subscription. */
export function pausedReason(label: string, days: number, error: string): string {
  return `Delivery paused: your ${label} failed ${days} days in a row (${error}). Fix the setting, then switch it back on.`;
}
