import type { ObjectId } from "mongodb";
import type { ChessDifficulty } from "./data/chess";
import type { DndCharacter, DndGameState, DndTurnLogEntry } from "./dnd/types";

/** Output of AES-256-GCM encryption, stored verbatim in MongoDB. */
export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

/** Providers a user can store credentials for. Delivery needs none (app-wide Resend).
 *  DnD needs none either — its campaign is self-contained and its vision/OCR
 *  reads use an app-wide key, same as Gemini everywhere else in this app. */
export type SecretProvider = "nyt" | "ha";

/** Per-user encrypted credential. Never store plaintext. */
export interface UserSecret {
  _id?: ObjectId;
  userId: string;
  provider: SecretProvider;
  data: EncryptedPayload;
  updatedAt: Date;
}

/** The Auth.js MongoDB adapter owns the `users` collection and its core fields
 *  (`name`, `email`, `emailVerified`, `image`). These are the extra fields the
 *  app reads or writes on top of it. */
export interface AppUser {
  _id: ObjectId;
  email?: string;
  emailVerified?: Date | null;
  name?: string;
  image?: string;
  /** Attribution slug carried over from the waitlist entry (approve-waitlist.mjs). */
  ref?: string;
  /** Set when the user finishes the /onboarding flow; gates the first-run redirect. */
  onboardedAt?: Date;
  /** When each activation email went out (see onboarding-nudges.ts). Claimed
   *  before sending, so each kind reaches a user at most once. */
  nudges?: Partial<Record<NudgeKind, Date>>;
  /** One-off product announcements already sent (apps/web/scripts/announce.mjs), by key. */
  announcements?: Record<string, Date>;
}

/** Activation emails for users who stalled before their first delivery:
 *  - `reinvite`: one-off resend to invitees who never signed in.
 *  - `inviteReminder`: automatic, a few days after an unused invite.
 *  - `finishSetup`: signed in but never picked a service. */
export type NudgeKind = "reinvite" | "inviteReminder" | "finishSetup";

/** Services in the catalog. */
export type ServiceId =
  | "nyt-crossword"
  | "cbc"
  | "bbc"
  | "rte"
  | "ha-summary"
  | "kanji"
  | "universal-crossword"
  | "dnd"
  | "chess"
  | "feeds"
  | "digest";

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

export interface BbcNewsConfig extends BaseSubscriptionConfig {
  /** BBC feed keys to include; omitted/empty = a curated default set. */
  feeds?: string[];
  /** Max articles per feed (default 9, clamped 1–15). */
  maxPerFeed?: number;
}

