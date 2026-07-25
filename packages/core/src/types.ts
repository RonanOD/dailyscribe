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
export type ServiceId = "nyt-crossword" | "cbc" | "ha-summary";

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

/** Per-service config. The runner reads only the shared base fields; each plugin
 *  validates its own service-specific shape from the untyped RunContext.config. */
export type SubscriptionConfig = NytCrosswordConfig | CbcNewsConfig | HaSummaryConfig;

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
