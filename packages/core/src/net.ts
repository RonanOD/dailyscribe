import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** How a hostname is resolved to IPs. Injectable so the guard can be unit-tested. */
export type HostResolver = (host: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (host) => {
  const records = await lookup(host, { all: true });
  return records.map((r) => r.address);
};

/**
 * True for IPs that must never be reachable from a server-side fetch of a
 * user-supplied URL: loopback, RFC-1918 private space, link-local (incl. the
 * 169.254.169.254 cloud metadata endpoint), carrier-grade NAT, and the IPv6
 * equivalents (plus IPv4-mapped IPv6).
 */
export function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();

  // IPv4-mapped IPv6, e.g. "::ffff:10.0.0.1" — evaluate the embedded v4 address.
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);

  if (isIP(ip) === 6) {
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // fc00::/7 unique-local
    if (v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb"))
      return true; // fe80::/10 link-local
    return false;
  }

  const octets = ip.split(".").map((n) => Number(n));
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // unparseable — refuse rather than guess
  }
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  return false;
}

/**
 * Validate a user-supplied URL before the server fetches it. Rejects non-http(s)
 * schemes and any host that resolves into loopback/private/link-local space.
 * Returns the parsed URL on success; throws an Error with a user-safe message
 * otherwise.
 */
export async function assertPublicHttpUrl(raw: string, resolve: HostResolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL must use http:// or https://.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  let ips: string[];
  if (isIP(host)) {
    ips = [host];
  } else {
    if (/^localhost$/i.test(host) || /\.local$/i.test(host) || /\.internal$/i.test(host)) {
      throw new Error("URL must not point at a local address.");
    }
    try {
      ips = await resolve(host);
    } catch {
      throw new Error("Could not resolve that URL's host.");
    }
    if (ips.length === 0) throw new Error("Could not resolve that URL's host.");
  }

  if (ips.some(isPrivateIp)) {
    throw new Error("URL must point at a public address, not a private or local network.");
  }
  return url;
}
