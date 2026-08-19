"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BBC_FEEDS } from "@/lib/bbc-feeds";
import { CBC_FEEDS, CBC_REGIONS } from "@/lib/cbc-feeds";
import { RTE_FEEDS } from "@/lib/rte-feeds";
import { TabNav, type TabDef } from "./tab-nav";

const TAB_KEYS = ["delivery", "rte", "cbc", "bbc", "home-assistant", "kanji"] as const;
type TabKey = (typeof TAB_KEYS)[number];
const DEFAULT_TAB: TabKey = "delivery";

const REGION_KEYS = new Set(CBC_REGIONS.map((f) => f.key));

const IANA_TIMEZONES: string[] =
  typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [];

interface CbcConfig {
  feeds?: string[];
  maxPerFeed?: number;
  deliveryTime?: string;
  timezone?: string;
  kindleEmail?: string;
}

interface BbcConfig {
  feeds?: string[];
  maxPerFeed?: number;
  deliveryTime?: string;
  timezone?: string;
  kindleEmail?: string;
}

interface RteConfig {
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

interface KanjiConfig {
  kanjiPerDay?: number;
  maxJlptLevel?: number;
  deliveryTime?: string;
  timezone?: string;
  kindleEmail?: string;
}

const JLPT_LEVELS = [5, 4, 3, 2, 1] as const;

interface Props {
  cbc: { config: CbcConfig; enabled: boolean } | null;
  bbc?: { config: BbcConfig; enabled: boolean } | null;
  rte?: { config: RteConfig; enabled: boolean } | null;
  ha?: { config: HaConfig; enabled: boolean } | null;
  kanji?: { config: KanjiConfig; enabled: boolean } | null;
  /** Whether "send all enabled services as one PDF" is on. Membership is
   *  implicit — whichever services are enabled elsewhere — so there's no
   *  separate config to pass here. */
  digestEnabled?: boolean;
  configured?: { ha: boolean; haUrl?: string };
  /** Server-rendered content (e.g. the Kanji check-in status) shown above the
   *  Save button, so the button stays the last element on the page. */
  afterFields?: ReactNode;
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

/** Shared delivery-time & timezone inputs, used once for all services. */
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
        {IANA_TIMEZONES.length > 0 ? (
          <select id={`${idPrefix}-tz`} value={props.tz} onChange={(e) => props.setTz(e.target.value)}>
            {!IANA_TIMEZONES.includes(props.tz) && <option value={props.tz}>{props.tz}</option>}
            {IANA_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`${idPrefix}-tz`}
            type="text"
            value={props.tz}
            onChange={(e) => props.setTz(e.target.value)}
            placeholder="America/Toronto"
          />
        )}
      </div>
    </div>
  );
}

