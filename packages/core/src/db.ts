import { MongoClient, type Db } from "mongodb";
import type {
  AccountFeedback,
  AppUser,
  CrosswordPuzzle,
  Delivery,
  DeliveryEvent,
  DispatchAttempt,
  DndCampaign,
  DndSubmission,
  KanjiProgress,
  KanjiSubmission,
  RateLimitBucket,
  Subscription,
  UserSecret,
  WaitlistEntry,
} from "./types";

// Cache the client across hot-reloads / serverless invocations.
const globalForMongo = globalThis as unknown as {
  _dailyscribeClient?: Promise<MongoClient>;
};

/**
 * Lazily connect to MongoDB. Safe to reference at import time (e.g. as the Auth.js
 * adapter argument) — it only reads MONGODB_URI and dials when first called.
 */
export function getMongoClientPromise(): Promise<MongoClient> {
  if (!globalForMongo._dailyscribeClient) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not set");
    }
    // Fail fast when Atlas stalls: without these a stuck connection waits until
    // Vercel kills the function at maxDuration, logging only "Task timed out"
    // (a 5-minute run of 504s on /api/cron/dispatch, Oct 2026). With them the
    // request errors with the real cause, well inside the 60s limit.
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
    });
    globalForMongo._dailyscribeClient = client.connect().catch((err) => {
      // Don't cache a failed connect, or a warm instance stays broken after
      // Atlas recovers.
      globalForMongo._dailyscribeClient = undefined;
      throw err;
    });
  }
  return globalForMongo._dailyscribeClient;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClientPromise();
  return client.db(process.env.MONGODB_DB ?? "dailyscribe");
}

/** Typed handles to the application collections. */
export async function collections() {
  const db = await getDb();
  return {
    // Owned by the Auth.js adapter; the app only reads it and sets `onboardedAt`.
    users: db.collection<AppUser>("users"),
    userSecrets: db.collection<UserSecret>("userSecrets"),
    subscriptions: db.collection<Subscription>("subscriptions"),
    deliveries: db.collection<Delivery>("deliveries"),
    dispatchAttempts: db.collection<DispatchAttempt>("dispatchAttempts"),
    kanjiProgress: db.collection<KanjiProgress>("kanjiProgress"),
    kanjiSubmissions: db.collection<KanjiSubmission>("kanjiSubmissions"),
    dndCampaigns: db.collection<DndCampaign>("dndCampaigns"),
    dndSubmissions: db.collection<DndSubmission>("dndSubmissions"),
    crosswordPuzzles: db.collection<CrosswordPuzzle>("crosswordPuzzles"),
    waitlist: db.collection<WaitlistEntry>("waitlist"),
    rateLimits: db.collection<RateLimitBucket>("rateLimits"),
    deliveryEvents: db.collection<DeliveryEvent>("deliveryEvents"),
    accountFeedback: db.collection<AccountFeedback>("accountFeedback"),
  };
}

// Memoise so a request path can call ensureIndexes() freely; a failure clears
// the memo so the next call retries.
let indexesEnsured: Promise<void> | undefined;

/**
 * Create the unique / supporting / TTL indexes the app relies on for
 * idempotency and cleanup. Idempotent — MongoDB ignores a createIndex whose
 * spec already exists. Call once at startup (or lazily from a route).
 */
export function ensureIndexes(): Promise<void> {
  if (!indexesEnsured) {
    indexesEnsured = (async () => {
      const c = await collections();
      await Promise.all([
        c.userSecrets.createIndex({ userId: 1, provider: 1 }, { unique: true }),
        c.subscriptions.createIndex({ userId: 1, service: 1 }, { unique: true }),
        c.deliveries.createIndex({ userId: 1, service: 1, puzzleDate: 1 }),
        c.dispatchAttempts.createIndex({ userId: 1, service: 1, puzzleDate: 1 }, { unique: true }),
        c.dispatchAttempts.createIndex({ updatedAt: 1 }),
        c.dispatchAttempts.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 }),
        c.kanjiSubmissions.createIndex({ resendEmailId: 1 }, { unique: true }),
        c.dndSubmissions.createIndex({ resendEmailId: 1 }, { unique: true }),
        c.waitlist.createIndex({ email: 1 }, { unique: true }),
        c.rateLimits.createIndex({ key: 1, windowStart: 1 }, { unique: true }),
        c.rateLimits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        c.deliveryEvents.createIndex({ emailId: 1, type: 1 }, { unique: true }),
        c.accountFeedback.createIndex({ createdAt: 1 }),
      ]);
    })().catch((err) => {
      indexesEnsured = undefined;
      throw err;
    });
  }
  return indexesEnsured;
}
