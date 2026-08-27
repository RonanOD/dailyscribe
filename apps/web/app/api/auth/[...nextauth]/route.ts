import type { NextRequest } from "next/server";
import { handlers } from "@/auth";

export const runtime = "nodejs";

const { GET: originalGet, POST: originalPost } = handlers;

// TEMP DIAGNOSTIC — remove after debugging the pkceCodeVerifier InvalidCheck error.
function logCookieNames(label: string, req: NextRequest) {
  const raw = req.headers.get("cookie") ?? "";
  const names = raw
    .split(";")
    .map((c) => c.split("=")[0]?.trim())
    .filter(Boolean);
  console.log(`[auth-diag] ${label} ${req.url} cookies=${JSON.stringify(names)}`);
}

export async function GET(req: NextRequest) {
  logCookieNames("GET", req);
  return originalGet(req);
}

export async function POST(req: NextRequest) {
  logCookieNames("POST", req);
  return originalPost(req);
}
