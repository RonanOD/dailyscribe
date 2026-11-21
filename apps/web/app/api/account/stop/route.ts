import { stopAllDeliveries } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { cleanLeaveReasons } from "@/lib/leave-reasons";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

/** "Stop all deliveries": switch every service off at once, with optional feedback (DAI-34). */
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { reason?: unknown; reasons?: unknown };
  const feedback = { reason: body.reason, reasons: cleanLeaveReasons(body.reasons) };
  const stopped = await stopAllDeliveries(userId, feedback, new Date());
  return NextResponse.json({ ok: true, stopped });
}
