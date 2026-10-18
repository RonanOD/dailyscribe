import {
  assembleDigestPdf,
  claimDispatchAttempt,
  claimUserAlert,
  collections,
  createResendDeliverer,
  decryptSecret,
  deliveryFailureEmail,
  failureStreak,
  getPdfPageCount,
  getPlugin,
  isKindleAddress,
  markAttemptPaused,
  mergePdfAssets,
  nudgeSenderFromEnv,
  nytCrosswordPlugin,
  PAUSE_AFTER_GAVE_UP_DAYS,
  pausedReason,
  recordDispatchFailure,
  recordDispatchSuccess,
  registerPlugin,
  releaseUserAlert,
  sendPlainEmail,
  type AttemptKey,
  type Asset,
  type Deliverer,
  type DigestSection,
  type DispatchAttempt,
  type Subscription,
} from "@dailyscribe/core";
import { ObjectId } from "mongodb";
import { bbcNewsPlugin } from "@/lib/plugins/bbc";
import { cbcNewsPlugin } from "@/lib/plugins/cbc";
import { renderDigestCoverPdf } from "@/lib/plugins/digest-cover";
import { dndPlugin } from "@/lib/plugins/dnd";
import { haSummaryPlugin } from "@/lib/plugins/ha";
import { kanjiPlugin } from "@/lib/plugins/kanji";
import { rteNewsPlugin } from "@/lib/plugins/rte";
import { universalCrosswordPlugin } from "@/lib/plugins/universal-crossword";
import { DIGEST_MEMBER_SERVICES } from "@/lib/digest";

// Register the available service plugins once per runtime.
registerPlugin(nytCrosswordPlugin);
registerPlugin(cbcNewsPlugin);
registerPlugin(bbcNewsPlugin);
registerPlugin(rteNewsPlugin);
registerPlugin(haSummaryPlugin);
registerPlugin(kanjiPlugin);
registerPlugin(universalCrosswordPlugin);
registerPlugin(dndPlugin);

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

interface DigestSectionResult {
  sections: DigestSection[];
  /** Labels of members that were enabled but threw while rendering — kept
   *  separate from "not configured"/"disabled" (those are silently skipped,
   *  by design) so the caller can still tell the user one of their enabled
   *  services didn't make it in today, instead of the digest just quietly
   *  shrinking. */
  failedLabels: string[];
}

/**
 * A "digest" has no plugin of its own — it bundles whichever of the user's
 * other services are currently enabled into one PDF. Membership is just
 * "is this service enabled", not a separate list, so a service dropping out
 * of the digest is exactly the same action as disabling it anywhere else.
 * One section per member (labeled, for the cover's table of contents) —
 * a member returning more than one asset gets merged into a single section
 * first, though every plugin returns exactly one today.
 *
 * Each member renders independently: one member throwing (e.g. Home
 * Assistant briefly unreachable) only drops that section, it never takes
 * down the whole digest — the alternative (today's kanji/CBC failing to
 * send because HA's API hiccuped) is worse than a smaller bundle.
 */
async function collectDigestSections(
  userId: string,
  utcMidnight: Date,
  secrets: Record<string, string>,
): Promise<DigestSectionResult> {
  const { subscriptions } = await collections();
  const sections: DigestSection[] = [];
  const failedLabels: string[] = [];
  for (const memberId of DIGEST_MEMBER_SERVICES) {
    const member = await subscriptions.findOne({ userId, service: memberId, enabled: true });
    const plugin = member && getPlugin(memberId);
    if (!plugin) continue;
    try {
      const memberAssets = await plugin.run({
        userId,
        date: utcMidnight,
        config: member!.config,
        secrets,
        digest: true,
      });
      if (memberAssets.length === 0) continue;
      const asset =
        memberAssets.length === 1 ? memberAssets[0] : await mergePdfAssets(memberAssets, `${memberId}.pdf`);
      sections.push({ label: plugin.label, asset });
    } catch (err) {
      console.error(
        `digest: ${plugin.label} failed for user ${userId}, dropping it from today's bundle:`,
        err instanceof Error ? err.stack : err,
      );
      failedLabels.push(plugin.label);
    }
  }
  return { sections, failedLabels };
}

/**
 * Email the user (their account address, not the Kindle) that today's delivery
 * gave up, at most once per service per week. A pause notice skips that limit,
 * since it's the one email that tells them the service has stopped. Best
 * effort: a failure here is logged and never affects the dispatch result.
 */
async function alertUser(
  key: AttemptKey,
  label: string,
  error: string,
  now: Date,
  pausedAfterDays?: number,
): Promise<void> {
  try {
    const { users } = await collections();
    const user = ObjectId.isValid(key.userId) ? await users.findOne({ _id: new ObjectId(key.userId) }) : null;
    if (!user?.email || isKindleAddress(user.email)) return;
    if (!(await claimUserAlert(key, now, { ignoreCooldown: Boolean(pausedAfterDays) }))) return;
    try {
      await sendPlainEmail(
        nudgeSenderFromEnv(),
        user.email,
        deliveryFailureEmail(label, key.puzzleDate, error, { pausedAfterDays }),
      );
    } catch (err) {
      await releaseUserAlert(key);
      throw err;
    }
  } catch (err) {
    console.error(`delivery-failure alert for ${key.service} (user ${key.userId}) failed:`, err);
  }
}

