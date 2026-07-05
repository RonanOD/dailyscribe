import { collections, encryptSecret } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

/** Report which credentials the user has stored (booleans only — never values). */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userSecrets } = await collections();
  const docs = await userSecrets.find({ userId }).project({ provider: 1 }).toArray();
  const configured = {
    nyt: docs.some((d) => d.provider === "nyt"),
  };
  return NextResponse.json({ configured });
}

/** Store/replace an encrypted per-user secret. */
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { provider?: string; value?: unknown };
  const provider = body.provider;
  if (provider !== "nyt") {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const cookie = typeof body.value === "string" ? body.value.trim() : "";
  if (!cookie.includes("NYT-S")) {
    return NextResponse.json({ error: "NYT cookie must include the NYT-S token" }, { status: 400 });
  }

  const data = encryptSecret(cookie);
  const { userSecrets } = await collections();
  await userSecrets.updateOne(
    { userId, provider },
    { $set: { userId, provider, data, updatedAt: new Date() } },
    { upsert: true },
  );
  return NextResponse.json({ ok: true });
}
