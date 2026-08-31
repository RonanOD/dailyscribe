/** Pragmatic "looks like an email" check — one @, no whitespace, a dotted domain.
 *  Not RFC-5322; deliberately just enough to catch fat-fingered input. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailShaped(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Amazon's "Send to Kindle" personal-document domains. */
const KINDLE_DOMAINS = new Set(["kindle.com", "free.kindle.com"]);

/** True when the address is on a recognised Kindle document domain. A false
 *  result isn't fatal (users can point elsewhere) but is worth warning about. */
export function isKindleAddress(value: string): boolean {
  const at = value.lastIndexOf("@");
  if (at === -1) return false;
  return KINDLE_DOMAINS.has(value.slice(at + 1).trim().toLowerCase());
}
