import { collections, type ServiceId } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { runSubscription } from "@/lib/runner";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const SERVICES: ServiceId[] = ["nyt-crossword", "cbc"];

/** On-demand "send test now" for the signed-in user's subscription. */
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { service?: string };
  const service = SERVICES.includes(body.service as ServiceId)
    ? (body.service as ServiceId)
    : "cbc";

  const { subscriptions } = await collections();
  const sub = await subscriptions.findOne({ userId, service });
  if (!sub) {
    return NextResponse.json({ error: "Save your settings before sending a test." }, { status: 400 });
  }

  const result = await runSubscription(sub, new Date(), { force: true });
  return NextResponse.json({ result }, { status: result.status === "failed" ? 500 : 200 });
}
