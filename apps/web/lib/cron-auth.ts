import { NextResponse } from "next/server";

/**
 * Shared guard for the cron endpoints (`/api/cron/*`). When `CRON_SECRET` is
 * set, the caller — Vercel Cron, or the GitHub Actions workflows in
 * `.github/workflows/` — must present it as a Bearer token; anything else gets
 * a 401. When it's unset the check is skipped so local dev can hit the routes
 * without ceremony.
 *
 * Returns a 401 `NextResponse` to return as-is, or `null` when the request may
 * proceed.
 */
export function cronAuthError(req: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
