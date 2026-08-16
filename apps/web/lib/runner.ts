import {
  collections,
  createResendDeliverer,
  decryptSecret,
  getPlugin,
  mergePdfAssets,
  nytCrosswordPlugin,
  registerPlugin,
  type Asset,
  type Deliverer,
  type Subscription,
} from "@dailyscribe/core";
import { cbcNewsPlugin } from "@/lib/plugins/cbc";
import { haSummaryPlugin } from "@/lib/plugins/ha";
import { kanjiPlugin } from "@/lib/plugins/kanji";
import { DIGEST_MEMBER_SERVICES } from "@/lib/digest";

// Register the available service plugins once per runtime.
registerPlugin(nytCrosswordPlugin);
registerPlugin(cbcNewsPlugin);
registerPlugin(haSummaryPlugin);
registerPlugin(kanjiPlugin);

/**
 * App-wide deliverer: Resend, sending from Daily Scribe's single verified address.
 * Users whitelist my@dailyscribe.ca once; one API key replaces per-user Gmail credentials.
 */
function getDeliverer(): Deliverer {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
  return createResendDeliverer({
    apiKey,
    from: process.env.MAIL_FROM_DEFAULT ?? "Daily Scribe <my@dailyscribe.ca>",
  });
}

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
 * A "digest" has no plugin of its own — it bundles whichever of the user's
 * other services are currently enabled into one PDF. Membership is just
 * "is this service enabled", not a separate list, so a service dropping out
 * of the digest is exactly the same action as disabling it anywhere else.
 */
async function collectDigestAssets(
  userId: string,
  utcMidnight: Date,
  secrets: Record<string, string>,
): Promise<Asset[]> {
  const { subscriptions } = await collections();
  const assets: Asset[] = [];
  for (const memberId of DIGEST_MEMBER_SERVICES) {
    const member = await subscriptions.findOne({ userId, service: memberId, enabled: true });
    const plugin = member && getPlugin(memberId);
    if (!plugin) continue;
    assets.push(...(await plugin.run({ userId, date: utcMidnight, config: member!.config, secrets })));
  }
  return assets;
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
    const secretDocs = await userSecrets.find({ userId: sub.userId }).toArray();
    const secrets: Record<string, string> = {};
    for (const doc of secretDocs) secrets[doc.provider] = decryptSecret(doc.data);

    let assets: Asset[];
    let label: string;
    if (sub.service === "digest") {
      const memberAssets = await collectDigestAssets(sub.userId, utcMidnight, secrets);
      if (memberAssets.length === 0) {
        throw new Error("Digest has no configured/enabled member services to bundle.");
      }
      assets = [await mergePdfAssets(memberAssets, `daily-scribe-digest-${isoDate}.pdf`)];
      label = "Daily Scribe Digest";
    } else {
      const plugin = getPlugin(sub.service);
      if (!plugin) throw new Error(`Unknown service: ${sub.service}`);
      assets = await plugin.run({ userId: sub.userId, date: utcMidnight, config: sub.config, secrets });
      label = plugin.label;
    }

    await getDeliverer().deliver({
      to: sub.config.kindleEmail,
      subject: `${label} — ${isoDate}`,
      text: `Your daily ${label}, delivered by Daily Scribe.`,
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

/** Run every enabled subscription whose local delivery time has passed today.
 *  Users with an enabled digest have their other enabled services skipped
 *  standalone — those are delivered once, bundled through the digest. */
export async function dispatchDue(now: Date): Promise<RunResult[]> {
  const { subscriptions } = await collections();
  const enabled = await subscriptions.find({ enabled: true }).toArray();

  const digestUsers = new Set(enabled.filter((s) => s.service === "digest").map((s) => s.userId));

  const results: RunResult[] = [];
  for (const sub of enabled) {
    if (sub.service !== "digest" && digestUsers.has(sub.userId)) continue;
    if (isDue(sub, now)) results.push(await runSubscription(sub, now));
  }
  return results;
}
