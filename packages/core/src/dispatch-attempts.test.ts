import { describe, expect, it } from "vitest";
import {
  MAX_DISPATCH_ATTEMPTS,
  RETRY_DELAYS_MS,
  deliveryFailureEmail,
  failureHint,
  isPermanentFailure,
  retryDelayMs,
} from "./dispatch-attempts";

// Real error strings seen in production `deliveries` rows.
const DIGEST_EMPTY = "Digest has no configured/enabled member services to bundle.";
const HA_403 = "Home Assistant API /api/states returned HTTP 403";

describe("isPermanentFailure", () => {
  it("gives up at once on errors only the user can fix", () => {
    expect(isPermanentFailure(DIGEST_EMPTY)).toBe(true);
    expect(isPermanentFailure("Digest has all attempted services failed (CBC News).")).toBe(true);
    expect(isPermanentFailure(HA_403)).toBe(true);
    expect(isPermanentFailure("Home Assistant HTTP 401 Unauthorized — check your Access Token.")).toBe(true);
    expect(isPermanentFailure("Home Assistant URL and Long-Lived Access Token are not configured in your account.")).toBe(true);
  });
  it("retries transient errors", () => {
    expect(isPermanentFailure("Home Assistant API /api/states returned HTTP 502")).toBe(false);
    expect(isPermanentFailure("fetch failed")).toBe(false);
    expect(isPermanentFailure("Resend send failed: rate_limit_exceeded")).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("backs off, one delay per retry", () => {
    expect(RETRY_DELAYS_MS).toHaveLength(MAX_DISPATCH_ATTEMPTS - 1);
    expect(retryDelayMs(1)).toBe(RETRY_DELAYS_MS[0]);
    expect(retryDelayMs(2)).toBeGreaterThan(retryDelayMs(1));
    expect(retryDelayMs(3)).toBeGreaterThan(retryDelayMs(2));
  });
  it("clamps out-of-range counts", () => {
    expect(retryDelayMs(0)).toBe(RETRY_DELAYS_MS[0]);
    expect(retryDelayMs(99)).toBe(RETRY_DELAYS_MS.at(-1));
  });
});

describe("failure emails", () => {
  it("explains the common failures in plain words", () => {
    expect(failureHint(DIGEST_EMPTY)).toContain("none of the services");
    expect(failureHint(HA_403)).toContain("Long-Lived Access Token");
  });
  it("names the service and date, and links the dashboard", () => {
    const { subject, text } = deliveryFailureEmail("Home Status", "2026-10-17", HA_403);
    expect(subject).toContain("Home Status");
    expect(text).toContain("2026-10-17");
    expect(text).toContain("https://my.dailyscribe.ca/dashboard");
    expect(text).toContain(HA_403);
  });
  it("uses no em dashes of its own", () => {
    const { subject, text } = deliveryFailureEmail("Daily Scribe Digest", "2026-10-17", DIGEST_EMPTY);
    expect(subject + text).not.toContain("—");
  });
});
