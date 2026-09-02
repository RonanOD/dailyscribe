"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BBC_FEEDS } from "@/lib/bbc-feeds";
import { CBC_FEEDS } from "@/lib/cbc-feeds";
import { RTE_FEEDS } from "@/lib/rte-feeds";
import type { ServiceCatalogEntry } from "@/lib/service-catalog";
import { DeliveryFields } from "../dashboard/delivery-fields";
import { KindleSetupGuide } from "./kindle-setup-guide";

const STEPS = ["Kindle setup", "Pick services", "Schedule"] as const;

/** Default feed key lists sent at creation so a new subscriber starts with the
 *  curated set spelled out (the plugin also falls back to these if omitted). */
const DEFAULT_FEEDS: Record<string, string[]> = {
  cbc: CBC_FEEDS.map((f) => f.key),
  bbc: BBC_FEEDS.map((f) => f.key),
  rte: RTE_FEEDS.map((f) => f.key),
};

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((data.error as string) ?? `Request failed (${res.status})`);
  }
  return data;
}

export function OnboardingFlow({
  email,
  services,
}: {
  email: string;
  services: ServiceCatalogEntry[];
}) {
  const router = useRouter();
  const browserTz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "America/Toronto";

  const [step, setStep] = useState(0);

  // Step 1 — Kindle setup
  const [kindleEmail, setKindleEmail] = useState("");
  const [whitelisted, setWhitelisted] = useState(false);

  // Step 2 — service picks (+ Home Assistant credentials if picked)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [haUrl, setHaUrl] = useState("");
  const [haToken, setHaToken] = useState("");

  // Step 3 — schedule
  const [deliveryTime, setDeliveryTime] = useState("08:00");
  const [deliveryTz, setDeliveryTz] = useState(browserTz);
  const [bundle, setBundle] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(
    () => new Map<string, ServiceCatalogEntry>(services.map((s) => [s.id, s])),
    [services],
  );
  const needsHa = useMemo(
    () => [...selected].some((id) => byId.get(id)?.needsSecret === "ha"),
    [selected, byId],
  );

  const step1Ok = kindleEmail.includes("@") && whitelisted;
  const step2Ok = selected.size > 0 && (!needsHa || (haUrl.trim() !== "" && haToken.trim() !== ""));

  function toggleService(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const base = {
        deliveryTime,
        timezone: deliveryTz,
        kindleEmail: kindleEmail.trim(),
      };

      if (needsHa) {
        await postJson("/api/secrets", {
          provider: "ha",
          value: { url: haUrl.trim(), token: haToken.trim() },
        });
      }

      // Create rows in catalog order so a later digest lists them predictably.
      for (const svc of services) {
        if (!selected.has(svc.id)) continue;
        const body: Record<string, unknown> = { service: svc.id, ...base, enabled: true };
        if (DEFAULT_FEEDS[svc.id]) {
          body.feeds = DEFAULT_FEEDS[svc.id];
          body.maxPerFeed = 9;
        }
        await postJson("/api/subscriptions", body);
      }

      if (bundle) {
        await postJson("/api/subscriptions", { service: "digest", ...base, enabled: true });
      }

      await postJson("/api/onboarding/complete", {});
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="onboarding-flow">
      <ol className="onboard-progress">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "active" : undefined}>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="section">
          <h2>Get your Kindle ready</h2>
          {email && <p className="hint">Signed in as {email}.</p>}
          <KindleSetupGuide />
          <div className="field">
            <label htmlFor="onboard-kindle-email">Your Send-to-Kindle email</label>
            <input
              id="onboard-kindle-email"
              type="email"
              value={kindleEmail}
              onChange={(e) => setKindleEmail(e.target.value)}
              placeholder="you@kindle.com"
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={whitelisted}
              onChange={(e) => setWhitelisted(e.target.checked)}
            />
            {/* Wrap in a span so the nested <code> doesn't become its own flex
                item inside .check (which would eat the spaces around it). */}
            <span>
              I&apos;ve added <code>my@dailyscribe.ca</code> to my Approved list
            </span>
          </label>
        </section>
      )}

      {step === 1 && (
        <section className="section">
          <h2>Pick your daily services</h2>
          <p className="hint">You can add, remove, or fine-tune any of these later.</p>
          <div className="service-cards">
            {services.map((svc) => {
              const on = selected.has(svc.id);
              return (
                <button
                  key={svc.id}
                  type="button"
                  className={`service-card${on ? " selected" : ""}`}
                  aria-pressed={on}
                  disabled={svc.comingSoon}
                  onClick={() => toggleService(svc.id)}
                >
                  <span className="service-card-icon" aria-hidden="true">
                    {svc.iconSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={svc.iconSrc} alt="" width={22} height={22} />
                    ) : (
                      svc.icon
                    )}
                  </span>
                  <span>
                    <span className="service-card-title">
                      {svc.label}
                      {svc.comingSoon && " (coming soon)"}
                    </span>
                    <span className="service-card-blurb">{svc.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {needsHa && (
            <div className="ha-creds">
              <h3>Home Assistant connection</h3>
              <p className="hint">
                Stored encrypted at rest. The URL must be reachable from the public internet.
              </p>
              <div className="field">
                <label htmlFor="onboard-ha-url">Home Assistant Base URL</label>
                <input
                  id="onboard-ha-url"
                  type="url"
                  value={haUrl}
                  onChange={(e) => setHaUrl(e.target.value)}
                  placeholder="https://your-ha.nabu.casa"
                />
              </div>
              <div className="field">
                <label htmlFor="onboard-ha-token">Long-Lived Access Token</label>
                <input
                  id="onboard-ha-token"
                  type="password"
                  value={haToken}
                  onChange={(e) => setHaToken(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                />
              </div>
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="section">
          <h2>When should it arrive?</h2>
          <p className="hint">
            Applied to every service you picked. Change it per service later if you want.
          </p>
          <DeliveryFields
            idPrefix="onboard"
            time={deliveryTime}
            setTime={setDeliveryTime}
            tz={deliveryTz}
            setTz={setDeliveryTz}
          />
          <label className="check">
            <input type="checkbox" checked={bundle} onChange={(e) => setBundle(e.target.checked)} />
            Send everything as a single combined PDF (digest)
          </label>
        </section>
      )}

      <div className="onboard-nav">
        <button
          type="button"
          className="button button--secondary"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || busy}
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={(step === 0 && !step1Ok) || (step === 1 && !step2Ok)}
          >
            Next
          </button>
        ) : (
          <button type="button" className="button" onClick={finish} disabled={busy}>
            {busy ? "Setting up…" : "Finish"}
          </button>
        )}
      </div>

      {error && <p className="message err">{error}</p>}
    </div>
  );
}
