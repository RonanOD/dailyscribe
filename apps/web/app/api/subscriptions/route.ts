import { collections, type CrosswordVersion } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

const VERSIONS: CrosswordVersion[] = ["games", "newspaper", "big", "southpaw"];

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subscriptions } = await collections();
  const subscription = await subscriptions.findOne({ userId, service: "nyt-crossword" });
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
    version?: string;
    deliveryTime?: string;
    timezone?: string;
    kindleEmail?: string;
    enabled?: boolean;
  };

  const version = VERSIONS.includes(body.version as CrosswordVersion)
    ? (body.version as CrosswordVersion)
    : "games";
  const deliveryTime = /^\d{2}:\d{2}$/.test(body.deliveryTime ?? "")
    ? (body.deliveryTime as string)
    : "08:00";
  const timezone = (body.timezone || "America/Toronto").trim();
  const kindleEmail = (body.kindleEmail ?? "").trim();
  if (!kindleEmail.includes("@")) {
    return NextResponse.json({ error: "A valid Kindle email is required" }, { status: 400 });
  }

  const { subscriptions } = await collections();
  await subscriptions.updateOne(
    { userId, service: "nyt-crossword" },
    {
      $set: {
        config: { version, deliveryTime, timezone, kindleEmail },
        enabled: body.enabled ?? true,
      },
      $setOnInsert: { userId, service: "nyt-crossword", createdAt: new Date() },
    },
    { upsert: true },
  );
  return NextResponse.json({ ok: true });
}
