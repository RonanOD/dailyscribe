"use client";

import { useState } from "react";

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
}

/**
 * "Stop all deliveries" and "Delete my account", tucked into a closed
 * <details> under the settings so they're findable but not in the way. Both
 * ask an optional "what didn't work?" question (DAI-34).
 */
export function AccountActions({ anyEnabled }: { anyEnabled: boolean }) {
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState<"stop" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "stop" | "delete", fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const stopAll = () =>
    run("stop", async () => {
      await postJson("/api/account/stop", { reason });
      // Full reload, not router.refresh(): the settings form keeps its toggles in
      // client state, and a stale "on" there would switch everything back on at
      // the next Save.
      window.location.reload();
    });

  const deleteAccount = () =>
    run("delete", async () => {
      await postJson("/api/account/delete", { confirm: confirmText, reason });
      window.location.href = "https://dailyscribe.ca/";
    });

  return (
    <details className="section account-actions">
      <summary>Stop deliveries or delete your account</summary>

      <div className="field">
        <label htmlFor="leave-reason">What didn&apos;t work for you? (optional)</label>
        <textarea
          id="leave-reason"
          rows={3}
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Too much to read, wrong time of day, Kindle trouble..."
        />
        <p className="hint">Only Ronan reads this. It helps decide what to fix next.</p>
      </div>

      <h2>Stop all deliveries</h2>
      {anyEnabled ? (
        <>
          <p className="hint">
            Switches every service off at once. Your account and settings stay, so you can switch any service back on later.
          </p>
          <button className="button button--secondary" onClick={stopAll} disabled={busy !== null}>
            {busy === "stop" ? "Stopping…" : "Stop all deliveries"}
          </button>
        </>
      ) : (
        <p className="hint">Nothing is being delivered right now. Switch a service on above to start again.</p>
      )}

      <h2 className="account-actions__delete">Delete my account</h2>
      <p className="hint">
        Permanently deletes your account, settings, saved credentials, and history (including Kanji and DnD progress). This
        can&apos;t be undone. To use Daily Scribe again you&apos;d need a new invite.
      </p>
      <div className="field">
        <label htmlFor="delete-confirm">Type &quot;delete&quot; to confirm</label>
        <input
          id="delete-confirm"
          type="text"
          autoComplete="off"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
        />
      </div>
      <button
        className="button button--danger"
        onClick={deleteAccount}
        disabled={busy !== null || confirmText.trim().toLowerCase() !== "delete"}
      >
        {busy === "delete" ? "Deleting…" : "Delete my account"}
      </button>

      {error && <p className="message err">{error}</p>}
    </details>
  );
}
