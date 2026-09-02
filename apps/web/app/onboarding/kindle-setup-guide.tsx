"use client";

/**
 * The Amazon "Approved Personal Document E-mail List" walkthrough. This is the
 * one hard prerequisite for delivery — Amazon silently discards mail from any
 * unapproved sender (see SETUP.md "Notes / follow-ups") — so it gets a visual
 * walkthrough. Rendered on the onboarding "Kindle setup" step and reused on the
 * dashboard's "Delivery" tab.
 *
 * The screenshots are hand-captured static assets under /public/onboarding
 * (refresh them if Amazon redesigns its settings UI). They are optional: any
 * that 404 hide themselves, and the numbered text steps always render, so the
 * flow ships before the images exist.
 */
const AMAZON_PDOC_URL = "https://www.amazon.com/hz/mycd/myx#/home/settings/pdoc";
const SENDER = "my@dailyscribe.ca";

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
  return (
    <div className="kindle-guide">
      <p className="hint">
        Daily Scribe sends every document from <code>{SENDER}</code>. Amazon only accepts personal
        documents from addresses you have approved, so add it once:
      </p>
      <ol className="kindle-guide-steps">
        <li>
          Open{" "}
          <a href={AMAZON_PDOC_URL} target="_blank" rel="noreferrer">
            Manage Your Content &amp; Devices → Preferences
          </a>{" "}
          and expand <em>Personal Document Settings</em>.
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
