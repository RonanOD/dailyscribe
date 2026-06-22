import { MongoClient, type Db } from "mongodb";
import type { Delivery, Subscription, UserSecret } from "./types";

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
    globalForMongo._dailyscribeClient = new MongoClient(uri).connect();
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
    userSecrets: db.collection<UserSecret>("userSecrets"),
    subscriptions: db.collection<Subscription>("subscriptions"),
    deliveries: db.collection<Delivery>("deliveries"),
  };
}
