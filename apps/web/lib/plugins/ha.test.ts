import { describe, expect, it } from "vitest";
import { extractHaSummaryData } from "./ha";

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
