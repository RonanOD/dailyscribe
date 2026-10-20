import { isEmailShaped } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { renderWelcomePdf } from "@/lib/plugins/welcome-page";
import { rateLimitAll } from "@/lib/rate-limit";
import { getDeliverer } from "@/lib/runner";
import { requireUserId } from "@/lib/session";

const HOUR = 60 * 60 * 1000;

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Onboarding's Kindle check: email a one-page welcome PDF to the address the
 * user typed, before any subscription exists. Amazon silently drops mail from
 * senders not on the Approved list (Resend still reports it delivered), so the
 * user seeing this page on the device is the only real proof setup worked.
 */
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { kindleEmail?: string };
  const kindleEmail = (body.kindleEmail ?? "").trim();
  if (!isEmailShaped(kindleEmail)) {
    return NextResponse.json({ error: "Enter a valid Send-to-Kindle email first." }, { status: 400 });
  }

  // Looser than deliver-now's 1/day: a retry after fixing the Approved list or a
  // typo is the expected path here. Still capped, since it sends real email to
  // an address the user chose.
  const limited = await rateLimitAll([
    { key: `onboarding-test-hour:${userId}`, limit: 3, windowMs: HOUR },
    { key: `onboarding-test-day:${userId}`, limit: 6, windowMs: 24 * HOUR },
  ]);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "That's a lot of test sends. Give it a little while and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limited.resetAt.getTime() - Date.now()) / 1000)) } },
    );
  }

  try {
    await getDeliverer().deliver({
      to: kindleEmail,
      subject: "Welcome to Daily Scribe",
      // Resend rejects a message with neither text nor html, even with an attachment.
      text: "Your Kindle is connected to Daily Scribe.",
      assets: [await renderWelcomePdf()],
    });
  } catch (e) {
    console.error("[onboarding/test-send]", e);
    return NextResponse.json({ error: "We couldn't send the test page. Please try again." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
