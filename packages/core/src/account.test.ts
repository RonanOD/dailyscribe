import { describe, expect, it } from "vitest";
import { MAX_FEEDBACK_CHARS, cleanFeedback } from "./account";

describe("cleanFeedback", () => {
  it("keeps a trimmed answer", () => {
    expect(cleanFeedback("  too much to read \n")).toBe("too much to read");
  });
  it("drops empty or non-string answers", () => {
    expect(cleanFeedback("   ")).toBeUndefined();
    expect(cleanFeedback(undefined)).toBeUndefined();
    expect(cleanFeedback({ evil: true })).toBeUndefined();
  });
  it("caps very long answers", () => {
    expect(cleanFeedback("x".repeat(MAX_FEEDBACK_CHARS + 50))).toHaveLength(MAX_FEEDBACK_CHARS);
  });
});
