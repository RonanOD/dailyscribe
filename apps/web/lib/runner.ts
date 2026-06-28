import {
  collections,
  createGmailDeliverer,
  decryptSecret,
  getPlugin,
  nytCrosswordPlugin,
  registerPlugin,
  type Subscription,
} from "@dailyscribe/core";
import { cbcNewsPlugin } from "@/lib/plugins/cbc";

// Register the available service plugins once per runtime.
registerPlugin(nytCrosswordPlugin);
registerPlugin(cbcNewsPlugin);

export interface RunResult {
  subscriptionId: string;
  service: string;
  status: "success" | "failed" | "skipped";
  error?: string;
}

interface LocalParts {
  isoDate: string;
  hhmm: string;
  utcMidnight: Date;
}

/** Resolve the local calendar date + HH:MM for a timezone, plus a UTC-midnight Date for that day. */
function localParts(now: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) parts[part.type] = part.value;
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = parts.hour === "24" ? "00" : parts.hour; // normalize midnight
  return {
    isoDate,
    hhmm: `${hour}:${parts.minute}`,
    utcMidnight: new Date(`${isoDate}T00:00:00Z`),
  };
}

/**
 * Run one subscription: skip if already delivered today (unless forced), fetch the
 * service assets, email them to the Kindle, and log the outcome. Never throws —
 * failures are caught and recorded as a "failed" delivery.
 */
export async function runSubscription(
  sub: Subscription,
  now: Date,
  opts: { force?: boolean } = {},
): Promise<RunResult> {
  const { userSecrets, deliveries } = await collections();
  const { isoDate, utcMidnight } = localParts(now, sub.config.timezone);
  const subscriptionId = sub._id?.toString() ?? "unknown";

  if (!opts.force) {
    const already = await deliveries.findOne({
      userId: sub.userId,
      service: sub.service,
      puzzleDate: isoDate,
      status: "success",
    });
    if (already) return { subscriptionId, service: sub.service, status: "skipped" };
  }

  try {
    const plugin = getPlugin(sub.service);
    if (!plugin) throw new Error(`Unknown service: ${sub.service}`);

    const secretDocs = await userSecrets.find({ userId: sub.userId }).toArray();
    const secrets: Record<string, string> = {};
    for (const doc of secretDocs) secrets[doc.provider] = decryptSecret(doc.data);

    if (!secrets.gmail) throw new Error("Gmail delivery credentials are not configured.");
    const gmail = JSON.parse(secrets.gmail) as { user: string; appPassword: string };

    const assets = await plugin.run({
      userId: sub.userId,
      date: utcMidnight,
      config: sub.config,
      secrets,
    });

    await createGmailDeliverer(gmail).deliver({
      to: sub.config.kindleEmail,
      subject: `${plugin.label} — ${isoDate}`,
      text: `Your daily ${plugin.label}, delivered by Daily Scribe.`,
      assets,
    });

    await deliveries.insertOne({
      userId: sub.userId,
      service: sub.service,
      puzzleDate: isoDate,
      status: "success",
      deliveredAt: new Date(),
    });
    return { subscriptionId, service: sub.service, status: "success" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await deliveries.insertOne({
      userId: sub.userId,
      service: sub.service,
      puzzleDate: isoDate,
      status: "failed",
      error,
      deliveredAt: new Date(),
    });
    return { subscriptionId, service: sub.service, status: "failed", error };
  }
}

function isDue(sub: Subscription, now: Date): boolean {
  return localParts(now, sub.config.timezone).hhmm >= sub.config.deliveryTime;
}

/** Run every enabled subscription whose local delivery time has passed today. */
export async function dispatchDue(now: Date): Promise<RunResult[]> {
  const { subscriptions } = await collections();
  const enabled = await subscriptions.find({ enabled: true }).toArray();
  const results: RunResult[] = [];
  for (const sub of enabled) {
    if (isDue(sub, now)) results.push(await runSubscription(sub, now));
  }
  return results;
}
