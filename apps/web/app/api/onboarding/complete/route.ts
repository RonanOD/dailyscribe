import { ObjectId } from "mongodb";
import { collections } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

/** Stamp the user as onboarded so the /dashboard first-run redirect stops
 *  firing. The subscription rows themselves are created via /api/subscriptions
 *  before this is called. */
export async function POST() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ObjectId.isValid(userId)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  const { users } = await collections();
  await users.updateOne({ _id: new ObjectId(userId) }, { $set: { onboardedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
