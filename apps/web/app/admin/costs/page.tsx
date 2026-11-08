import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/session";
import {
  RESEND_PLAN,
  resendMonthlyCost,
  getMonthToDateEmailCount,
  VERCEL_HOBBY_CAPS,
  VERCEL_TOKEN_MISSING_REASON,
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

  const [emailCounts, monthToDateEmails, geminiDaily, monthToDateGemini, vercelUsage] = await Promise.all([
    getDailyEmailCounts(WINDOW_DAYS),
    getMonthToDateEmailCount(),
    getDailyGeminiCostEstimate(WINDOW_DAYS),
    getMonthToDateGeminiCost(),
    getVercelUsage(WINDOW_DAYS),
  ]);

  const today = emailCounts[emailCounts.length - 1];
  const peakDay = emailCounts.reduce((max, d) => (d.count > max.count ? d : max), emailCounts[0]);
  // Straight-line the month so far to a full month, to see the quota coming.
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const projectedEmails = Math.round((monthToDateEmails / now.getUTCDate()) * daysInMonth);
  const resendCost = resendMonthlyCost(monthToDateEmails);
  const monthToDateTotal = monthToDateGemini + resendCost; // Vercel is $0 while under its Hobby caps.

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
        stored anywhere. Resend is the flat {RESEND_PLAN.name} fee (${RESEND_PLAN.monthlyUsd}/month) plus any
        overage; Vercel is $0 while under its Hobby caps below.
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-value">{formatUsd(monthToDateTotal)}</span>
          <span className="stat-label">Est. total, month-to-date (Resend {formatUsd(resendCost)})</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {monthToDateEmails.toLocaleString()} / {RESEND_PLAN.monthlyEmails.toLocaleString()}
          </span>
          <span className="stat-label">
            Emails this month vs. Resend quota (on pace for {projectedEmails.toLocaleString()})
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {today?.count ?? 0} / {peakDay?.count ?? 0}
          </span>
          <span className="stat-label">Emails today / peak day, last {WINDOW_DAYS}d</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{vercelUsage.ok ? "live" : "static caps"}</span>
          <span className="stat-label">Vercel usage source</span>
        </div>
      </div>

      <section className="section">
        <h2>Resend — emails/day</h2>
        <p className="hint">
          From Resend&apos;s own delivery webhook (editions, magic links, nudges and announcements all
          count). {RESEND_PLAN.name} has no daily cap, only the{" "}
          {RESEND_PLAN.monthlyEmails.toLocaleString()}/month quota above. Past it, overage is $
          {RESEND_PLAN.overageUsdPer1000.toFixed(2)} per 1,000 if pay-as-you-go is on.
        </p>
        <DailyBarChart
          data={emailCounts.map((d) => ({ date: d.date, value: d.count }))}
          ariaLabel="Emails delivered per day"
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
            Live usage unavailable ({vercelUsage.reason})
            {vercelUsage.reason === VERCEL_TOKEN_MISSING_REASON ? (
              <>
                {" "}
                — set <code>VERCEL_API_TOKEN</code> (a personal access token from Vercel account
                settings) to enable this chart.
              </>
            ) : (
              " — this looks like a Hobby-plan limitation, not a configuration problem."
            )}{" "}
            Showing documented Hobby free-tier caps instead:
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
