import { collections } from "@dailyscribe/core";

/** Resend's free-tier daily send cap (all email from the shared sender counts
 *  against this: invites, magic links, and daily editions alike). */
export const RESEND_FREE_DAILY_LIMIT = 100;

/**
 * Rough per-call Gemini cost estimates — NOT metered truth. No token count is
 * stored anywhere (KanjiSubmission/DndSubmission just log that a call
 * happened), so these are ballpark figures from assumed image/token sizes at
 * current pricing (gemini-flash-lite-latest ~$0.10/$0.40 per M input/output
 * tokens; gemini-2.5-pro ~$1.25/$10.00 per M, <200k context). Revisit if
 * pricing or the prompt/image sizes in kanji-check.ts / dnd-vision.ts change.
 */
export const GEMINI_COST_PER_CALL = {
  /** One full-page image read on flash-lite. */
  kanji: 0.0003,
  /** ~8 small field crops in one batched call on 2.5-pro. */
  dndMove: 0.006,
  /** One whole-page read on 2.5-pro — rare (character creation/restart only). */
  dndCharacter: 0.0035,
};

/** Vercel Hobby plan's documented free-tier caps (vercel.com/docs/plans/hobby,
 *  checked 2026-09-26) — static reference numbers, not queried live unless
 *  getVercelUsage() succeeds. */
export const VERCEL_HOBBY_CAPS = {
  functionInvocations: { limit: 1_000_000, unit: "invocations", periodLabel: "/ month" },
  activeCpuHours: { limit: 4, unit: "CPU-hours", periodLabel: "/ month" },
  fastDataTransferGb: { limit: 100, unit: "GB", periodLabel: "/ month" },
  edgeRequests: { limit: 1_000_000, unit: "requests", periodLabel: "/ month" },
};

export interface DailyCount {
  date: string; // YYYY-MM-DD (UTC)
  count: number;
}

