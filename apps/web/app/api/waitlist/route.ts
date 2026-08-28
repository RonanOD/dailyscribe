import { collections, isEmailShaped } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// The form lives on the marketing site (a separate origin / Vercel project), so
// this endpoint has to accept a cross-origin POST from there.
const ALLOWED_ORIGINS = new Set([
  "https://dailyscribe.ca",
  "https://www.dailyscribe.ca",
  "http://localhost:3000",
  "http://localhost:3001",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && (ALLOWED_ORIGINS.has(origin) || origin.endsWith(".vercel.app"))
      ? origin
      : "https://dailyscribe.ca";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const headers = corsHeaders(req.headers.get("origin"));
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    ref?: string;
    note?: string;
    company?: string; // honeypot
  };

  // Bots fill hidden fields; a human never sees this one. Pretend success.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return NextResponse.json({ ok: true }, { headers });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!isEmailShaped(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400, headers });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = await rateLimit(`waitlist:${ip}`, 10, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests — please try again later." }, { status: 429, headers });
  }

  const ref = typeof body.ref === "string" ? body.ref.slice(0, 64) : undefined;
  const note = typeof body.note === "string" ? body.note.slice(0, 500).trim() : "";

  const { waitlist } = await collections();
  await waitlist.updateOne(
    { email },
    {
      $setOnInsert: {
        email,
        status: "pending" as const,
        createdAt: new Date(),
        ...(ref ? { ref } : {}),
      },
      ...(note ? { $set: { note } } : {}),
    },
    { upsert: true },
  );

  // Same 200 whether it's a new signup or a repeat — don't leak list membership.
  return NextResponse.json({ ok: true }, { headers });
}
