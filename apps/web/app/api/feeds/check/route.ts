import { normalizeFeedUrl } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { pdfSafe, toPlainText } from "@/lib/feed-parse";
import { loadFeed } from "@/lib/plugins/feeds";
import { rateLimitAll } from "@/lib/rate-limit";
import { requireUserId } from "@/lib/session";

const HOUR = 60 * 60 * 1000;

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Check a URL before it's added to Your Feeds: fetch it (or the feed its page
 * links to), and return the feed's own address and title, so a typo is caught
 * now instead of failing every morning. Each check is an outbound fetch to an
 * address the user chose, hence the rate limit.
 */
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await rateLimitAll([
    { key: `feed-check-hour:${userId}`, limit: 30, windowMs: HOUR },
    { key: `feed-check-day:${userId}`, limit: 100, windowMs: 24 * HOUR },
  ]);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many feed checks. Try again later." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { url?: unknown };
  const url = normalizeFeedUrl(body.url);
  if (!url) return NextResponse.json({ error: "That doesn't look like a web address." }, { status: 400 });

  try {
    const { url: feedUrl, feed } = await loadFeed(url);
    const latest = feed.items[0];
    return NextResponse.json({
      url: feedUrl,
      title: pdfSafe(toPlainText(feed.title)) || new URL(feedUrl).hostname,
      latest: latest ? pdfSafe(toPlainText(latest.title)) : null,
      latestDate: latest?.published?.toISOString() ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't read that feed.";
    return NextResponse.json({ error: `Couldn't add that feed. ${message}` }, { status: 400 });
  }
}
