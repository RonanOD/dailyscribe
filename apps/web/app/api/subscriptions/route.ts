import {
  collections,
  type BbcNewsConfig,
  type CbcNewsConfig,
  type CrosswordServiceConfig,
  type CrosswordVersion,
  type DigestConfig,
  type HaSummaryConfig,
  type KanjiServiceConfig,
  type NytCrosswordConfig,
  type RteNewsConfig,
  type ServiceId,
  type SubscriptionConfig,
} from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { ALL_BBC_FEEDS } from "@/lib/bbc-feeds";
import { ALL_CBC_FEEDS } from "@/lib/cbc-feeds";
import { ALL_RTE_FEEDS } from "@/lib/rte-feeds";

export const runtime = "nodejs";

const SERVICES: ServiceId[] = ["nyt-crossword", "cbc", "bbc", "rte", "ha-summary", "kanji", "crossword", "digest"];
const JLPT_LEVELS = [1, 2, 3, 4, 5] as const;
const VERSIONS: CrosswordVersion[] = ["games", "newspaper", "big", "southpaw"];
const CBC_FEED_KEYS = new Set(ALL_CBC_FEEDS.map((f) => f.key));
const BBC_FEED_KEYS = new Set(ALL_BBC_FEEDS.map((f) => f.key));
const RTE_FEED_KEYS = new Set(ALL_RTE_FEEDS.map((f) => f.key));

function parseService(value: unknown): ServiceId | null {
  return SERVICES.includes(value as ServiceId) ? (value as ServiceId) : null;
}

export async function GET(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = parseService(new URL(req.url).searchParams.get("service")) ?? "cbc";
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
    weatherEntity?: string;
    wasteCalendar?: string;
    kanjiPerDay?: unknown;
    maxJlptLevel?: unknown;
    theme?: string;
    deliveryTime?: string;
    timezone?: string;
    kindleEmail?: string;
    enabled?: boolean;
  };

  const service = parseService(body.service) ?? "cbc";

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
  } else if (service === "bbc") {
    const requested = Array.isArray(body.feeds)
      ? body.feeds.filter((k): k is string => typeof k === "string" && BBC_FEED_KEYS.has(k))
      : [];
    const maxPerFeed =
      typeof body.maxPerFeed === "number" ? Math.min(Math.max(Math.floor(body.maxPerFeed), 1), 15) : 9;
    config = { ...base, feeds: requested, maxPerFeed } satisfies BbcNewsConfig;
  } else if (service === "rte") {
    const requested = Array.isArray(body.feeds)
      ? body.feeds.filter((k): k is string => typeof k === "string" && RTE_FEED_KEYS.has(k))
      : [];
    const maxPerFeed =
      typeof body.maxPerFeed === "number" ? Math.min(Math.max(Math.floor(body.maxPerFeed), 1), 15) : 9;
    config = { ...base, feeds: requested, maxPerFeed } satisfies RteNewsConfig;
  } else if (service === "ha-summary") {
    config = {
      ...base,
      weatherEntity: (body.weatherEntity || "weather.forecast_home").trim(),
      wasteCalendar: (body.wasteCalendar || "calendar.halifax_ns").trim(),
    } satisfies HaSummaryConfig;
  } else if (service === "kanji") {
    const kanjiPerDay =
      typeof body.kanjiPerDay === "number" ? Math.min(Math.max(Math.floor(body.kanjiPerDay), 1), 10) : 3;
    const levelNum = typeof body.maxJlptLevel === "number" ? Math.floor(body.maxJlptLevel) : 5;
    const maxJlptLevel = (JLPT_LEVELS as readonly number[]).includes(levelNum)
      ? (levelNum as 1 | 2 | 3 | 4 | 5)
      : 5;
    config = { ...base, kanjiPerDay, maxJlptLevel } satisfies KanjiServiceConfig;
  } else if (service === "crossword") {
    const theme = typeof body.theme === "string" ? body.theme.trim().slice(0, 80) : "";
    config = { ...base, theme } satisfies CrosswordServiceConfig;
  } else if (service === "digest") {
    config = { ...base } satisfies DigestConfig;
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
