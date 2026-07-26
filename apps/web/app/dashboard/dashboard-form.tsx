"use client";

import { useState } from "react";
import { CBC_FEEDS, CBC_REGIONS } from "@/lib/cbc-feeds";

const REGION_KEYS = new Set(CBC_REGIONS.map((f) => f.key));

interface CbcConfig {
  feeds?: string[];
  maxPerFeed?: number;
  deliveryTime?: string;
  timezone?: string;
  kindleEmail?: string;
}

interface HaConfig {
  weatherEntity?: string;
  wasteCalendar?: string;
  deliveryTime?: string;
  timezone?: string;
  kindleEmail?: string;
}

interface Props {
  cbc: { config: CbcConfig; enabled: boolean } | null;
  ha?: { config: HaConfig; enabled: boolean } | null;
  configured?: { ha: boolean; haUrl?: string };
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errorMsg =
      (data.error as string) ??
      (data.result as { error?: string })?.error ??
      `Request failed (${res.status})`;
    throw new Error(errorMsg);
  }
  return data;
}

/** Shared delivery-time & timezone inputs used by every service. */
function DeliveryFields(props: {
  idPrefix: string;
  time: string;
  setTime: (v: string) => void;
  tz: string;
  setTz: (v: string) => void;
}) {
  const { idPrefix } = props;
  return (
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
  );
}

