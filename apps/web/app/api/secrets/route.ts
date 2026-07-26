import { collections, decryptSecret, encryptSecret } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

/** Report which credentials the user has stored (booleans + non-sensitive metadata like haUrl). */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userSecrets } = await collections();
  const docs = await userSecrets.find({ userId }).toArray();
  
  const haDoc = docs.find((d) => d.provider === "ha");
  let haUrl: string | undefined = undefined;
  if (haDoc) {
    try {
      const parsed = JSON.parse(decryptSecret(haDoc.data)) as { url?: string };
      haUrl = parsed.url;
    } catch {
      // Ignore parsing errors
    }
  }

  const configured = {
    nyt: docs.some((d) => d.provider === "nyt"),
    ha: Boolean(haDoc),
  };
  return NextResponse.json({ configured, haUrl });
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
    let url = typeof val.url === "string" ? val.url.trim() : "";
    let token = typeof val.token === "string" ? val.token.trim() : "";

    const { userSecrets } = await collections();
    const existingDoc = await userSecrets.findOne({ userId, provider: "ha" });

    if (!token && existingDoc) {
      try {
        const parsed = JSON.parse(decryptSecret(existingDoc.data)) as { url?: string; token?: string };
        token = parsed.token ?? "";
        if (!url) url = parsed.url ?? "";
      } catch {
        // Ignore
      }
    }

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
