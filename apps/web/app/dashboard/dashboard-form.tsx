"use client";

import { useState } from "react";

interface Config {
  version: string;
  deliveryTime: string;
  timezone: string;
  kindleEmail: string;
}

interface Props {
  initialConfig: Config | null;
  initialEnabled: boolean;
  configured: { nyt: boolean; gmail: boolean };
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

export function DashboardForm({ initialConfig, initialEnabled, configured }: Props) {
  const browserTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/Toronto";

  const [version, setVersion] = useState(initialConfig?.version ?? "games");
  const [deliveryTime, setDeliveryTime] = useState(initialConfig?.deliveryTime ?? "08:00");
  const [timezone, setTimezone] = useState(initialConfig?.timezone ?? browserTz);
  const [kindleEmail, setKindleEmail] = useState(initialConfig?.kindleEmail ?? "");
  const [enabled, setEnabled] = useState(initialEnabled);

  const [nytCookie, setNytCookie] = useState("");
  const [gmailUser, setGmailUser] = useState("");
  const [gmailPassword, setGmailPassword] = useState("");

  const [nytSaved, setNytSaved] = useState(configured.nyt);
  const [gmailSaved, setGmailSaved] = useState(configured.gmail);

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

  const saveSettings = () =>
    run("settings", async () => {
      await postJson("/api/subscriptions", { version, deliveryTime, timezone, kindleEmail, enabled });
      ok("Settings saved.");
    });

  const saveNyt = () =>
    run("nyt", async () => {
      await postJson("/api/secrets", { provider: "nyt", value: nytCookie });
      setNytSaved(true);
      setNytCookie("");
      ok("NYT cookie stored (encrypted).");
    });

  const saveGmail = () =>
    run("gmail", async () => {
      await postJson("/api/secrets", {
        provider: "gmail",
        value: { user: gmailUser, appPassword: gmailPassword },
      });
      setGmailSaved(true);
      setGmailPassword("");
      ok("Gmail credentials stored (encrypted).");
    });

  const sendTest = () =>
    run("test", async () => {
      const data = await postJson("/api/deliver-now", {});
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

        <div className="row">
          <div className="field">
            <label htmlFor="deliveryTime">Delivery time</label>
            <input
              id="deliveryTime"
              type="time"
              value={deliveryTime}
              onChange={(e) => setDeliveryTime(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="timezone">Timezone (IANA)</label>
            <input
              id="timezone"
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/Toronto"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="kindleEmail">Send-to-Kindle email</label>
          <input
            id="kindleEmail"
            type="email"
            value={kindleEmail}
            onChange={(e) => setKindleEmail(e.target.value)}
            placeholder="you@kindle.com"
          />
        </div>

        <div className="actions">
          <label className="toggle">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enabled
          </label>
          <button className="button" onClick={saveSettings} disabled={busy !== null}>
            {busy === "settings" ? "Saving…" : "Save settings"}
          </button>
        </div>
      </section>

      <section className="section">
        <h2>
          NYT cookie <span className={`badge${nytSaved ? " on" : ""}`}>{nytSaved ? "stored" : "not set"}</span>
        </h2>
        <p className="hint">
          Paste your logged-in nytimes.com cookie string (must include the <code>NYT-S</code> token). Stored
          encrypted; never shown again.
        </p>
        <div className="field">
          <textarea
            value={nytCookie}
            onChange={(e) => setNytCookie(e.target.value)}
            placeholder="NYT-S=...; nyt-a=...; ..."
          />
        </div>
        <button className="button" onClick={saveNyt} disabled={busy !== null || nytCookie.trim() === ""}>
          {busy === "nyt" ? "Saving…" : "Save NYT cookie"}
        </button>
      </section>

      <section className="section">
        <h2>
          Gmail delivery{" "}
          <span className={`badge${gmailSaved ? " on" : ""}`}>{gmailSaved ? "stored" : "not set"}</span>
        </h2>
        <p className="hint">
          A Gmail address + App Password (2FA required) used to email your Kindle. Add this address to your
          Kindle&apos;s “Approved Personal Document E-mail List”.
        </p>
        <div className="row">
          <div className="field">
            <label htmlFor="gmailUser">Gmail address</label>
            <input
              id="gmailUser"
              type="email"
              value={gmailUser}
              onChange={(e) => setGmailUser(e.target.value)}
              placeholder="you@gmail.com"
            />
          </div>
          <div className="field">
            <label htmlFor="gmailPassword">App password</label>
            <input
              id="gmailPassword"
              type="password"
              value={gmailPassword}
              onChange={(e) => setGmailPassword(e.target.value)}
              placeholder="16-char app password"
            />
          </div>
        </div>
        <button
          className="button"
          onClick={saveGmail}
          disabled={busy !== null || gmailUser.trim() === "" || gmailPassword.trim() === ""}
        >
          {busy === "gmail" ? "Saving…" : "Save Gmail credentials"}
        </button>
      </section>

      <section className="section">
        <h2>Test delivery</h2>
        <p className="hint">Fetch today&apos;s crossword and email it to your Kindle right now.</p>
        <button className="button" onClick={sendTest} disabled={busy !== null}>
          {busy === "test" ? "Sending…" : "Send test now"}
        </button>
      </section>

      {message && <p className={`message ${message.kind}`}>{message.text}</p>}
    </>
  );
}
