"use client";

import { useEffect, useState } from "react";

/**
 * The Amazon "Approved Personal Document E-mail List" walkthrough. This is the
 * one hard prerequisite for delivery — Amazon silently discards mail from any
 * unapproved sender (see SETUP.md "Notes / follow-ups") — so it gets a visual
 * walkthrough. Rendered on the onboarding "Kindle setup" step and reused on the
 * dashboard's "Delivery" tab.
 *
 * "Manage Your Content and Devices" lives on the user's home marketplace, not a
 * single global domain — a .com deep link is wrong for a Canadian, UK, etc.
 * account. So the link's domain is a small picker (remembered per browser),
 * defaulting to amazon.ca.
 *
 * The screenshots are hand-captured static assets under /public/onboarding
 * (refresh them if Amazon redesigns its settings UI). They are optional: any
 * that 404 hide themselves, and the numbered text steps always render, so the
 * flow ships before the images exist.
 */
const SENDER = "my@dailyscribe.ca";
const STORAGE_KEY = "ds.amazonMarketplace";

/** Amazon storefronts that support Send-to-Kindle / personal documents. */
const MARKETPLACES: { host: string; label: string }[] = [
  { host: "amazon.ca", label: "Canada (.ca)" },
  { host: "amazon.com", label: "United States (.com)" },
  { host: "amazon.co.uk", label: "United Kingdom (.co.uk)" },
  { host: "amazon.com.au", label: "Australia (.com.au)" },
  { host: "amazon.de", label: "Germany (.de)" },
  { host: "amazon.fr", label: "France (.fr)" },
  { host: "amazon.it", label: "Italy (.it)" },
  { host: "amazon.es", label: "Spain (.es)" },
  { host: "amazon.co.jp", label: "Japan (.co.jp)" },
  { host: "amazon.in", label: "India (.in)" },
  { host: "amazon.com.br", label: "Brazil (.com.br)" },
  { host: "amazon.com.mx", label: "Mexico (.com.mx)" },
  { host: "amazon.nl", label: "Netherlands (.nl)" },
];
const DEFAULT_HOST = MARKETPLACES[0].host;
const VALID_HOSTS = new Set(MARKETPLACES.map((m) => m.host));

const GUIDE_IMAGES: { src: string; alt: string; caption: string }[] = [
  {
    src: "/onboarding/amazon-approved-list.png",
    alt: "Amazon Manage Your Content and Devices, Preferences tab, Personal Document Settings expanded to show the approved e-mail list",
    caption: "Preferences → Personal Document Settings → “Add a new approved e-mail address”.",
  },
  {
    src: "/onboarding/amazon-add-address.png",
    alt: `Amazon dialog for adding an approved e-mail address, with ${SENDER} entered`,
    caption: `Enter ${SENDER} and save.`,
  },
  {
    src: "/onboarding/amazon-send-to-kindle.png",
    alt: "Amazon Send-to-Kindle e-mail settings list, showing a device's address ending in @kindle.com",
    caption: "Your own Send-to-Kindle address (it ends in @kindle.com) is on the same page.",
  },
];

export function KindleSetupGuide() {
  const [host, setHost] = useState(DEFAULT_HOST);

  // Remember the choice per browser (best-effort — private windows etc. throw).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && VALID_HOSTS.has(saved)) setHost(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function pick(next: string) {
    setHost(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const mycdUrl = `https://www.${host}/hz/mycd/myx`;

  return (
    <div className="kindle-guide">
      <p className="hint">
        Daily Scribe sends every document from <code>{SENDER}</code>. Amazon only accepts personal
        documents from addresses you have approved, so add it once:
      </p>

      <div className="field kindle-guide-market">
        <label htmlFor="amazon-marketplace">Your Amazon site</label>
        <select id="amazon-marketplace" value={host} onChange={(e) => pick(e.target.value)}>
          {MARKETPLACES.map((m) => (
            <option key={m.host} value={m.host}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <ol className="kindle-guide-steps">
        <li>
          Open{" "}
          <a href={mycdUrl} target="_blank" rel="noreferrer">
            Manage Your Content &amp; Devices
          </a>{" "}
          on <code>{host}</code>, open the <em>Preferences</em> tab, and expand{" "}
          <em>Personal Document Settings</em>.
        </li>
        <li>
          Under <em>Approved Personal Document E-mail List</em>, choose{" "}
          <em>Add a new approved e-mail address</em>.
        </li>
        <li>
          Enter <code>{SENDER}</code> and save.
        </li>
      </ol>

      <div className="kindle-guide-shots">
        {GUIDE_IMAGES.map((img) => (
          <figure key={img.src} className="kindle-guide-shot">
            {/* eslint-disable-next-line @next/next/no-img-element -- static asset, no optimization needed */}
            <img
              src={img.src}
              alt={img.alt}
              loading="lazy"
              onError={(e) => {
                const fig = e.currentTarget.closest("figure");
                if (fig) fig.hidden = true;
              }}
            />
            <figcaption>{img.caption}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
