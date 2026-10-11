import { describe, expect, it } from "vitest";
import { nudgeEmail, refLine } from "./onboarding-nudges";

describe("refLine", () => {
  it("tailors the opener to the signup source", () => {
    expect(refLine("reddit-soloroleplaying")).toContain("solo roleplaying");
    expect(refLine("reddit-ereader")).toContain("r/ereader");
  });
  it("tolerates stray punctuation from hand-pasted links", () => {
    expect(refLine("reddit-kindlescribe]")).toBe(refLine("reddit-kindlescribe"));
  });
  it("falls back to a generic pitch", () => {
    expect(refLine(undefined)).toBe(refLine("site-hero"));
  });
});

describe("nudgeEmail", () => {
  it("builds every kind with a subject and a sign-in link", () => {
    for (const kind of ["reinvite", "inviteReminder", "finishSetup"] as const) {
      const email = nudgeEmail(kind, "reddit-kindlescribe");
      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.text).toContain("https://my.dailyscribe.ca");
    }
  });
  it("sends unfinished signups straight to onboarding", () => {
    expect(nudgeEmail("finishSetup").text).toContain("https://my.dailyscribe.ca/onboarding");
  });
  it("uses no em dashes", () => {
    for (const kind of ["reinvite", "inviteReminder", "finishSetup"] as const) {
      const { subject, text } = nudgeEmail(kind, "reddit-soloroleplaying");
      expect(subject + text).not.toContain("—");
    }
  });
});