/** Today plus the (days - 1) days before it, oldest first, as YYYY-MM-DD (UTC). */
function isoDateRange(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Email volume against Resend's cap. Deliberately reads `deliveryEvents`
 * (Resend's own webhook log), not the `deliveries` collection — `deliveries`
 * only covers digest/service dispatch and would silently miss invite emails
 * (scripts/approve-waitlist.mjs) and Auth.js magic-link sign-ins, both of
 * which count against Resend's real daily cap.
 */
export async function getDailyEmailCounts(days = 30): Promise<DailyCount[]> {
  const { deliveryEvents } = await collections();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await deliveryEvents
    .aggregate<{ _id: string; count: number }>([
      { $match: { type: "email.delivered", createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
    ])
    .toArray();
  const byDate = new Map(rows.map((r) => [r._id, r.count]));
  return isoDateRange(days).map((date) => ({ date, count: byDate.get(date) ?? 0 }));
}

export interface DailyGeminiCost {
  date: string;
  kanjiCalls: number;
  dndMoveCalls: number;
  dndCharacterCalls: number;
  estimatedCost: number;
}

export async function getDailyGeminiCostEstimate(days = 30): Promise<DailyGeminiCost[]> {
  const { kanjiSubmissions, dndSubmissions } = await collections();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [kanjiRows, dndRows] = await Promise.all([
    kanjiSubmissions
      .aggregate<{ _id: string; count: number }>([
        { $match: { receivedAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$receivedAt" } }, count: { $sum: 1 } } },
      ])
      .toArray(),
    dndSubmissions
      .aggregate<{ _id: { date: string; shape: string }; count: number }>([
        { $match: { receivedAt: { $gte: since } } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$receivedAt" } },
              shape: "$expectedShapeAtReceipt",
            },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]);

  const kanjiByDate = new Map(kanjiRows.map((r) => [r._id, r.count]));
  const dndMoveByDate = new Map<string, number>();
  const dndCharacterByDate = new Map<string, number>();
  for (const row of dndRows) {
    const target = row._id.shape === "character" ? dndCharacterByDate : dndMoveByDate;
    target.set(row._id.date, (target.get(row._id.date) ?? 0) + row.count);
  }

  return isoDateRange(days).map((date) => {
    const kanjiCalls = kanjiByDate.get(date) ?? 0;
    const dndMoveCalls = dndMoveByDate.get(date) ?? 0;
    const dndCharacterCalls = dndCharacterByDate.get(date) ?? 0;
    const estimatedCost =
      kanjiCalls * GEMINI_COST_PER_CALL.kanji +
      dndMoveCalls * GEMINI_COST_PER_CALL.dndMove +
      dndCharacterCalls * GEMINI_COST_PER_CALL.dndCharacter;
    return { date, kanjiCalls, dndMoveCalls, dndCharacterCalls, estimatedCost };
  });
}

/** Sums the Gemini estimate from the 1st of the current UTC month through today. */
export async function getMonthToDateGeminiCost(): Promise<number> {
  const daysElapsed = new Date().getUTCDate(); // e.g. the 26th -> last 26 days incl. today
  const daily = await getDailyGeminiCostEstimate(daysElapsed);
  return daily.reduce((sum, d) => sum + d.estimatedCost, 0);
}

export interface VercelDailyUsage {
  date: string;
  functionInvocations: number;
  activeCpuHours: number;
}

export type VercelUsageResult = { ok: true; days: VercelDailyUsage[] } | { ok: false; reason: string };

/** Distinguishes "token missing" (tell the operator to set one) from "token
 *  present but the call still failed" (telling them to set it again would be
 *  useless noise — e.g. Hobby-plan teams get 404 "Plan not found" here since
 *  there's no metered billing plan to report charges against). */
export const VERCEL_TOKEN_MISSING_REASON = "VERCEL_API_TOKEN not set.";

/**
 * Live Vercel usage via a personal access token (VERCEL_API_TOKEN) — the MCP
 * OAuth connection 403s on this Hobby account even for basic project reads,
 * so this calls Vercel's FOCUS-format billing API directly instead. Degrades
 * to `{ ok: false }` on any failure (missing token, non-2xx, parse error) so
 * the page can fall back to showing only the static Hobby caps rather than
 * crashing.
 *
 * NOTE: Vercel's docs don't publish the exact `ServiceName` strings used for
 * each metered resource — the substring matches below are a best guess and
 * should be checked against a real response once a token is in place, then
 * adjusted if they don't match.
 */
export async function getVercelUsage(days = 30): Promise<VercelUsageResult> {
  const token = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID ?? "team_l0UcMYdzQmCB7o8RcV6yuUUl";
  if (!token) return { ok: false, reason: VERCEL_TOKEN_MISSING_REASON };

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    const url = new URL("https://api.vercel.com/v1/billing/charges");
    url.searchParams.set("teamId", teamId);
    url.searchParams.set("from", from.toISOString());
    url.searchParams.set("to", to.toISOString());

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      // Confirmed 2026-09-26: Hobby-plan teams get 404 "Plan not found" here —
      // there's no metered billing plan to report charges against, so this
      // API is simply unavailable on Hobby, not a token/scope problem.
      const body = await res.text().catch(() => "");
      const apiMessage = (() => {
        try {
          return (JSON.parse(body) as { error?: { message?: string } })?.error?.message;
        } catch {
          return undefined;
        }
      })();
      return { ok: false, reason: apiMessage ? `${res.status} ${apiMessage}` : `Vercel billing API returned ${res.status}.` };
    }

    const text = await res.text();
    const byDate = new Map<string, { functionInvocations: number; activeCpuHours: number }>();
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let charge: Record<string, unknown>;
      try {
        charge = JSON.parse(line);
      } catch {
        continue;
      }
      const date = String(charge.ChargePeriodStart ?? "").slice(0, 10);
      if (!date) continue;
      const serviceName = String(charge.ServiceName ?? "").toLowerCase();
      const quantity = Number(charge.ConsumedQuantity ?? 0);
      const entry = byDate.get(date) ?? { functionInvocations: 0, activeCpuHours: 0 };
      if (serviceName.includes("function invocation")) entry.functionInvocations += quantity;
      else if (serviceName.includes("active cpu")) entry.activeCpuHours += quantity;
      byDate.set(date, entry);
    }

    const daysArr = isoDateRange(days).map((date) => ({
      date,
      functionInvocations: byDate.get(date)?.functionInvocations ?? 0,
      activeCpuHours: byDate.get(date)?.activeCpuHours ?? 0,
    }));
    return { ok: true, days: daysArr };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