export function DashboardForm({ cbc, bbc, rte, ha, kanji, digestEnabled: initialDigestEnabled, configured, afterFields }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabKey = (TAB_KEYS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as TabKey)
    : DEFAULT_TAB;

  function setTab(key: string) {
    router.replace(`${pathname}?tab=${key}`, { scroll: false });
  }

  const browserTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/Toronto";

  // Initial values snapshot for dirty checking
  const initialKindleEmail =
    cbc?.config.kindleEmail ??
    bbc?.config.kindleEmail ??
    rte?.config.kindleEmail ??
    ha?.config.kindleEmail ??
    kanji?.config.kindleEmail ??
    "";
  const initialHaUrl = configured?.haUrl ?? "";

  const initialDelivery = {
    time:
      cbc?.config.deliveryTime ??
      bbc?.config.deliveryTime ??
      rte?.config.deliveryTime ??
      ha?.config.deliveryTime ??
      kanji?.config.deliveryTime ??
      "08:00",
    timezone:
      cbc?.config.timezone ??
      bbc?.config.timezone ??
      rte?.config.timezone ??
      ha?.config.timezone ??
      kanji?.config.timezone ??
      browserTz,
  };

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
    enabled: cbc?.enabled ?? true,
  };

  const initialBbc = {
    feeds: new Set(bbc?.config.feeds?.length ? bbc.config.feeds : BBC_FEEDS.map((f) => f.key)),
    maxPerFeed: bbc?.config.maxPerFeed ?? 9,
    enabled: bbc?.enabled ?? true,
  };

  const initialRte = {
    feeds: new Set(rte?.config.feeds?.length ? rte.config.feeds : RTE_FEEDS.map((f) => f.key)),
    maxPerFeed: rte?.config.maxPerFeed ?? 9,
    enabled: rte?.enabled ?? true,
  };

  const initialHa = {
    weatherEntity: ha?.config.weatherEntity ?? "weather.forecast_home",
    wasteCalendar: ha?.config.wasteCalendar ?? "calendar.halifax_ns",
    enabled: ha?.enabled ?? true,
  };

  const initialKanji = {
    kanjiPerDay: kanji?.config.kanjiPerDay ?? 3,
    maxJlptLevel: kanji?.config.maxJlptLevel ?? 5,
    enabled: kanji?.enabled ?? true,
  };

  // State
  const [kindleEmail, setKindleEmail] = useState(initialKindleEmail);
  const [deliveryTime, setDeliveryTime] = useState(initialDelivery.time);
  const [deliveryTz, setDeliveryTz] = useState(initialDelivery.timezone);

  // CBC State
  const [cbcFeeds, setCbcFeeds] = useState<Set<string>>(initialCbc.feeds);
  const [regionOn, setRegionOn] = useState(initialCbc.regionOn);
  const [regionKey, setRegionKey] = useState(initialCbc.regionKey);
  const [cbcMax, setCbcMax] = useState(initialCbc.maxPerFeed);
  const [cbcEnabled, setCbcEnabled] = useState(initialCbc.enabled);

  // BBC State
  const [bbcFeeds, setBbcFeeds] = useState<Set<string>>(initialBbc.feeds);
  const [bbcMax, setBbcMax] = useState(initialBbc.maxPerFeed);
  const [bbcEnabled, setBbcEnabled] = useState(initialBbc.enabled);

  // RTÉ State
  const [rteFeeds, setRteFeeds] = useState<Set<string>>(initialRte.feeds);
  const [rteMax, setRteMax] = useState(initialRte.maxPerFeed);
  const [rteEnabled, setRteEnabled] = useState(initialRte.enabled);

  // HA State
  const [haUrl, setHaUrl] = useState(initialHaUrl);
  const [haToken, setHaToken] = useState("");
  const [haSaved, setHaSaved] = useState(Boolean(configured?.ha));
  const [weatherEntity, setWeatherEntity] = useState(initialHa.weatherEntity);
  const [wasteCalendar, setWasteCalendar] = useState(initialHa.wasteCalendar);
  const [haEnabled, setHaEnabled] = useState(initialHa.enabled);

  // Kanji State
  const [kanjiPerDay, setKanjiPerDay] = useState(initialKanji.kanjiPerDay);
  const [maxJlptLevel, setMaxJlptLevel] = useState(initialKanji.maxJlptLevel);
  const [kanjiEnabled, setKanjiEnabled] = useState(initialKanji.enabled);

  // Digest State — "send all enabled services as one PDF", using the same
  // shared delivery time/timezone/kindle email as everything else.
  const [digestEnabled, setDigestEnabled] = useState(initialDigestEnabled ?? false);

  // Baseline reference snapshot to compare dirty status against
  const [baseKindle, setBaseKindle] = useState(initialKindleEmail);
  const [baseDelivery, setBaseDelivery] = useState(initialDelivery);
  const [baseCbc, setBaseCbc] = useState(initialCbc);
  const [baseBbc, setBaseBbc] = useState(initialBbc);
  const [baseRte, setBaseRte] = useState(initialRte);
  const [baseHa, setBaseHa] = useState(initialHa);
  const [baseHaUrl, setBaseHaUrl] = useState(initialHaUrl);
  const [baseKanji, setBaseKanji] = useState(initialKanji);
  const [baseDigestEnabled, setBaseDigestEnabled] = useState(initialDigestEnabled ?? false);

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Dirty checking
  const isDeliveryDirty = deliveryTime !== baseDelivery.time || deliveryTz !== baseDelivery.timezone;

  const cbcFeedsChanged =
    cbcFeeds.size !== baseCbc.feeds.size || [...cbcFeeds].some((f) => !baseCbc.feeds.has(f));
  const isCbcDirty =
    cbcFeedsChanged ||
    regionOn !== baseCbc.regionOn ||
    regionKey !== baseCbc.regionKey ||
    cbcMax !== baseCbc.maxPerFeed ||
    cbcEnabled !== baseCbc.enabled;

  const bbcFeedsChanged =
    bbcFeeds.size !== baseBbc.feeds.size || [...bbcFeeds].some((f) => !baseBbc.feeds.has(f));
  const isBbcDirty = bbcFeedsChanged || bbcMax !== baseBbc.maxPerFeed || bbcEnabled !== baseBbc.enabled;

  const rteFeedsChanged =
    rteFeeds.size !== baseRte.feeds.size || [...rteFeeds].some((f) => !baseRte.feeds.has(f));
  const isRteDirty = rteFeedsChanged || rteMax !== baseRte.maxPerFeed || rteEnabled !== baseRte.enabled;

  const isHaCredsDirty = haUrl.trim() !== baseHaUrl.trim() || Boolean(haToken.trim());

  const isHaSettingsDirty =
    weatherEntity !== baseHa.weatherEntity ||
    wasteCalendar !== baseHa.wasteCalendar ||
    haEnabled !== baseHa.enabled;

  const isKindleDirty = kindleEmail !== baseKindle;

  const isKanjiDirty =
    kanjiPerDay !== baseKanji.kanjiPerDay ||
    maxJlptLevel !== baseKanji.maxJlptLevel ||
    kanjiEnabled !== baseKanji.enabled;

  const isDigestDirty = digestEnabled !== baseDigestEnabled;

  const isDirty =
    isKindleDirty ||
    isDeliveryDirty ||
    isCbcDirty ||
    isBbcDirty ||
    isRteDirty ||
    isHaCredsDirty ||
    isHaSettingsDirty ||
    isKanjiDirty ||
    isDigestDirty;

  const tabs: TabDef[] = [
    {
      key: "delivery",
      label: "Delivery",
      icon: "📬",
      dirty: isKindleDirty || isDeliveryDirty || isDigestDirty,
    },
    { key: "rte", label: "RTÉ News", icon: "📰", iconSrc: "/icons/rte.svg", dirty: isRteDirty },
    { key: "cbc", label: "CBC News", icon: "📰", iconSrc: "/icons/cbc.svg", dirty: isCbcDirty },
    { key: "bbc", label: "BBC News", icon: "📰", iconSrc: "/icons/bbc.svg", dirty: isBbcDirty },
    {
      key: "home-assistant",
      label: "Home Assistant",
      icon: "🏠",
      iconSrc: "/icons/home-assistant.svg",
      dirty: isHaCredsDirty || isHaSettingsDirty,
    },
    { key: "kanji", label: "Kanji", icon: "🈷️", dirty: isKanjiDirty },
  ];

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

  function toggleBbcFeed(key: string) {
    setBbcFeeds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleRteFeed(key: string) {
    setRteFeeds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const saveAll = () =>
    run("save-all", async () => {
      if (!kindleEmail.includes("@")) {
        throw new Error("A valid Send-to-Kindle email is required under Delivery setup.");
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
        deliveryTime,
        timezone: deliveryTz,
        kindleEmail: kindleEmail.trim(),
        enabled: cbcEnabled,
      });

      // 3. Save BBC settings
      await postJson("/api/subscriptions", {
        service: "bbc",
        feeds: [...bbcFeeds],
        maxPerFeed: bbcMax,
        deliveryTime,
        timezone: deliveryTz,
        kindleEmail: kindleEmail.trim(),
        enabled: bbcEnabled,
      });

      // 4. Save RTÉ settings
      await postJson("/api/subscriptions", {
        service: "rte",
        feeds: [...rteFeeds],
        maxPerFeed: rteMax,
        deliveryTime,
        timezone: deliveryTz,
        kindleEmail: kindleEmail.trim(),
        enabled: rteEnabled,
      });

      // 5. Save HA settings
      await postJson("/api/subscriptions", {
        service: "ha-summary",
        weatherEntity,
        wasteCalendar,
        deliveryTime,
        timezone: deliveryTz,
        kindleEmail: kindleEmail.trim(),
        enabled: haEnabled,
      });

      // 6. Save Kanji settings
      await postJson("/api/subscriptions", {
        service: "kanji",
        kanjiPerDay,
        maxJlptLevel,
        deliveryTime,
        timezone: deliveryTz,
        kindleEmail: kindleEmail.trim(),
        enabled: kanjiEnabled,
      });

      // 7. Save Digest setting (bundles whichever services above are enabled)
      await postJson("/api/subscriptions", {
        service: "digest",
        deliveryTime,
        timezone: deliveryTz,
        kindleEmail: kindleEmail.trim(),
        enabled: digestEnabled,
      });

      // Update baseline snapshots
      setBaseKindle(kindleEmail.trim());
      setBaseDelivery({ time: deliveryTime, timezone: deliveryTz });
      setBaseCbc({
        feeds: new Set(cbcFeeds),
        regionOn,
        regionKey,
        maxPerFeed: cbcMax,
        enabled: cbcEnabled,
      });
      setBaseBbc({
        feeds: new Set(bbcFeeds),
        maxPerFeed: bbcMax,
        enabled: bbcEnabled,
      });
      setBaseRte({
        feeds: new Set(rteFeeds),
        maxPerFeed: rteMax,
        enabled: rteEnabled,
      });
      setBaseHa({
        weatherEntity,
        wasteCalendar,
        enabled: haEnabled,
      });
      setBaseKanji({
        kanjiPerDay,
        maxJlptLevel,
        enabled: kanjiEnabled,
      });
      setBaseDigestEnabled(digestEnabled);

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
      <TabNav tabs={tabs} active={activeTab} onChange={setTab} />

      {/* Delivery Setup Section */}
      <div hidden={activeTab !== "delivery"}>
      <section className="section">
        <h2>Delivery setup</h2>
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

        <DeliveryFields
          idPrefix="delivery"
          time={deliveryTime}
          setTime={setDeliveryTime}
          tz={deliveryTz}
          setTz={setDeliveryTz}
        />

        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={digestEnabled}
              onChange={(e) => setDigestEnabled(e.target.checked)}
            />
            Send all selected Daily Scribe services as a single PDF
          </label>
        </div>

        {digestEnabled && (
          <div className="actions">
            <button className="link" onClick={() => sendTest("digest", "test-digest")} disabled={busy !== null}>
              {busy === "test-digest" ? "Sending…" : "Send test now"}
            </button>
          </div>
        )}
      </section>
      </div>

      {/* RTÉ News Section */}
      <div hidden={activeTab !== "rte"}>
      <section className="section">
        <h2>RTÉ News</h2>
        <p className="hint">A daily PDF of RTÉ headlines and summaries. Choose your sections.</p>

        <div className="field">
          <label>Sections</label>
          <div className="checkgrid">
            {RTE_FEEDS.map((f) => (
              <label key={f.key} className="check">
                <input type="checkbox" checked={rteFeeds.has(f.key)} onChange={() => toggleRteFeed(f.key)} />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        <div className="field" style={{ maxWidth: 220 }}>
          <label htmlFor="rte-max">Articles per section</label>
          <input
            id="rte-max"
            type="number"
            min={1}
            max={15}
            value={rteMax}
            onChange={(e) => setRteMax(Math.min(Math.max(Number(e.target.value) || 1, 1), 15))}
          />
        </div>

        <div className="actions">
          <label className="toggle">
            <input type="checkbox" checked={rteEnabled} onChange={(e) => setRteEnabled(e.target.checked)} />
            Enabled
          </label>
          <button className="link" onClick={() => sendTest("rte", "test-rte")} disabled={busy !== null}>
            {busy === "test-rte" ? "Sending…" : "Send test now"}
          </button>
        </div>
        {digestEnabled && (
          <p className="hint">Digest is on — this sends your bundled digest, not a standalone RTÉ PDF.</p>
        )}
      </section>
      </div>

      {/* CBC News Section */}
      <div hidden={activeTab !== "cbc"}>
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

        <div className="actions">
          <label className="toggle">
            <input type="checkbox" checked={cbcEnabled} onChange={(e) => setCbcEnabled(e.target.checked)} />
            Enabled
          </label>
          <button className="link" onClick={() => sendTest("cbc", "test-cbc")} disabled={busy !== null}>
            {busy === "test-cbc" ? "Sending…" : "Send test now"}
          </button>
        </div>
        {digestEnabled && (
          <p className="hint">Digest is on — this sends your bundled digest, not a standalone CBC PDF.</p>
        )}
      </section>
      </div>

      {/* BBC News Section */}
      <div hidden={activeTab !== "bbc"}>
      <section className="section">
        <h2>BBC News</h2>
        <p className="hint">A daily PDF of BBC headlines and summaries. Choose your sections.</p>

        <div className="field">
          <label>Sections</label>
          <div className="checkgrid">
            {BBC_FEEDS.map((f) => (
              <label key={f.key} className="check">
                <input type="checkbox" checked={bbcFeeds.has(f.key)} onChange={() => toggleBbcFeed(f.key)} />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        <div className="field" style={{ maxWidth: 220 }}>
          <label htmlFor="bbc-max">Articles per section</label>
          <input
            id="bbc-max"
            type="number"
            min={1}
            max={15}
            value={bbcMax}
            onChange={(e) => setBbcMax(Math.min(Math.max(Number(e.target.value) || 1, 1), 15))}
          />
        </div>

        <div className="actions">
          <label className="toggle">
            <input type="checkbox" checked={bbcEnabled} onChange={(e) => setBbcEnabled(e.target.checked)} />
            Enabled
          </label>
          <button className="link" onClick={() => sendTest("bbc", "test-bbc")} disabled={busy !== null}>
            {busy === "test-bbc" ? "Sending…" : "Send test now"}
          </button>
        </div>
        {digestEnabled && (
          <p className="hint">Digest is on — this sends your bundled digest, not a standalone BBC PDF.</p>
        )}
      </section>
      </div>

      {/* Home Assistant Credentials Section */}
      <div hidden={activeTab !== "home-assistant"}>
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

        <div className="actions">
          <label className="toggle">
            <input type="checkbox" checked={haEnabled} onChange={(e) => setHaEnabled(e.target.checked)} />
            Enabled
          </label>
          <button className="link" onClick={() => sendTest("ha-summary", "test-ha")} disabled={busy !== null}>
            {busy === "test-ha" ? "Sending…" : "Send test now"}
          </button>
        </div>
        {digestEnabled && (
          <p className="hint">Digest is on — this sends your bundled digest, not a standalone Home Assistant PDF.</p>
        )}
      </section>
      </div>

      {/* Kanji A Day Section */}
      <div hidden={activeTab !== "kanji"}>
      <section className="section">
        <h2>Kanji A Day</h2>
        <p className="hint">
          A daily kanji practice sheet — stroke order, readings, an example word, and a writing
          grid. Each day introduces new kanji; nothing repeats until you reach the end of the level.
        </p>

        <div className="row">
          <div className="field" style={{ maxWidth: 220 }}>
            <label htmlFor="kanji-per-day">New kanji per day</label>
            <input
              id="kanji-per-day"
              type="number"
              min={1}
              max={10}
              value={kanjiPerDay}
              onChange={(e) => setKanjiPerDay(Math.min(Math.max(Number(e.target.value) || 1, 1), 10))}
            />
          </div>
          <div className="field" style={{ maxWidth: 220 }}>
            <label htmlFor="kanji-level">Study up to</label>
            <select
              id="kanji-level"
              value={maxJlptLevel}
              onChange={(e) => setMaxJlptLevel(Number(e.target.value))}
            >
              {JLPT_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  JLPT N{lvl}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="actions">
          <label className="toggle">
            <input type="checkbox" checked={kanjiEnabled} onChange={(e) => setKanjiEnabled(e.target.checked)} />
            Enabled
          </label>
          <button className="link" onClick={() => sendTest("kanji", "test-kanji")} disabled={busy !== null}>
            {busy === "test-kanji" ? "Sending…" : "Send test now"}
          </button>
        </div>
        {digestEnabled && (
          <p className="hint">Digest is on — this sends your bundled digest, not a standalone Kanji PDF.</p>
        )}
      </section>

      {afterFields}
      </div>

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
