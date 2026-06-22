import { collections } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { runSubscription } from "@/lib/runner";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

/** On-demand "send test now" for the signed-in user's subscription. */
export async function POST() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subscriptions } = await collections();
  const sub = await subscriptions.findOne({ userId, service: "nyt-crossword" });
  if (!sub) {
    return NextResponse.json({ error: "Save your settings before sending a test." }, { status: 400 });
  }

  const result = await runSubscription(sub, new Date(), { force: true });
  return NextResponse.json({ result }, { status: result.status === "failed" ? 500 : 200 });
}
