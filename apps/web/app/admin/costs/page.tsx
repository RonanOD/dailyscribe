import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/session";
import {
  RESEND_FREE_DAILY_LIMIT,
  VERCEL_HOBBY_CAPS,
  getDailyEmailCounts,
  getDailyGeminiCostEstimate,
  getMonthToDateGeminiCost,
  getVercelUsage,
} from "@/lib/costs";
import { DailyBarChart } from "../_components/daily-bar-chart";

export const runtime = "nodejs";
// See the identical comment in ../page.tsx — without this, the admin gate
// gets baked in as a static 404 at build time instead of checked per-request.
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

function formatUsd(v: number): string {
  return `$${v.toFixed(v < 0.01 ? 4 : 2)}`;
}

export default async function AdminCostsPage() {
  if (!(await isAdmin())) notFound();

  const [emailCounts, geminiDaily, monthToDateGemini, vercelUsage] = await Promise.all([
    getDailyEmailCounts(WINDOW_DAYS),
    getDailyGeminiCostEstimate(WINDOW_DAYS),
    getMonthToDateGeminiCost(),
    getVercelUsage(WINDOW_DAYS),
  ]);

  const today = emailCounts[emailCounts.length - 1];
  const peakDay = emailCounts.reduce((max, d) => (d.count > max.count ? d : max), emailCounts[0]);
  const monthToDateTotal = monthToDateGemini; // Vercel + Resend are $0 while under their free-tier caps.

  return (
    <main className="admin">
      <header className="topbar">
        <h1>
          <a className="heading-link" href="https://dailyscribe.ca/">
            Daily Scribe
          </a>{" "}
          — Costs
        </h1>
        <div className="who">
          <a href="/admin">Admin</a>
          <a href="/dashboard">Dashboard</a>
        </div>
      </header>

      <p className="hint">
        Gemini figures are estimates from call counts, not metered billing — no token usage is
        stored anywhere. Resend/Vercel are $0 while under their free-tier caps below.
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-value">{formatUsd(monthToDateTotal)}</span>
          <span className="stat-label">Est. total, month-to-date</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {today?.count ?? 0} / {RESEND_FREE_DAILY_LIMIT}
          </span>
          <span className="stat-label">Emails today vs. Resend cap</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{peakDay?.count ?? 0}</span>
          <span className="stat-label">Peak day, last {WINDOW_DAYS}d</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{vercelUsage.ok ? "live" : "static caps"}</span>
          <span className="stat-label">Vercel usage source</span>
        </div>
      </div>

      <section className="section">
        <h2>Resend — emails/day vs. free-tier cap</h2>
        <p className="hint">
          From Resend&apos;s own delivery webhook (invites, magic links, and daily editions all
          count).
        </p>
        <DailyBarChart
          data={emailCounts.map((d) => ({ date: d.date, value: d.count }))}
          capValue={RESEND_FREE_DAILY_LIMIT}
          ariaLabel="Emails delivered per day vs. Resend's 100/day free-tier cap"
        />
      </section>

      <section className="section">
        <h2>Gemini — estimated cost/day</h2>
        <p className="hint">
          Kanji grading (flash-lite) + DnD move/character-sheet reads (2.5-pro) — see{" "}
          <code>apps/web/lib/costs.ts</code> for the per-call assumptions.
        </p>
        <DailyBarChart
          data={geminiDaily.map((d) => ({ date: d.date, value: d.estimatedCost }))}
          formatValue={formatUsd}
          ariaLabel="Estimated Gemini API cost per day"
        />
      </section>

      <section className="section">
        <h2>Vercel — Hobby plan usage</h2>
        {vercelUsage.ok ? (
          <>
            <p className="hint">Function invocations/day vs. the 1M/month Hobby cap.</p>
            <DailyBarChart
              data={vercelUsage.days.map((d) => ({ date: d.date, value: d.functionInvocations }))}
              ariaLabel="Vercel function invocations per day"
            />
          </>
        ) : (
          <p className="hint">
            Live usage unavailable ({vercelUsage.reason}) — set <code>VERCEL_API_TOKEN</code> (a
            personal access token from Vercel account settings) to enable this chart. Showing
            documented Hobby free-tier caps instead:
          </p>
        )}
        <ul className="hint">
          <li>
            Function invocations: {VERCEL_HOBBY_CAPS.functionInvocations.limit.toLocaleString()}{" "}
            {VERCEL_HOBBY_CAPS.functionInvocations.periodLabel}
          </li>
          <li>
            Active CPU: {VERCEL_HOBBY_CAPS.activeCpuHours.limit} {VERCEL_HOBBY_CAPS.activeCpuHours.unit}
            {VERCEL_HOBBY_CAPS.activeCpuHours.periodLabel}
          </li>
          <li>
            Fast data transfer: {VERCEL_HOBBY_CAPS.fastDataTransferGb.limit}{" "}
            {VERCEL_HOBBY_CAPS.fastDataTransferGb.unit}
            {VERCEL_HOBBY_CAPS.fastDataTransferGb.periodLabel}
          </li>
          <li>
            Edge requests: {VERCEL_HOBBY_CAPS.edgeRequests.limit.toLocaleString()}
            {VERCEL_HOBBY_CAPS.edgeRequests.periodLabel}
          </li>
        </ul>
      </section>
    </main>
  );
}
