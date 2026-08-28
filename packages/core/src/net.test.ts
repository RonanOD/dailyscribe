import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, isPrivateIp } from "./net";

describe("isPrivateIp", () => {
  it("flags loopback, private, link-local and CGNAT IPv4", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "172.31.255.255", "169.254.169.254", "100.64.0.1", "0.0.0.0"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.113.10", "172.15.0.1", "172.32.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it("flags loopback / unique-local / link-local IPv6 and IPv4-mapped private", () => {
    for (const ip of ["::1", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
  });
});

describe("assertPublicHttpUrl", () => {
  const resolvePublic = async () => ["93.184.216.34"];

  it("rejects non-http(s) schemes", async () => {
    await expect(assertPublicHttpUrl("ftp://example.com", resolvePublic)).rejects.toThrow(/http/);
    await expect(assertPublicHttpUrl("file:///etc/passwd", resolvePublic)).rejects.toThrow(/http/);
  });

  it("rejects malformed URLs", async () => {
    await expect(assertPublicHttpUrl("not a url", resolvePublic)).rejects.toThrow(/valid URL/);
  });

  it("rejects localhost and .local without resolving", async () => {
    await expect(assertPublicHttpUrl("http://localhost:8123", resolvePublic)).rejects.toThrow(/local/);
    await expect(assertPublicHttpUrl("http://hass.local", resolvePublic)).rejects.toThrow(/local/);
  });

  it("rejects literal private IPs", async () => {
    await expect(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/", resolvePublic)).rejects.toThrow(/private|local/);
    await expect(assertPublicHttpUrl("http://192.168.1.10:8123", resolvePublic)).rejects.toThrow(/private|local/);
  });

  it("rejects a hostname that resolves into private space", async () => {
    await expect(assertPublicHttpUrl("https://sneaky.example.com", async () => ["10.0.0.9"])).rejects.toThrow(/private|local/);
  });

  it("accepts a public https URL", async () => {
    const url = await assertPublicHttpUrl("https://hass.example.com:8123/api", resolvePublic);
    expect(url.hostname).toBe("hass.example.com");
  });

  it("surfaces resolution failure as a user-safe error", async () => {
    await expect(
      assertPublicHttpUrl("https://nope.example.com", async () => {
        throw new Error("ENOTFOUND");
      }),
    ).rejects.toThrow(/resolve/);
  });
});
