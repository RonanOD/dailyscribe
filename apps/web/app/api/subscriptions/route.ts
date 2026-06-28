import {
  collections,
  type CbcNewsConfig,
  type CrosswordVersion,
  type NytCrosswordConfig,
  type ServiceId,
  type SubscriptionConfig,
} from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { CBC_FEEDS } from "@/lib/cbc-feeds";

export const runtime = "nodejs";

const SERVICES: ServiceId[] = ["nyt-crossword", "cbc"];
const VERSIONS: CrosswordVersion[] = ["games", "newspaper", "big", "southpaw"];
const CBC_FEED_KEYS = new Set(CBC_FEEDS.map((f) => f.key));

function parseService(value: unknown): ServiceId | null {
  return SERVICES.includes(value as ServiceId) ? (value as ServiceId) : null;
}

export async function GET(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = parseService(new URL(req.url).searchParams.get("service")) ?? "nyt-crossword";
  const { subscriptions } = await collections();
  const subscription = await subscriptions.findOne({ userId, service });
  return NextResponse.json({
    subscription: subscription
      ? { config: subscription.config, enabled: subscription.enabled }
      : null,
  });
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    service?: string;
    version?: string;
    feeds?: unknown;
    maxPerFeed?: unknown;
    deliveryTime?: string;
    timezone?: string;
    kindleEmail?: string;
    enabled?: boolean;
  };

  const service = parseService(body.service) ?? "nyt-crossword";

  // Shared scheduling/delivery fields.
  const deliveryTime = /^\d{2}:\d{2}$/.test(body.deliveryTime ?? "")
    ? (body.deliveryTime as string)
    : "08:00";
  const timezone = (body.timezone || "America/Toronto").trim();
  const kindleEmail = (body.kindleEmail ?? "").trim();
  if (!kindleEmail.includes("@")) {
    return NextResponse.json({ error: "A valid Kindle email is required" }, { status: 400 });
  }
  const base = { deliveryTime, timezone, kindleEmail };

  // Service-specific config.
  let config: SubscriptionConfig;
  if (service === "cbc") {
    const requested = Array.isArray(body.feeds)
      ? body.feeds.filter((k): k is string => typeof k === "string" && CBC_FEED_KEYS.has(k))
      : [];
    const maxPerFeed =
      typeof body.maxPerFeed === "number" ? Math.min(Math.max(Math.floor(body.maxPerFeed), 1), 15) : 9;
    config = { ...base, feeds: requested, maxPerFeed } satisfies CbcNewsConfig;
  } else {
    const version = VERSIONS.includes(body.version as CrosswordVersion)
      ? (body.version as CrosswordVersion)
      : "games";
    config = { ...base, version } satisfies NytCrosswordConfig;
  }

  const { subscriptions } = await collections();
  await subscriptions.updateOne(
    { userId, service },
    {
      $set: { config, enabled: body.enabled ?? true },
      $setOnInsert: { userId, service, createdAt: new Date() },
    },
    { upsert: true },
  );
  return NextResponse.json({ ok: true });
}
