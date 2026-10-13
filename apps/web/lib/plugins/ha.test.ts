import { describe, expect, it } from "vitest";
import { extractHaSummaryData, localDayWindow, type HaCalendarEvent } from "./ha";

describe("extractHaSummaryData — header date", () => {
  it("formats the digest's nominal date in UTC, not the household's timezone", () => {
    // The dispatcher pins ctx.date to UTC midnight of the intended calendar
    // day (apps/web/lib/runner.ts localParts()) — it is not a true instant.
    // A negative-offset timezone like America/Toronto (UTC-4/5) must not be
    // re-applied here, or the date rolls back to the previous local day.
    const nowDate = new Date("2026-09-22T00:00:00Z");

    const data = extractHaSummaryData(
      [],
      [],
      [],
      [],
      { weatherEntity: "weather.home", wasteCalendar: "" },
      "America/Toronto",
      nowDate,
    );

    expect(data.todayFormatted).toContain("September 22, 2026");
    expect(data.todayFormatted).not.toContain("September 21");
  });
});

describe("localDayWindow", () => {
  it("spans local midnight to midnight in a negative-offset timezone", () => {
    const { isoDate, start, end } = localDayWindow(new Date("2026-10-13T00:00:00Z"), "America/Halifax");
    expect(isoDate).toBe("2026-10-13");
    expect(start.toISOString()).toBe("2026-10-13T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-14T03:00:00.000Z");
  });

  it("handles a DST change inside the day", () => {
    // 2026-11-01: America/Toronto falls back from EDT (UTC-4) to EST (UTC-5).
    const { start, end } = localDayWindow(new Date("2026-11-01T00:00:00Z"), "America/Toronto");
    expect(start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });
});

describe("extractHaSummaryData — today's calendar", () => {
  const rows = (events: HaCalendarEvent[]) =>
    extractHaSummaryData(
      [],
      [],
      [],
      [{ calId: "calendar.family", events }],
      { weatherEntity: "weather.home", wasteCalendar: "" },
      "America/Halifax",
      new Date("2026-10-13T00:00:00Z"),
    ).calendarRows;

  it("drops yesterday's events that overlap the window edge", () => {
    expect(
      rows([
        { start: { date: "2026-10-12" }, end: { date: "2026-10-13" }, summary: "Thanksgiving" },
        { start: { dateTime: "2026-10-12T22:00:00-03:00" }, end: { dateTime: "2026-10-13T00:00:00-03:00" }, summary: "Late show" },
      ]),
    ).toEqual([]);
  });

  it("keeps today's all-day and evening events", () => {
    expect(
      rows([
        { start: { date: "2026-10-13" }, end: { date: "2026-10-14" }, summary: "Recycling" },
        { start: { dateTime: "2026-10-13T21:30:00-03:00" }, end: { dateTime: "2026-10-13T22:30:00-03:00" }, summary: "Call" },
      ]),
    ).toEqual(["All day Recycling", "9:30 pm Call"]);
  });
});
