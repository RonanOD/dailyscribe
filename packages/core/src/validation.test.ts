import { describe, expect, it } from "vitest";
import { isEmailShaped, isKindleAddress } from "./validation";

describe("isEmailShaped", () => {
  it("accepts ordinary addresses", () => {
    expect(isEmailShaped("reader@kindle.com")).toBe(true);
    expect(isEmailShaped("  a.b+tag@example.co.uk  ")).toBe(true);
  });
  it("rejects malformed input", () => {
    for (const bad of ["", "notanemail", "no@domain", "a b@example.com", "two@@example.com"]) {
      expect(isEmailShaped(bad), bad).toBe(false);
    }
  });
});

describe("isKindleAddress", () => {
  it("recognises Kindle document domains", () => {
    expect(isKindleAddress("me@kindle.com")).toBe(true);
    expect(isKindleAddress("me@free.kindle.com")).toBe(true);
    expect(isKindleAddress("ME@Kindle.com")).toBe(true);
  });
  it("returns false for anything else", () => {
    expect(isKindleAddress("me@gmail.com")).toBe(false);
    expect(isKindleAddress("not-an-email")).toBe(false);
  });
});