export interface RteNewsConfig extends BaseSubscriptionConfig {
  /** RTÉ feed keys to include; omitted/empty = a curated default set. */
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

/** No service-specific fields — Universal Crossword is a fixed daily puzzle,
 *  nothing to steer. Kept as a distinct alias (rather than reusing
 *  BaseSubscriptionConfig directly) for readability at call sites. */
export type UniversalCrosswordConfig = BaseSubscriptionConfig;

/** No service-specific fields — the campaign is a fixed built-in adventure
 *  (packages/core/src/dnd/campaign.ts), nothing to steer from the dashboard yet. */
export type DndServiceConfig = BaseSubscriptionConfig;

/** Chess puzzles: how many a day, and which Lichess rating band they come from. */
export interface ChessServiceConfig extends BaseSubscriptionConfig {
  puzzlesPerDay: number;
  difficulty: ChessDifficulty;
}

/** One feed a user added to "Your Feeds", with the title read from it when added. */
export interface CustomFeed {
  url: string;
  title: string;
}

/** "Your Feeds": any RSS/Atom feeds the user adds (local news, Substack, blogs). */
export interface CustomFeedsConfig extends BaseSubscriptionConfig {
  feeds: CustomFeed[];
  /** Max posts per feed (default 5, clamped 1-15). */
  maxPerFeed: number;
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
  | BbcNewsConfig
  | RteNewsConfig
  | HaSummaryConfig
  | KanjiServiceConfig
  | UniversalCrosswordConfig
  | DndServiceConfig
  | ChessServiceConfig
  | CustomFeedsConfig
  | DigestConfig;

export interface Subscription {
  _id?: ObjectId;
  userId: string;
  service: ServiceId;
  config: SubscriptionConfig;
  enabled: boolean;
  /** Set when the system auto-disabled this row — e.g. a hard bounce or spam
   *  complaint on the Kindle address (see the resend-events webhook). Surfaced
   *  in the dashboard so the user can fix the address and re-enable. */
  disabledReason?: string;
  /** When dispatch last auto-paused this row after days of give-ups. Kept when
   *  the user re-enables, so the failure streak starts fresh from here. */
  pausedAt?: Date;
  createdAt: Date;
}

export type DeliveryEventType = "email.delivered" | "email.bounced" | "email.complained";

/** A Resend delivery-status webhook we've recorded (bounce / complaint /
 *  delivered) for the shared sender. Feeds sender-reputation monitoring and
 *  the auto-disable on hard bounce / complaint. */
export interface DeliveryEvent {
  _id?: ObjectId;
  /** Resend email id — with `type`, the idempotency key. */
  emailId: string;
  type: DeliveryEventType;
  to: string[];
  subject?: string;
  /** Present on bounces. */
  bounce?: { type: string; subType: string; message: string };
  /** Resend's event timestamp. */
  createdAt: Date;
  /** Our receipt time. */
  recordedAt: Date;
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

/** One per subscription per local day: claims the scheduled send so overlapping
 *  dispatch runs can't double-send, and paces retries (see dispatch-attempts.ts).
 *  Forced "send now" deliveries bypass this and only write a `Delivery` row. */
export interface DispatchAttempt {
  _id?: ObjectId;
  userId: string;
  service: ServiceId;
  puzzleDate: string; // YYYY-MM-DD in the subscription's timezone
  status: "pending" | "success" | "gave-up";
  /** Attempts claimed so far, incremented at claim time so a run killed mid-send still counts. */
  attempts: number;
  lastError?: string;
  nextAttemptAt: Date;
  lockedUntil: Date;
  /** When the user was emailed that today's delivery failed (rate-limited per service). */
  userNotifiedAt?: Date;
  /** Set on the day's row when this give-up paused the subscription. */
  paused?: boolean;
  createdAt: Date;
  updatedAt: Date;
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

/** Per-user solo D&D campaign progress — a singleton doc, same shape as
 *  KanjiProgress above. The campaign definition itself
 *  (packages/core/src/dnd/campaign.ts) is fixed and shared; this is purely
 *  per-user state against it. `character` is always populated (a placeholder
 *  hero before the player's first character-creation reply is applied),
 *  matching the old repo's state.initial.json so the renderer never has to
 *  special-case a missing character. */
export interface DndCampaign {
  _id?: ObjectId;
  userId: string;
  /** Random, unguessable local-part used to route inbound mail to this user —
   *  see KanjiProgress.inboundToken for the same rationale. */
  inboundToken: string;
  character: DndCharacter;
  gameState: DndGameState;
  turnLog: DndTurnLogEntry[];
  updatedAt: Date;
}

export type DndSubmissionStatus = "received" | "processed" | "failed";

/** Which reply shape was expected at receipt time — a filled character sheet
 *  (new campaign), an ordinary move, or the "next adventure" page (after a
 *  win or a death: keep the hero or make a new one, and pick an adventure) — snapshotted from
 *  gameState.status so grading doesn't need to re-derive it later. */
export type DndSubmissionShape = "character" | "move" | "next";

/** One inbound email captured for a user's DnD reply — an event log (one row
 *  per email), unlike DndCampaign which is a per-user singleton. Mirrors
 *  KanjiSubmission; `visionResult` is the mail-back read's output (Milestone 3). */
export interface DndSubmission {
  _id?: ObjectId;
  userId: string;
  /** Resend's email_id — idempotency key, since Resend may retry the webhook. */
  resendEmailId: string;
  receivedAt: Date;
  attachmentFilename: string;
  attachmentContentType: string;
  attachmentBytes: Buffer;
  expectedShapeAtReceipt: DndSubmissionShape;
  status: DndSubmissionStatus;
  visionResult?: unknown;
  /** When the transition to "processed"/"failed" happened. */
  processedAt?: Date;
  /** Set only when status === "failed" — the thrown error's message. */
  processingError?: string;
}

export type WaitlistStatus = "pending" | "approved" | "declined";

/** A prospective user who asked for access from the marketing site. Approval
 *  (see apps/web/scripts/approve-waitlist.mjs) seeds their email into the
 *  `users` collection, which is what the auth signIn gate checks. */
export interface WaitlistEntry {
  _id?: ObjectId;
  email: string;
  /** Attribution slug from the marketing CTA, e.g. "reddit-kindlescribe". */
  ref?: string;
  /** Optional free-text the visitor left ("which sections?", device, etc.). */
  note?: string;
  status: WaitlistStatus;
  createdAt: Date;
  approvedAt?: Date;
  /** Set by `approve-waitlist.mjs --decline` for junk / non-genuine signups. */
  declinedAt?: Date;
}

/** One fixed-window counter for the Mongo-backed rate limiter. A TTL index on
 *  `expiresAt` sweeps stale windows. */
/** A user stopping all deliveries or deleting their account, with their
 *  optional "what didn't work?" answer (DAI-34). Delete rows carry no user id
 *  or email. */
export interface AccountFeedback {
  _id?: ObjectId;
  kind: "stop-all" | "delete";
  /** Only on "stop-all"; removed if the user later deletes their account. */
  userId?: string;
  /** Services that were switched on at the time. */
  services: string[];
  reason?: string;
  /** Only on "delete": when the account was created. */
  joinedAt?: Date;
  createdAt: Date;
}

export interface RateLimitBucket {
  _id?: ObjectId;
  /** e.g. "deliver-now:<userId>". */
  key: string;
  windowStart: Date;
  count: number;
  expiresAt: Date;
}

export interface CrosswordClue {
  position: number;
  orientation: "across" | "down";
  clue: string;
  row: number;
  col: number;
  length: number;
}

/** A day's Universal Crossword, fetched once and cached by date — every
 *  subscriber gets the same puzzle on a given day, so this is keyed by date
 *  alone (not per user), and a same-day "Send test now" or cron retry reuses
 *  it instead of re-fetching. `grid` is the solved answer grid — page 1
 *  renders it blank (numbers only), page 2 renders the letters. */
export interface CrosswordPuzzle {
  _id?: ObjectId;
  date: string; // YYYY-MM-DD, matches Delivery.puzzleDate convention
  title: string;
  author: string;
  copyright: string;
  rows: number;
  cols: number;
  /** rows x cols; null = blocked/black cell, otherwise the solution letter. */
  grid: (string | null)[][];
  clues: CrosswordClue[];
  createdAt: Date;
}
