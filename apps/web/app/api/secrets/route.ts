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
    ha: docs.some((d) => d.provider === "ha"),
  };
  return NextResponse.json({ configured });
}

/** Store/replace an encrypted per-user secret. */
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { provider?: string; value?: unknown };
  const provider = body.provider;

  let secretText = "";

  if (provider === "nyt") {
    const cookie = typeof body.value === "string" ? body.value.trim() : "";
    if (!cookie.includes("NYT-S")) {
      return NextResponse.json({ error: "NYT cookie must include the NYT-S token" }, { status: 400 });
    }
    secretText = cookie;
  } else if (provider === "ha") {
    const val = (body.value ?? {}) as { url?: unknown; token?: unknown };
    const url = typeof val.url === "string" ? val.url.trim() : "";
    const token = typeof val.token === "string" ? val.token.trim() : "";
    if (!url || !token) {
      return NextResponse.json({ error: "Home Assistant URL and Access Token are required" }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "Home Assistant URL must start with http:// or https://" }, { status: 400 });
    }
    secretText = JSON.stringify({ url, token });
  } else {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const data = encryptSecret(secretText);
  const { userSecrets } = await collections();
  await userSecrets.updateOne(
    { userId, provider },
    { $set: { userId, provider, data, updatedAt: new Date() } },
    { upsert: true },
  );
  return NextResponse.json({ ok: true });
}
