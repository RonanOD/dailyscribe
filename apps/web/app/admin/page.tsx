import { notFound } from "next/navigation";
import { collections, type Subscription } from "@dailyscribe/core";
import { auth } from "@/auth";
import { getCatalogEntry } from "@/lib/service-catalog";

export const runtime = "nodejs";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Same hue family as --accent (oklch(48% 0.16 25) — see packages/theme/tokens.css).
// The theme is deliberately near-monochrome, so slices step lightness/chroma
// within that one hue (plus a secondary muted-gold step) rather than going
// rainbow. The legend (swatch + label + count + %) carries the meaning, not
// color alone.
const PIE_PALETTE = [
  "oklch(40% 0.15 25)",
  "oklch(50% 0.16 25)",
  "oklch(60% 0.14 25)",
  "oklch(70% 0.11 25)",
  "oklch(45% 0.10 60)",
  "oklch(58% 0.10 60)",
  "oklch(68% 0.08 60)",
];

// "digest" is a real ServiceId (a subscription row a user can enable) but isn't
// in SERVICE_CATALOG — that module only covers the bundleable services shown
// as onboarding/dashboard cards.
function serviceLabel(service: string): string {
  if (service === "digest") return "Digest (bundle)";
  return getCatalogEntry(service)?.label ?? service;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

export default async function AdminPage() {
  const session = await auth();
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!adminEmail || session?.user?.email?.toLowerCase() !== adminEmail) {
    notFound();
  }

  const { users, subscriptions, deliveries, waitlist } = await collections();

  const [allUsers, allSubs, deliveryStats, deliveries7d, pendingWaitlistCount, approvedWaitlist] =
    await Promise.all([
      users.find({}).sort({ email: 1 }).toArray(),
      subscriptions.find({}).toArray(),
      deliveries
        .aggregate<{ _id: string; count: number; last: Date }>([
          { $match: { status: "success" } },
          { $group: { _id: "$userId", count: { $sum: 1 }, last: { $max: "$deliveredAt" } } },
        ])
        .toArray(),
      deliveries.countDocuments({
        status: "success",
        deliveredAt: { $gte: new Date(Date.now() - SEVEN_DAYS_MS) },
      }),
      waitlist.countDocuments({ status: "pending" }),
      waitlist.find({ status: "approved" }).toArray(),
    ]);

  const deliveriesByUser = new Map(deliveryStats.map((d) => [d._id, d]));
  const subsByUser = new Map<string, Subscription[]>();
  for (const sub of allSubs) {
    const list = subsByUser.get(sub.userId) ?? [];
    list.push(sub);
    subsByUser.set(sub.userId, list);
  }
  const waitlistByEmail = new Map(approvedWaitlist.map((w) => [w.email, w]));

  // Popularity + the "active subscriptions" stat card reflect only enabled
  // rows — the users table below shows every row (including ones a user has
  // since turned off, or that got auto-disabled on a bounce).
  const servicePopularity = new Map<string, number>();
  for (const sub of allSubs) {
    if (!sub.enabled) continue;
    servicePopularity.set(sub.service, (servicePopularity.get(sub.service) ?? 0) + 1);
  }
  const pieSlices = [...servicePopularity.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([service, count], i) => ({
      service,
      label: serviceLabel(service),
      count,
      color: PIE_PALETTE[i % PIE_PALETTE.length],
    }));
  const pieTotal = pieSlices.reduce((sum, s) => sum + s.count, 0);
  const activeSubscriptions = allSubs.filter((s) => s.enabled).length;

  // Donut geometry: stacked stroke-dasharray arcs on concentric circles,
  // rotated so the first slice starts at 12 o'clock.
  const R = 64;
  const CX = 80;
  const STROKE = 28;
  const CIRC = 2 * Math.PI * R;
  let cursor = 0;
  const arcs = pieSlices.map((slice) => {
    const length = pieTotal > 0 ? (slice.count / pieTotal) * CIRC : 0;
    const arc = { ...slice, dasharray: `${length} ${CIRC - length}`, dashoffset: -cursor };
    cursor += length;
    return arc;
  });

  return (
    <main className="admin">
      <header className="topbar">
        <h1>
          <a className="heading-link" href="https://dailyscribe.ca/">
            Daily Scribe
          </a>{" "}
          — Admin
        </h1>
        <div className="who">
          <a href="/dashboard">Dashboard</a>
        </div>
      </header>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-value">{allUsers.length}</span>
          <span className="stat-label">Users</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{pendingWaitlistCount}</span>
          <span className="stat-label">Pending waitlist</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{activeSubscriptions}</span>
          <span className="stat-label">Active subscriptions</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{deliveries7d}</span>
          <span className="stat-label">Deliveries (7d)</span>
        </div>
      </div>

      <section className="section">
        <h2>Service popularity</h2>
        <p className="hint">Enabled subscriptions by service, across all users.</p>
        {pieTotal === 0 ? (
          <p className="hint">No active subscriptions yet.</p>
        ) : (
          <div className="pie-wrap">
            <svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="Service popularity">
              <circle cx={CX} cy={CX} r={R} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
              {arcs.map((arc) => (
                <circle
                  key={arc.service}
                  cx={CX}
                  cy={CX}
                  r={R}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={STROKE}
                  strokeDasharray={arc.dasharray}
                  strokeDashoffset={arc.dashoffset}
                  transform={`rotate(-90 ${CX} ${CX})`}
                />
              ))}
            </svg>
            <ul className="pie-legend">
              {pieSlices.map((slice) => (
                <li key={slice.service}>
                  <span className="pie-swatch" style={{ background: slice.color }} />
                  <span className="pie-legend-label">{slice.label}</span>
                  <span className="pie-legend-count">
                    {slice.count} · {Math.round((slice.count / pieTotal) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Users</h2>
        <p className="hint">{allUsers.length} total.</p>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Joined</th>
                <th>Ref</th>
                <th>Services</th>
                <th>Deliveries</th>
                <th>Last delivery</th>
                <th>Onboarded</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((user) => {
                const userId = String(user._id);
                const userSubs = subsByUser.get(userId) ?? [];
                const delivery = deliveriesByUser.get(userId);
                const waitlistEntry = user.email ? waitlistByEmail.get(user.email) : undefined;
                return (
                  <tr key={userId}>
                    <td>{user.email ?? "—"}</td>
                    <td>{formatDate(waitlistEntry?.approvedAt)}</td>
                    <td>{waitlistEntry?.ref ?? user.ref ?? "—"}</td>
                    <td>
                      {userSubs.length === 0 ? (
                        <span className="muted">none</span>
                      ) : (
                        userSubs.map((s) => {
                          const cls = s.disabledReason ? "badge warn" : s.enabled ? "badge on" : "badge";
                          return (
                            <span key={s.service} className={cls} title={s.disabledReason}>
                              {serviceLabel(s.service)}
                            </span>
                          );
                        })
                      )}
                    </td>
                    <td>{delivery?.count ?? 0}</td>
                    <td>{formatDate(delivery?.last)}</td>
                    <td>{user.onboardedAt ? "Yes" : "No"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
