import { collections, type ServiceId } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { DIGEST_MEMBER_SERVICES } from "@/lib/digest";
import { runSubscription } from "@/lib/runner";
import { rateLimitAll } from "@/lib/rate-limit";
import { requireUserId } from "@/lib/session";

const HOUR = 60 * 60 * 1000;

export const runtime = "nodejs";
export const maxDuration = 60;

const SERVICES: ServiceId[] = [
  "nyt-crossword",
  "cbc",
  "bbc",
  "rte",
  "ha-summary",
  "kanji",
  "universal-crossword",
  "digest",
];

/** On-demand "send test now" for the signed-in user's subscription. */
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // "Send test now" fans out real email from the shared sender — cap it so an
  // authed user can't loop it. Fixed windows: 5/hour and 20/day.
  const limited = await rateLimitAll([
    { key: `deliver-now:${userId}`, limit: 5, windowMs: HOUR },
    { key: `deliver-now-day:${userId}`, limit: 20, windowMs: 24 * HOUR },
  ]);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "You've sent a lot of test emails recently. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limited.resetAt.getTime() - Date.now()) / 1000)) } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { service?: string };
  let service = SERVICES.includes(body.service as ServiceId) ? (body.service as ServiceId) : "cbc";

  const { subscriptions } = await collections();

  // A member service's own "Send test now" would otherwise deliver a
  // standalone PDF on top of the bundled digest the user already gets —
  // if the digest is on, send that instead so there's only ever one email.
  if ((DIGEST_MEMBER_SERVICES as string[]).includes(service)) {
    const digestSub = await subscriptions.findOne({ userId, service: "digest", enabled: true });
    if (digestSub) service = "digest";
  }

  const sub = await subscriptions.findOne({ userId, service });
  if (!sub) {
    return NextResponse.json({ error: "Save your settings before sending a test." }, { status: 400 });
  }

  const result = await runSubscription(sub, new Date(), { force: true });
  if (result.status === "failed") {
    return NextResponse.json({ error: result.error ?? "Delivery failed.", result }, { status: 400 });
  }
  return NextResponse.json({ result }, { status: 200 });
}
