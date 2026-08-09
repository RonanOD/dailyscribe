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
export type ServiceId = "nyt-crossword" | "cbc" | "ha-summary" | "kanji";

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

/** Per-service config. The runner reads only the shared base fields; each plugin
 *  validates its own service-specific shape from the untyped RunContext.config. */
export type SubscriptionConfig = NytCrosswordConfig | CbcNewsConfig | HaSummaryConfig | KanjiServiceConfig;

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
  updatedAt: Date;
}