export function DashboardForm({ cbc, ha, configured }: Props) {
  const browserTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/Toronto";

  // Initial values snapshot for dirty checking
  const initialKindleEmail = cbc?.config.kindleEmail ?? ha?.config.kindleEmail ?? "";
  const initialHaUrl = configured?.haUrl ?? "";

  const savedFeeds = cbc?.config.feeds?.length ? cbc.config.feeds : null;
  const initialGeneral = savedFeeds
    ? savedFeeds.filter((k) => !REGION_KEYS.has(k))
    : CBC_FEEDS.map((f) => f.key);
  const initialRegion = savedFeeds?.find((k) => REGION_KEYS.has(k));

  const initialCbc = {
    feeds: new Set(initialGeneral),
    regionOn: Boolean(initialRegion),
    regionKey: initialRegion ?? "canada-novascotia",
    maxPerFeed: cbc?.config.maxPerFeed ?? 9,
    deliveryTime: cbc?.config.deliveryTime ?? "08:00",
    timezone: cbc?.config.timezone ?? browserTz,
    enabled: cbc?.enabled ?? true,
  };

  const initialHa = {
    weatherEntity: ha?.config.weatherEntity ?? "weather.forecast_home",
    wasteCalendar: ha?.config.wasteCalendar ?? "calendar.halifax_ns",
    deliveryTime: ha?.config.deliveryTime ?? "08:00",
    timezone: ha?.config.timezone ?? browserTz,
    enabled: ha?.enabled ?? true,
  };

  // State
  const [kindleEmail, setKindleEmail] = useState(initialKindleEmail);

  // CBC State
  const [cbcFeeds, setCbcFeeds] = useState<Set<string>>(initialCbc.feeds);
  const [regionOn, setRegionOn] = useState(initialCbc.regionOn);
  const [regionKey, setRegionKey] = useState(initialCbc.regionKey);
  const [cbcMax, setCbcMax] = useState(initialCbc.maxPerFeed);
  const [cbcTime, setCbcTime] = useState(initialCbc.deliveryTime);
  const [cbcTz, setCbcTz] = useState(initialCbc.timezone);
  const [cbcEnabled, setCbcEnabled] = useState(initialCbc.enabled);

  // HA State
  const [haUrl, setHaUrl] = useState(initialHaUrl);
  const [haToken, setHaToken] = useState("");
  const [haSaved, setHaSaved] = useState(Boolean(configured?.ha));
  const [weatherEntity, setWeatherEntity] = useState(initialHa.weatherEntity);
  const [wasteCalendar, setWasteCalendar] = useState(initialHa.wasteCalendar);
  const [haTime, setHaTime] = useState(initialHa.deliveryTime);
  const [haTz, setHaTz] = useState(initialHa.timezone);
  const [haEnabled, setHaEnabled] = useState(initialHa.enabled);

  // Baseline reference snapshot to compare dirty status against
  const [baseKindle, setBaseKindle] = useState(initialKindleEmail);
  const [baseCbc, setBaseCbc] = useState(initialCbc);
  const [baseHa, setBaseHa] = useState(initialHa);
  const [baseHaUrl, setBaseHaUrl] = useState(initialHaUrl);

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Dirty checking
  const cbcFeedsChanged =
    cbcFeeds.size !== baseCbc.feeds.size || [...cbcFeeds].some((f) => !baseCbc.feeds.has(f));
  const isCbcDirty =
    cbcFeedsChanged ||
    regionOn !== baseCbc.regionOn ||
    regionKey !== baseCbc.regionKey ||
    cbcMax !== baseCbc.maxPerFeed ||
    cbcTime !== baseCbc.deliveryTime ||
    cbcTz !== baseCbc.timezone ||
    cbcEnabled !== baseCbc.enabled;

  const isHaCredsDirty = haUrl.trim() !== baseHaUrl.trim() || Boolean(haToken.trim());

  const isHaSettingsDirty =
    weatherEntity !== baseHa.weatherEntity ||
    wasteCalendar !== baseHa.wasteCalendar ||
    haTime !== baseHa.deliveryTime ||
    haTz !== baseHa.timezone ||
    haEnabled !== baseHa.enabled;

  const isKindleDirty = kindleEmail !== baseKindle;

  const isDirty = isKindleDirty || isCbcDirty || isHaCredsDirty || isHaSettingsDirty;

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

  const saveAll = () =>
    run("save-all", async () => {
      if (!kindleEmail.includes("@")) {
        throw new Error("A valid Send-to-Kindle email is required under Kindle setup.");
      }

      // 1. Save HA credentials if changed or entered
      if (haUrl.trim() !== baseHaUrl.trim() || haToken.trim()) {
        await postJson("/api/secrets", {
          provider: "ha",
          value: { url: haUrl.trim(), token: haToken.trim() },
        });
        setHaSaved(true);
        setHaToken("");
        setBaseHaUrl(haUrl.trim());
      }

      // 2. Save CBC settings
      await postJson("/api/subscriptions", {
        service: "cbc",
        feeds: [...cbcFeeds, ...(regionOn ? [regionKey] : [])],
        maxPerFeed: cbcMax,
        deliveryTime: cbcTime,
        timezone: cbcTz,
        kindleEmail: kindleEmail.trim(),
        enabled: cbcEnabled,
      });

      // 3. Save HA settings
      await postJson("/api/subscriptions", {
        service: "ha-summary",
        weatherEntity,
        wasteCalendar,
        deliveryTime: haTime,
        timezone: haTz,
        kindleEmail: kindleEmail.trim(),
        enabled: haEnabled,
      });

      // Update baseline snapshots
      setBaseKindle(kindleEmail.trim());
      setBaseCbc({
        feeds: new Set(cbcFeeds),
        regionOn,
        regionKey,
        maxPerFeed: cbcMax,
        deliveryTime: cbcTime,
        timezone: cbcTz,
        enabled: cbcEnabled,
      });
      setBaseHa({
        weatherEntity,
        wasteCalendar,
        deliveryTime: haTime,
        timezone: haTz,
        enabled: haEnabled,
      });

      ok("All settings saved successfully.");
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
      {/* Kindle Setup Section */}
      <section className="section">
        <h2>Kindle setup</h2>
        <p className="hint">
          Daily Scribe sends everything from one address. Add <code>my@dailyscribe.ca</code> to your
          Kindle&apos;s “Approved Personal Document E-mail List” — once — under Amazon&apos;s{" "}
          <em>Manage Your Content &amp; Devices → Preferences → Personal Document Settings</em>.
        </p>
        <div className="field">
          <label htmlFor="global-kindle-email">Send-to-Kindle email</label>
          <input
            id="global-kindle-email"
            type="email"
            value={kindleEmail}
            onChange={(e) => setKindleEmail(e.target.value)}
            placeholder="you@kindle.com"
          />
        </div>
      </section>

      {/* CBC News Section */}
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
        />

        <div className="actions">
          <label className="toggle">
            <input type="checkbox" checked={cbcEnabled} onChange={(e) => setCbcEnabled(e.target.checked)} />
            Enabled
          </label>
          <button className="link" onClick={() => sendTest("cbc", "test-cbc")} disabled={busy !== null}>
            {busy === "test-cbc" ? "Sending…" : "Send test now"}
          </button>
        </div>
      </section>

      {/* Home Assistant Credentials Section */}
      <section className="section">
        <h2>
          Home Assistant credentials{" "}
          <span className={`badge${haSaved ? " on" : ""}`}>{haSaved ? "stored" : "not set"}</span>
        </h2>
        <p className="hint">
          Connect to your Home Assistant instance using your URL and a Long-Lived Access Token. Credentials are stored encrypted at rest.
        </p>

        <div className="field">
          <label htmlFor="ha-url">Home Assistant Base URL</label>
          <input
            id="ha-url"
            type="url"
            value={haUrl}
            onChange={(e) => setHaUrl(e.target.value)}
            placeholder="http://192.168.68.104:8123 or https://your-ha.nabu.casa"
          />
        </div>

        <div className="field">
          <label htmlFor="ha-token">Long-Lived Access Token</label>
          <input
            id="ha-token"
            type="password"
            value={haToken}
            onChange={(e) => setHaToken(e.target.value)}
            placeholder={haSaved ? "******************************" : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
          />
        </div>
      </section>

      {/* Home Assistant Summary Section */}
      <section className="section">
        <h2>Home Assistant Summary</h2>
        <p className="hint">Daily morning PDF briefing of your home status, 12h weather forecast, climate, and security alerts.</p>

        <div className="row">
          <div className="field">
            <label htmlFor="weather-entity">Weather Entity</label>
            <input
              id="weather-entity"
              type="text"
              value={weatherEntity}
              onChange={(e) => setWeatherEntity(e.target.value)}
              placeholder="weather.forecast_home"
            />
          </div>
          <div className="field">
            <label htmlFor="waste-calendar">Waste Calendar Entity</label>
            <input
              id="waste-calendar"
              type="text"
              value={wasteCalendar}
              onChange={(e) => setWasteCalendar(e.target.value)}
              placeholder="calendar.halifax_ns"
            />
          </div>
        </div>

        <DeliveryFields
          idPrefix="ha"
          time={haTime}
          setTime={setHaTime}
          tz={haTz}
          setTz={setHaTz}
        />

        <div className="actions">
          <label className="toggle">
            <input type="checkbox" checked={haEnabled} onChange={(e) => setHaEnabled(e.target.checked)} />
            Enabled
          </label>
          <button className="link" onClick={() => sendTest("ha-summary", "test-ha")} disabled={busy !== null}>
            {busy === "test-ha" ? "Sending…" : "Send test now"}
          </button>
        </div>
      </section>

      {/* Single Unified Save Button at bottom */}
      <section className="section" style={{ borderTop: "2px solid #eaeaea", paddingTop: 16 }}>
        <button
          className="button"
          onClick={saveAll}
          disabled={busy !== null || !isDirty}
          style={{ width: "100%", padding: "12px 20px", fontSize: 16 }}
        >
          {busy === "save-all" ? "Saving changes…" : "Save changes"}
        </button>
      </section>

      {message && <p className={`message ${message.kind}`}>{message.text}</p>}
    </>
  );
}
