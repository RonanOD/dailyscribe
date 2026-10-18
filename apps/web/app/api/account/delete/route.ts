import { deleteAccount } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Permanently delete the signed-in user's account and data. The client must
 * send `confirm: "delete"` (the word the user typed) so a stray request can't
 * do it. Deleting the session row signs them out.
 */
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { confirm?: unknown; reason?: unknown };
  if (typeof body.confirm !== "string" || body.confirm.trim().toLowerCase() !== "delete") {
    return NextResponse.json({ error: 'Type "delete" to confirm.' }, { status: 400 });
  }
  await deleteAccount(userId, body.reason, new Date());
  return NextResponse.json({ ok: true });
}
