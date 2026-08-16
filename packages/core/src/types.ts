import type { ObjectId } from "mongodb";

/** Output of AES-256-GCM encryption, stored verbatim in MongoDB. */
export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

/** Providers a user can store credentials for. Delivery needs none (app-wide Resend). */
export type SecretProvider = "nyt" | "ha";

/** Per-user encrypted credential. Never store plaintext. */
export interface UserSecret {
  _id?: ObjectId;
  userId: string;
  provider: SecretProvider;
  data: EncryptedPayload;
  updatedAt: Date;
}

/** Services in the catalog. */
export type ServiceId = "nyt-crossword" | "cbc" | "ha-summary" | "kanji" | "digest";

/** NYT crossword print layouts (ported from the reference repo's CROSSWORD_VERSION). */
export type CrosswordVersion = "games" | "newspaper" | "big" | "southpaw";

/** Delivery/scheduling fields shared by every service. */
export interface BaseSubscriptionConfig {
  /** Local delivery time "HH:MM" (24h). */
  deliveryTime: string;
  /** IANA timezone, e.g. "America/Toronto". */
  timezone: string;
  /** Destination Kindle "Send to Kindle" email address. */
  kindleEmail: string;
}

export interface NytCrosswordConfig extends BaseSubscriptionConfig {
  version: CrosswordVersion;
}

export interface CbcNewsConfig extends BaseSubscriptionConfig {
  /** CBC feed keys to include; omitted/empty = a curated default set. */
  feeds?: string[];
  /** Max articles per feed (default 9, clamped 1–15). */
  maxPerFeed?: number;
}

export interface HaSummaryConfig extends BaseSubscriptionConfig {
  /** Optional custom weather entity (default: "weather.forecast_home"). */
  weatherEntity?: string;
  /** Optional custom waste calendar entity (default: "calendar.halifax_ns"). */
  wasteCalendar?: string;
}

export interface KanjiServiceConfig extends BaseSubscriptionConfig {
  /** New kanji introduced per day (default 3, clamped 1–10). */
  kanjiPerDay: number;
  /** How far into the JLPT curriculum to draw from (5 = N5 only ... 1 = N5 through N1). */
  maxJlptLevel: 1 | 2 | 3 | 4 | 5;
}

/** A service that can be bundled into a digest — every real service except the digest itself. */
export type BundleableServiceId = Exclude<ServiceId, "digest">;

/** A "digest" bundles all of the user's currently-*enabled* services into one
 *  PDF/email instead of each sending its own — membership is just "is this
 *  service enabled", not a separate list, so there's nothing digest-specific
 *  to configure beyond the same shared schedule every service already uses. */
export type DigestConfig = BaseSubscriptionConfig;

/** Per-service config. The runner reads only the shared base fields; each plugin
 *  validates its own service-specific shape from the untyped RunContext.config. */
export type SubscriptionConfig =
  | NytCrosswordConfig
  | CbcNewsConfig
  | HaSummaryConfig
  | KanjiServiceConfig
  | DigestConfig;

export interface Subscription {
  _id?: ObjectId;
  userId: string;
  service: ServiceId;
  config: SubscriptionConfig;
  enabled: boolean;
  createdAt: Date;
}

export type DeliveryStatus = "success" | "failed";

/** Delivery log row; also provides per-day idempotency. */
export interface Delivery {
  _id?: ObjectId;
  userId: string;
  service: ServiceId;
  puzzleDate: string; // YYYY-MM-DD in the subscription's timezone
  status: DeliveryStatus;
  error?: string;
  deliveredAt: Date;
}

/** Per-user cursor into the Kanji curriculum (packages/core/src/data/kanji.ts).
 *  The curriculum is a fixed ordered array, so "how far along" a user is
 *  is fully captured by an integer offset — no per-item seen-set needed. */
export interface KanjiProgress {
  _id?: ObjectId;
  userId: string;
  cursor: number;
  /** Guards against cursor drift if kanji.ts is regenerated/reordered. */
  datasetVersion: string;
  /** Random, unguessable local-part used to route inbound mail to this user
   *  (e.g. `kanji-<inboundToken>@<inbound domain>`) — not the raw userId, so a
   *  webhook payload claiming to be for a given user can't be forged by anyone
   *  who doesn't already have this token. */
  inboundToken: string;
  /** Char list from the most recently sent batch, snapshotted so a future
   *  vision-check phase knows what was expected without re-deriving it from
   *  cursor math (which depends on config at send time, not read time). */
  lastBatchChars?: string[];
  /** Characters from a graded check-in that came back unclear/no_attempt —
   *  resent on the next send instead of advancing into fresh curriculum,
   *  until a later check-in reports them matched. */
  retryChars?: string[];
  updatedAt: Date;
}

export type KanjiSubmissionStatus = "received" | "processed" | "failed";

export type KanjiCharCheckStatus = "matched" | "unclear" | "no_attempt";

/** Gemini's per-character verdict for one submission, one entry per char in
 *  KanjiSubmission.batchCharsAtReceipt. */
export interface KanjiCharCheckResult {
  char: string;
  status: KanjiCharCheckStatus;
}

/** One inbound email captured for a user's Kanji practice check-in — an event
 *  log (one row per email), unlike KanjiProgress which is a per-user singleton. */
export interface KanjiSubmission {
  _id?: ObjectId;
  userId: string;
  /** Resend's email_id — idempotency key, since Resend may retry the webhook. */
  resendEmailId: string;
  receivedAt: Date;
  attachmentFilename: string;
  attachmentContentType: string;
  attachmentBytes: Buffer;
  /** Copied from KanjiProgress.lastBatchChars at receipt time. */
  batchCharsAtReceipt: string[];
  status: KanjiSubmissionStatus;
  /** Set once status moves past "received". Empty array (not omitted) when
   *  batchCharsAtReceipt was empty — there was nothing to check, not an error. */
  checkResults?: KanjiCharCheckResult[];
  /** When the transition to "processed"/"failed" happened. */
  processedAt?: Date;
  /** Set only when status === "failed" — the thrown error's message. */
  processingError?: string;
}
