import { ObjectId } from "mongodb";
import { collections } from "./db";
import type { ServiceId } from "./types";

/**
 * "What's new" pages: a one-page announcement placed at the front of a user's
 * edition while it's running (between `from` and `until`). Each user sees a
 * given announcement once, on the first scheduled edition that carries it:
 * `users.announcements["edition:<id>"]` is stamped after that edition is
 * delivered. To announce something new, add an entry here.
 *
 * The same page doubles as a one-page win-back PDF for users who've stopped
 * getting editions (apps/web/scripts/announce.mjs --kindle-pdf).
 */
export interface AnnouncementItem {
  /** The service this item is about, used to pick who sees it. */
  service: ServiceId;
  /** "without" (default): only users who don't have `service` on, e.g. a new
   *  section. "with": only users who do, e.g. a new DnD adventure. */
  audience?: "with" | "without";
  title: string;
  body: string;
  /** One line on how to turn it on or use it. */
  howTo: string;
}

export interface EditionAnnouncement {
  id: string;
  from: Date;
  until: Date;
  heading: string;
  intro: string;
  items: AnnouncementItem[];
}

export const EDITION_ANNOUNCEMENTS: EditionAnnouncement[] = [
  {
    id: "2026-10-feeds-chess",
    from: new Date("2026-10-27T00:00:00Z"),
    until: new Date("2026-11-17T00:00:00Z"),
    heading: "New in Daily Scribe",
    intro: "Two new sections you can add to your edition, both free like everything else.",
    items: [
      {
        service: "feeds",
        title: "Your Feeds",
        body:
          "Add up to ten RSS or Atom feeds, such as your local paper, a favourite Substack or a blog, " +
          "and each edition carries their new headlines with a short summary. Paste a homepage and " +
          "Daily Scribe finds the feed for you. On a quiet day nothing is sent.",
        howTo: "Turn it on: my.dailyscribe.ca/dashboard?tab=feeds",
      },
      {
        service: "chess",
        title: "Chess Puzzles",
        body:
          "One to four puzzles a day from the free Lichess puzzle database, picked for your level, " +
          "from Beginner to Expert. Each shows the board from your side and the task, like \"Mate in 2\". " +
          "Work it out with the pen, then turn past a spacer page for the solution.",
        howTo: "Turn it on: my.dailyscribe.ca/dashboard?tab=chess",
      },
      {
        service: "dnd",
        audience: "with",
        title: "A second D&D adventure: The Mountain Forge",
        body:
          "Finish an adventure and you can now keep your hero: they rise a level, heal to full and " +
          "keep everything they carry. Then pick your next adventure, including the new Mountain Forge.",
        howTo: "It's offered on the page after your next victory.",
      },
    ],
  },
];

/** The announcement running at `now`, if any (the first, if several overlap). */
export function currentEditionAnnouncement(
  now: Date,
  list: EditionAnnouncement[] = EDITION_ANNOUNCEMENTS,
): EditionAnnouncement | null {
  return list.find((a) => a.from <= now && now < a.until) ?? null;
}

/** `announcement` trimmed to the items meant for a user with `enabledServices`
 *  switched on, or null when none are. */
export function announcementForUser(
  announcement: EditionAnnouncement,
  enabledServices: Iterable<string>,
): EditionAnnouncement | null {
  const enabled = new Set(enabledServices);
  const items = announcement.items.filter((item) =>
    (item.audience ?? "without") === "with" ? enabled.has(item.service) : !enabled.has(item.service),
  );
  return items.length > 0 ? { ...announcement, items } : null;
}

export function editionAnnouncementKey(announcement: EditionAnnouncement): string {
  return `edition:${announcement.id}`;
}

/**
 * The announcement page `userId`'s next edition should carry, or null: one is
 * running, the user had editions before it started, hasn't had it yet, and at
 * least one item applies to them.
 */
export async function pendingEditionAnnouncement(userId: string, now: Date): Promise<EditionAnnouncement | null> {
  const announcement = currentEditionAnnouncement(now);
  if (!announcement || !ObjectId.isValid(userId)) return null;
  const { users, subscriptions, deliveries } = await collections();
  const field = `announcements.${editionAnnouncementKey(announcement)}`;
  const seen = await users.findOne({ _id: new ObjectId(userId), [field]: { $exists: true } }, { projection: { _id: 1 } });
  if (seen) return null;
  // Only for existing subscribers: someone whose first edition comes after the
  // announcement started is new to everything, so "what's new" makes no sense.
  const subscriberBefore = await deliveries.findOne(
    { userId, status: "success", deliveredAt: { $lt: announcement.from } },
    { projection: { _id: 1 } },
  );
  if (!subscriberBefore) return null;
  const enabled = await subscriptions.distinct("service", { userId, enabled: true });
  return announcementForUser(announcement, enabled);
}

/** Records that `userId` has had `announcement`, so later editions skip it. */
export async function markEditionAnnouncementSeen(
  userId: string,
  announcement: EditionAnnouncement,
  now: Date,
): Promise<void> {
  if (!ObjectId.isValid(userId)) return;
  const { users } = await collections();
  await users.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { [`announcements.${editionAnnouncementKey(announcement)}`]: now } },
  );
}
