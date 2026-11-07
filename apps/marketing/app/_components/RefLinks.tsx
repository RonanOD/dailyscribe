"use client";

import { useEffect } from "react";

/**
 * Carries attribution onto the sign-up links (`[data-ref-link]`): a ?ref= on
 * this page's URL (campaign links such as dailyscribe.ca/?ref=hn) wins,
 * otherwise the referring site's host (news.ycombinator.com, reddit.com, ...).
 * Without either, each link keeps its own default (site-hero, site-footer).
 */
export function RefLinks() {
  useEffect(() => {
    let ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref && document.referrer) {
      try {
        const host = new URL(document.referrer).hostname.replace(/^www\./, "");
        if (host && !host.endsWith("dailyscribe.ca")) ref = host;
      } catch {
        // Unparseable referrer: keep the defaults.
      }
    }
    ref = ref?.replace(/[^\w.-]/g, "").slice(0, 64) ?? null;
    if (!ref) return;
    document.querySelectorAll<HTMLAnchorElement>("a[data-ref-link]").forEach((a) => {
      const url = new URL(a.href);
      url.searchParams.set("ref", ref);
      a.href = url.toString();
    });
  }, []);
  return null;
}
