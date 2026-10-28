import { describe, expect, it } from "vitest";
import {
  announcementForUser,
  currentEditionAnnouncement,
  EDITION_ANNOUNCEMENTS,
  type EditionAnnouncement,
} from "./announcements";

const sample: EditionAnnouncement = {
  id: "test",
  from: new Date("2026-10-27T00:00:00Z"),
  until: new Date("2026-11-17T00:00:00Z"),
  heading: "New",
  intro: "Intro",
  items: [
    { service: "feeds", title: "Feeds", body: "b", howTo: "h" },
    { service: "chess", title: "Chess", body: "b", howTo: "h" },
    { service: "dnd", audience: "with", title: "Forge", body: "b", howTo: "h" },
  ],
};

describe("currentEditionAnnouncement", () => {
  it("runs from `from` up to, not including, `until`", () => {
    expect(currentEditionAnnouncement(new Date("2026-10-26T23:59:59Z"), [sample])).toBeNull();
    expect(currentEditionAnnouncement(new Date("2026-10-27T00:00:00Z"), [sample])?.id).toBe("test");
    expect(currentEditionAnnouncement(new Date("2026-11-17T00:00:00Z"), [sample])).toBeNull();
  });
});

describe("announcementForUser", () => {
  const titles = (a: EditionAnnouncement | null) => a?.items.map((i) => i.title) ?? null;

  it("shows new sections only to users who don't have them on", () => {
    expect(titles(announcementForUser(sample, ["rte"]))).toEqual(["Feeds", "Chess"]);
    expect(titles(announcementForUser(sample, ["rte", "chess"]))).toEqual(["Feeds"]);
  });

  it("shows `with` items only to users who have that service", () => {
    expect(titles(announcementForUser(sample, ["dnd"]))).toEqual(["Feeds", "Chess", "Forge"]);
  });

  it("shows `all` items to everyone, including users who have that service on", () => {
    const withAll = { ...sample, items: sample.items.map((i) => (i.audience ? i : { ...i, audience: "all" as const })) };
    expect(titles(announcementForUser(withAll, ["feeds", "chess"]))).toEqual(["Feeds", "Chess"]);
    expect(titles(announcementForUser(withAll, ["feeds", "chess", "dnd"]))).toEqual(["Feeds", "Chess", "Forge"]);
  });

  it("is null when nothing applies", () => {
    expect(announcementForUser(sample, ["feeds", "chess"])).toBeNull();
  });
});

describe("EDITION_ANNOUNCEMENTS", () => {
  it("has unique ids and sensible windows", () => {
    const ids = EDITION_ANNOUNCEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of EDITION_ANNOUNCEMENTS) {
      expect(a.from.getTime()).toBeLessThan(a.until.getTime());
      expect(a.items.length).toBeGreaterThan(0);
      // The intro speaks for the whole page, so a user with every service on
      // must still see the sections it promises (the first run showed them
      // only the D&D item under "Two new sections...").
      expect(announcementForUser(a, ["feeds", "chess", "dnd"])?.items.length).toBeGreaterThan(1);
    }
  });
});
