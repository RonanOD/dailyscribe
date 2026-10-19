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
 * The two Amazon tables are HTML mockups rather than screenshots: they can
 * highlight the row that matters, show a placeholder device address instead of
 * a real one, and don't go stale in a browser-chrome way. Update the headings
 * if Amazon renames its settings sections.
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

/** A simplified copy of one of Amazon's settings tables, with the row the user
 *  cares about highlighted. */
function AmazonTableMock({
  title,
  intro,
  columns,
  rows,
  note,
}: {
  title: string;
  intro: string;
  columns: string[];
  rows: { cells: string[]; highlight?: boolean }[];
  note: string;
}) {
  return (
    <figure className="amazon-mock" aria-label={`Example of Amazon's "${title}" section`}>
      <div className="amazon-mock-title">{title}</div>
      <div className="amazon-mock-intro">{intro}</div>
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cells.join("|")} className={r.highlight ? "amazon-mock-hl" : undefined}>
              {r.cells.map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption>{note}</figcaption>
    </figure>
  );
}

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
          Enter <code>{SENDER}</code> and save. It should then appear in the list:
        </li>
      </ol>

      <AmazonTableMock
        title="Approved Personal Document E-mail List"
        intro="To prevent spam, your Kindle will only receive files from the following e-mail addresses you have authorized."
        columns={["E-mail address", "Actions"]}
        rows={[{ cells: [SENDER, "Delete"], highlight: true }]}
        note={`Done when ${SENDER} is in this list.`}
      />

      <p className="hint">
        Find your device&apos;s <em>Send-to-Kindle Email</em> in the section titled{" "}
        <em>Send-to-Kindle E-Mail Settings</em>. Copy the email address that we can send your Daily
        Scribe to and paste it into the text box below.
      </p>

      <AmazonTableMock
        title="Send-to-Kindle E-Mail Settings"
        intro="You can e-mail personal documents to the following Kindle(s) using the e-mail addresses shown."
        columns={["Name", "E-mail address", "Actions"]}
        rows={[
          { cells: ["Your Kindle Scribe", "yourname_a1b2c3@kindle.com", "Edit"], highlight: true },
          { cells: ["Kindle for iPhone", "yourname_x9y8z7@kindle.com", "Edit"] },
        ]}
        note="Copy the address of the Kindle you'll read on (your Scribe, not a phone app)."
      />
    </div>
  );
}
