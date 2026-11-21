import { ObjectId } from "mongodb";
import { collections, getDb } from "./db";
import type { AccountFeedback } from "./types";

/** Longest "what didn't work?" answer we keep; the rest is cut off. */
export const MAX_FEEDBACK_CHARS = 2000;

export function cleanFeedback(reason: unknown): string | undefined {
  if (typeof reason !== "string") return undefined;
  const trimmed = reason.trim().slice(0, MAX_FEEDBACK_CHARS);
  return trimmed || undefined;
}

/** What a leaving user told us: the one-tap reason ids (already checked
 *  against the app's list) and an optional free-text answer. */
export interface LeaveFeedback {
  reasons?: string[];
  reason?: unknown;
}

/** Only the fields that have a value: the driver stores an undefined field as null. */
function feedbackFields({ reasons, reason }: LeaveFeedback): { reasons?: string[]; reason?: string } {
  const cleaned = cleanFeedback(reason);
  return {
    ...(reasons && reasons.length > 0 ? { reasons } : {}),
    ...(cleaned ? { reason: cleaned } : {}),
  };
}

/**
 * Switch off every service for a user in one go ("Stop all deliveries"). The
 * account and settings stay, so switching a service back on resumes it.
 * Records the optional feedback for the admin report. Returns the services that
 * were on.
 */
export async function stopAllDeliveries(userId: string, feedback: LeaveFeedback, now: Date): Promise<string[]> {
  const { subscriptions, accountFeedback } = await collections();
  const services = (await subscriptions.find({ userId, enabled: true }, { projection: { service: 1 } }).toArray()).map(
    (s) => s.service,
  );
  await subscriptions.updateMany(
    { userId, enabled: true },
    { $set: { enabled: false }, $unset: { disabledReason: "" } },
  );
  await accountFeedback.insertOne({ kind: "stop-all", userId, services, ...feedbackFields(feedback), createdAt: now });
  return services;
}

/**
 * Permanently delete a user and everything keyed to them. The feedback row
 * written first keeps only the feedback, the services they had and when they
 * joined: no user id or email, since they asked to be forgotten.
 */
export async function deleteAccount(userId: string, feedback: LeaveFeedback, now: Date): Promise<void> {
  if (!ObjectId.isValid(userId)) throw new Error("Invalid user id");
  const _id = new ObjectId(userId);
  const db = await getDb();
  const c = await collections();
  const user = await c.users.findOne({ _id });
  if (!user) return;

  const subs = await c.subscriptions.find({ userId }).toArray();
  const kindleEmails = [...new Set(subs.map((s) => s.config.kindleEmail).filter(Boolean))];
  await c.accountFeedback.insertOne({
    kind: "delete",
    services: subs.filter((s) => s.enabled).map((s) => s.service),
    ...feedbackFields(feedback),
    joinedAt: _id.getTimestamp(),
    createdAt: now,
  });

  const byUserId = { userId };
  await Promise.all([
    c.subscriptions.deleteMany(byUserId),
    c.userSecrets.deleteMany(byUserId),
    c.deliveries.deleteMany(byUserId),
    c.dispatchAttempts.deleteMany(byUserId),
    c.kanjiProgress.deleteMany(byUserId),
    c.kanjiSubmissions.deleteMany(byUserId),
    c.dndCampaigns.deleteMany(byUserId),
    c.dndSubmissions.deleteMany(byUserId),
    c.accountFeedback.updateMany(byUserId, { $unset: { userId: "" } }),
    kindleEmails.length > 0 ? c.deliveryEvents.deleteMany({ to: { $in: kindleEmails } }) : null,
    user.email ? c.waitlist.deleteMany({ email: user.email }) : null,
    user.email ? db.collection("verification_tokens").deleteMany({ identifier: user.email }) : null,
    // Auth.js adapter collections key the user by ObjectId.
    db.collection("accounts").deleteMany({ userId: _id }),
  ]);
  // Last, so a failure above leaves a user who can still sign in and retry.
  await db.collection("sessions").deleteMany({ userId: _id });
  await c.users.deleteOne({ _id });
}

/** Stop-all and delete events since `since`, oldest first, for the admin report. */
export async function findAccountFeedback(since: Date): Promise<AccountFeedback[]> {
  const { accountFeedback } = await collections();
  return accountFeedback.find({ createdAt: { $gte: since } }).sort({ createdAt: 1 }).toArray();
}
