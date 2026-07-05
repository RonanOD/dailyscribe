import { describe, expect, it } from "vitest";
import { buildResendEmail, type DeliverOptions } from "./email";

const DEFAULT_FROM = "Daily Scribe <documents@dailyscribe.ca>";

function opts(overrides: Partial<DeliverOptions> = {}): DeliverOptions {
  return {
    to: "reader@kindle.com",
    subject: "CBC News — 2026-06-30",
    assets: [
      { filename: "cbc-news-2026-06-30.pdf", contentType: "application/pdf", bytes: Buffer.from("%PDF-1.3 fake") },
    ],
    ...overrides,
  };
}

describe("buildResendEmail", () => {
  it("uses the default From when the send doesn't specify one", () => {
    const payload = buildResendEmail(opts(), DEFAULT_FROM);
    expect(payload.from).toBe(DEFAULT_FROM);
    expect(payload.to).toBe("reader@kindle.com");
    expect(payload.subject).toBe("CBC News — 2026-06-30");
  });

  it("lets a per-send From override the default (per-service addresses)", () => {
    const payload = buildResendEmail(opts({ from: "Daily Scribe <news@dailyscribe.ca>" }), DEFAULT_FROM);
    expect(payload.from).toBe("Daily Scribe <news@dailyscribe.ca>");
  });

  it("defaults text to an empty string when omitted", () => {
    expect(buildResendEmail(opts(), DEFAULT_FROM).text).toBe("");
    expect(buildResendEmail(opts({ text: "hello" }), DEFAULT_FROM).text).toBe("hello");
  });

  it("maps each Asset to a Resend attachment (filename, buffer content, content_type)", () => {
    const bytes = Buffer.from("%PDF-1.3 fake");
    const payload = buildResendEmail(opts({ assets: [{ filename: "a.pdf", contentType: "application/pdf", bytes }] }), DEFAULT_FROM);
    expect(payload.attachments).toEqual([
      { filename: "a.pdf", content: bytes, content_type: "application/pdf" },
    ]);
  });

  it("handles multiple attachments", () => {
    const payload = buildResendEmail(
      opts({
        assets: [
          { filename: "a.pdf", contentType: "application/pdf", bytes: Buffer.from("a") },
          { filename: "b.pdf", contentType: "application/pdf", bytes: Buffer.from("b") },
        ],
      }),
      DEFAULT_FROM,
    );
    expect(payload.attachments.map((a) => a.filename)).toEqual(["a.pdf", "b.pdf"]);
  });
});