/**
 * After a scheduled send gives up: pause the subscription once it has failed
 * PAUSE_AFTER_GAVE_UP_DAYS days in a row (as the bounce webhook does, via
 * `disabledReason`), otherwise just alert the user.
 */
async function handleGaveUp(sub: Subscription, key: AttemptKey, label: string, error: string, now: Date) {
  try {
    const streak = await failureStreak(sub.userId, sub.service, sub.pausedAt);
    if (streak >= PAUSE_AFTER_GAVE_UP_DAYS && sub._id) {
      const { subscriptions } = await collections();
      const res = await subscriptions.updateOne(
        { _id: sub._id, enabled: true },
        { $set: { enabled: false, disabledReason: pausedReason(label, streak, error), pausedAt: now } },
      );
      if (res.modifiedCount === 1) {
        await markAttemptPaused(key);
        await alertUser(key, label, error, now, streak);
        return;
      }
    }
  } catch (err) {
    console.error(`auto-pause check for ${key.service} (user ${key.userId}) failed:`, err);
  }
  await alertUser(key, label, error, now);
}

/**
 * Run one subscription: fetch the service assets, email them to the Kindle, and
 * log the outcome. Never throws: failures are caught and recorded as a "failed"
 * delivery.
 *
 * Scheduled runs first claim the day's `dispatchAttempts` row, which makes the
 * send exactly-once across overlapping dispatch callers and paces retries
 * (up to MAX_DISPATCH_ATTEMPTS a day, backing off; permanent errors give up at
 * once). Giving up emails the user, and a week of give-ups in a row pauses
 * the subscription. Forced sends ("send now") skip all of this.
 */
export async function runSubscription(
  sub: Subscription,
  now: Date,
  opts: { force?: boolean } = {},
): Promise<RunResult> {
  const { userSecrets, deliveries } = await collections();
  const { isoDate, utcMidnight } = localParts(now, sub.config.timezone);
  const subscriptionId = sub._id?.toString() ?? "unknown";
  const key: AttemptKey = { userId: sub.userId, service: sub.service, puzzleDate: isoDate };

  let attempt: DispatchAttempt | null = null;
  if (!opts.force) {
    attempt = await claimDispatchAttempt(key, now);
    if (!attempt) return { subscriptionId, service: sub.service, status: "skipped" };
    // A forced "send now" today already counts as today's delivery.
    const already = await deliveries.findOne({ ...key, status: "success" });
    if (already) {
      await recordDispatchSuccess(key, now);
      return { subscriptionId, service: sub.service, status: "skipped" };
    }
  }

  let label: string = sub.service;
  try {
    const secretDocs = await userSecrets.find({ userId: sub.userId }).toArray();
    const secrets: Record<string, string> = {};
    for (const doc of secretDocs) secrets[doc.provider] = decryptSecret(doc.data);

    let assets: Asset[];
    let noteSuffix = "";
    if (sub.service === "digest") {
      label = "Daily Scribe Digest";
      const { sections, failedLabels } = await collectDigestSections(sub.userId, utcMidnight, secrets);
      if (sections.length === 0) {
        const reason =
          failedLabels.length > 0
            ? `all attempted services failed (${failedLabels.join(", ")})`
            : "no configured/enabled member services to bundle";
        throw new Error(`Digest has ${reason}.`);
      }

      let startPage = 3; // 2-page front matter (cover, then table of contents)
      const withStartPages = [];
      for (const section of sections) {
        withStartPages.push({ label: section.label, startPage });
        startPage += await getPdfPageCount(section.asset.bytes);
      }

      const { asset: cover, tocLinkRects } = await renderDigestCoverPdf(withStartPages, utcMidnight);
      assets = [await assembleDigestPdf(cover, sections, tocLinkRects, `daily-scribe-digest-${isoDate}.pdf`)];
      if (failedLabels.length > 0) {
        noteSuffix = ` Note: ${failedLabels.join(", ")} couldn't be included today — it'll be back once resolved.`;
      }
    } else {
      const plugin = getPlugin(sub.service);
      if (!plugin) throw new Error(`Unknown service: ${sub.service}`);
      label = plugin.label;
      assets = await plugin.run({ userId: sub.userId, date: utcMidnight, config: sub.config, secrets });
    }

    await getDeliverer().deliver({
      to: sub.config.kindleEmail,
      subject: `${label} — ${isoDate}`,
      text: `Your daily ${label}, delivered by Daily Scribe.${noteSuffix}`,
      assets,
    });

    await deliveries.insertOne({
      userId: sub.userId,
      service: sub.service,
      puzzleDate: isoDate,
      status: "success",
      deliveredAt: new Date(),
    });
    if (attempt) await recordDispatchSuccess(key, now);
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
    if (attempt) {
      const { gaveUp } = await recordDispatchFailure(attempt, error, now);
      if (gaveUp) await handleGaveUp(sub, key, label, error, now);
    }
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
