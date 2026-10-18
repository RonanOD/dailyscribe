import { stopAllDeliveries } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

/** "Stop all deliveries": switch every service off at once, with an optional reason (DAI-34). */
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
  const stopped = await stopAllDeliveries(userId, body.reason, new Date());
  return NextResponse.json({ ok: true, stopped });
}
