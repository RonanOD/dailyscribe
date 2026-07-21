"use client";

import { useState } from "react";
import { CBC_FEEDS, CBC_REGIONS } from "@/lib/cbc-feeds";

const REGION_KEYS = new Set(CBC_REGIONS.map((f) => f.key));

interface NytConfig {
  version?: string;
  deliveryTime?: string;
  timezone?: string;
  kindleEmail?: string;
}

interface CbcConfig {
  feeds?: string[];
  maxPerFeed?: number;
  deliveryTime?: string;
  timezone?: string;
  kindleEmail?: string;
}

interface Props {
  nyt: { config: NytConfig; enabled: boolean } | null;
  cbc: { config: CbcConfig; enabled: boolean } | null;
  configured: { nyt: boolean };
}

const VERSIONS = [
  { value: "games", label: "Games (puzzle + solution)" },
  { value: "newspaper", label: "Newspaper" },
  { value: "big", label: "Big (large print)" },
  { value: "southpaw", label: "Southpaw (left-handed)" },
];

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) ?? `Request failed (${res.status})`);
  return data;
}

/** Shared delivery-time / timezone / Kindle-email inputs used by every service. */
function DeliveryFields(props: {
  idPrefix: string;
  time: string;
  setTime: (v: string) => void;
  tz: string;
  setTz: (v: string) => void;
  kindle: string;
  setKindle: (v: string) => void;
}) {
  const { idPrefix } = props;
  return (
    <>
      <div className="row">
        <div className="field">
          <label htmlFor={`${idPrefix}-time`}>Delivery time</label>
          <input
            id={`${idPrefix}-time`}
            type="time"
            value={props.time}
            onChange={(e) => props.setTime(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-tz`}>Timezone (IANA)</label>
          <input
            id={`${idPrefix}-tz`}
            type="text"
            value={props.tz}
            onChange={(e) => props.setTz(e.target.value)}
            placeholder="America/Toronto"
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-kindle`}>Send-to-Kindle email</label>
        <input
          id={`${idPrefix}-kindle`}
          type="email"
          value={props.kindle}
          onChange={(e) => props.setKindle(e.target.value)}
          placeholder="you@kindle.com"
        />
      </div>
    </>
  );
}

export function DashboardForm({ nyt, cbc, configured }: Props) {
  const browserTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/Toronto";

  // NYT crossword
  const [version, setVersion] = useState(nyt?.config.version ?? "games");
  const [nytTime, setNytTime] = useState(nyt?.config.deliveryTime ?? "08:00");
  const [nytTz, setNytTz] = useState(nyt?.config.timezone ?? browserTz);
  const [nytKindle, setNytKindle] = useState(nyt?.config.kindleEmail ?? "");
  const [nytEnabled, setNytEnabled] = useState(nyt?.enabled ?? true);

  // CBC news — saved feeds split into general checkboxes and (at most one) region.
  const savedFeeds = cbc?.config.feeds?.length ? cbc.config.feeds : null;
  const initialGeneral = savedFeeds
    ? savedFeeds.filter((k) => !REGION_KEYS.has(k))
    : CBC_FEEDS.map((f) => f.key);
  const initialRegion = savedFeeds?.find((k) => REGION_KEYS.has(k));
  const [cbcFeeds, setCbcFeeds] = useState<Set<string>>(new Set(initialGeneral));
  const [regionOn, setRegionOn] = useState(Boolean(initialRegion));
  const [regionKey, setRegionKey] = useState(initialRegion ?? "canada-novascotia");
  const [cbcMax, setCbcMax] = useState(cbc?.config.maxPerFeed ?? 9);
  const [cbcTime, setCbcTime] = useState(cbc?.config.deliveryTime ?? "08:00");
  const [cbcTz, setCbcTz] = useState(cbc?.config.timezone ?? browserTz);
  const [cbcKindle, setCbcKindle] = useState(cbc?.config.kindleEmail ?? "");
  const [cbcEnabled, setCbcEnabled] = useState(cbc?.enabled ?? true);

  // Secrets
  const [nytCookie, setNytCookie] = useState("");
  const [nytSaved, setNytSaved] = useState(configured.nyt);

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function ok(text: string) {
    setMessage({ kind: "ok", text });
  }
  function fail(err: unknown) {
    setMessage({ kind: "err", text: err instanceof Error ? err.message : String(err) });
  }
  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  function toggleFeed(key: string) {
    setCbcFeeds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const saveNyt = () =>
    run("nyt-settings", async () => {
      await postJson("/api/subscriptions", {
        service: "nyt-crossword",
        version,
        deliveryTime: nytTime,
        timezone: nytTz,
        kindleEmail: nytKindle,
        enabled: nytEnabled,
      });
      ok("NYT crossword settings saved.");
    });

  const saveCbc = () =>
    run("cbc-settings", async () => {
      await postJson("/api/subscriptions", {
        service: "cbc",
        feeds: [...cbcFeeds, ...(regionOn ? [regionKey] : [])],
        maxPerFeed: cbcMax,
        deliveryTime: cbcTime,
        timezone: cbcTz,
        kindleEmail: cbcKindle,
        enabled: cbcEnabled,
      });
      ok("CBC News settings saved.");
    });

  const saveNytCookie = () =>
    run("nyt-cookie", async () => {
      await postJson("/api/secrets", { provider: "nyt", value: nytCookie });
      setNytSaved(true);
      setNytCookie("");
      ok("NYT cookie stored (encrypted).");
    });

  const sendTest = (service: string, key: string) =>
    run(key, async () => {
      const data = await postJson("/api/deliver-now", { service });
      const result = data.result as { status?: string; error?: string } | undefined;
      if (result?.status === "success") ok("Sent! Check your Kindle inbox.");
      else throw new Error(result?.error ?? "Delivery failed.");
    });

  return (
    <>
      <section className="section">
        <h2>NYT Crossword</h2>
        <p className="hint">Pick a layout and when it should land on your Kindle.</p>

        <div className="field">
          <label htmlFor="version">Layout</label>
          <select id="version" value={version} onChange={(e) => setVersion(e.target.value)}>
            {VERSIONS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <DeliveryFields
          idPrefix="nyt"
          time={nytTime}
          setTime={setNytTime}
          tz={nytTz}
          setTz={setNytTz}
          kindle={nytKindle}
          setKindle={setNytKindle}
        />

        <div className="actions">
          <label className="toggle">
            <input type="checkbox" checked={nytEnabled} onChange={(e) => setNytEnabled(e.target.checked)} />
            Enabled
          </label>
          <button className="button" onClick={saveNyt} disabled={busy !== null}>
            {busy === "nyt-settings" ? "Saving…" : "Save NYT settings"}
          </button>
          <button className="link" onClick={() => sendTest("nyt-crossword", "test-nyt")} disabled={busy !== null}>
            {busy === "test-nyt" ? "Sending…" : "Send test now"}
          </button>
        </div>
      </section>

      <section className="section">
        <h2>CBC News</h2>
        <p className="hint">A daily PDF of CBC headlines and summaries. Choose your sections.</p>

        <div className="field">
          <label>Sections</label>
          <div className="checkgrid">
            {CBC_FEEDS.map((f) => (
              <label key={f.key} className="check">
                <input type="checkbox" checked={cbcFeeds.has(f.key)} onChange={() => toggleFeed(f.key)} />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="cbc-region">Regional news</label>
          <div className="regionrow">
            <label className="check">
              <input type="checkbox" checked={regionOn} onChange={(e) => setRegionOn(e.target.checked)} />
              Include a region
            </label>
            <select
              id="cbc-region"
              value={regionKey}
              onChange={(e) => setRegionKey(e.target.value)}
              disabled={!regionOn}
            >
              {CBC_REGIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field" style={{ maxWidth: 220 }}>
          <label htmlFor="cbc-max">Articles per section</label>
          <input
            id="cbc-max"
            type="number"
            min={1}
            max={15}
            value={cbcMax}
            onChange={(e) => setCbcMax(Math.min(Math.max(Number(e.target.value) || 1, 1), 15))}
          />
        </div>

        <DeliveryFields
          idPrefix="cbc"
          time={cbcTime}
          setTime={setCbcTime}
          tz={cbcTz}
          setTz={setCbcTz}
          kindle={cbcKindle}
          setKindle={setCbcKindle}
        />

        <div className="actions">
          <label className="toggle">
            <input type="checkbox" checked={cbcEnabled} onChange={(e) => setCbcEnabled(e.target.checked)} />
            Enabled
          </label>
          <button
            className="button"
            onClick={saveCbc}
            disabled={busy !== null || (cbcFeeds.size === 0 && !regionOn)}
          >
            {busy === "cbc-settings" ? "Saving…" : "Save CBC settings"}
          </button>
          <button className="link" onClick={() => sendTest("cbc", "test-cbc")} disabled={busy !== null}>
            {busy === "test-cbc" ? "Sending…" : "Send test now"}
          </button>
        </div>
      </section>

      <section className="section">
        <h2>
          NYT cookie <span className={`badge${nytSaved ? " on" : ""}`}>{nytSaved ? "stored" : "not set"}</span>
        </h2>
        <p className="hint">
          Paste your logged-in nytimes.com cookie string (must include the <code>NYT-S</code> token). Stored
          encrypted; never shown again. Only needed for the crossword.
        </p>
        <div className="field">
          <textarea
            value={nytCookie}
            onChange={(e) => setNytCookie(e.target.value)}
            placeholder="NYT-S=...; nyt-a=...; ..."
          />
        </div>
        <button className="button" onClick={saveNytCookie} disabled={busy !== null || nytCookie.trim() === ""}>
          {busy === "nyt-cookie" ? "Saving…" : "Save NYT cookie"}
        </button>
      </section>

      <section className="section">
        <h2>Kindle setup</h2>
        <p className="hint">
          Daily Scribe sends everything from one address. Add <code>my@dailyscribe.ca</code> to your
          Kindle&apos;s “Approved Personal Document E-mail List” — once — under Amazon&apos;s{" "}
          <em>Manage Your Content &amp; Devices → Preferences → Personal Document Settings</em>. That&apos;s
          it: no email credentials to share, and new services need no extra setup.
        </p>
      </section>

      {message && <p className={`message ${message.kind}`}>{message.text}</p>}
    </>
  );
}
