"use client";

import { useState, type FormEvent } from "react";

// The waitlist API lives on the dashboard app (it owns the database). Override
// per environment if needed; defaults to production.
const WEB_APP_URL = process.env.NEXT_PUBLIC_WEB_APP_URL ?? "https://my.dailyscribe.ca";

/** Prefer a ?ref= on the current URL (campaign links) over the page default. */
function resolveRef(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const fromUrl = new URLSearchParams(window.location.search).get("ref");
  return fromUrl ? fromUrl.slice(0, 64) : fallback;
}

export interface WaitlistCopy {
  button_label: string;
  placeholder: string;
  success_message: string;
}

export function WaitlistForm({
  copy,
  source = "site",
  compact = false,
}: {
  copy: WaitlistCopy;
  source?: string;
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setState("loading");
    try {
      const res = await fetch(`${WEB_APP_URL}/api/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, company, ref: resolveRef(source) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setState("done");
        setMessage(copy.success_message);
      } else {
        setState("error");
        setMessage(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setState("error");
      setMessage("Couldn't reach the server. Please try again.");
    }
  }

  if (state === "done") {
    return (
      <p className="waitlist-done" role="status">
        {message}
      </p>
    );
  }

  return (
    <form className={`waitlist-form${compact ? " waitlist-form--compact" : ""}`} onSubmit={onSubmit}>
      <input
        type="email"
        required
        autoComplete="email"
        placeholder={copy.placeholder}
        aria-label="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="waitlist-hp"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
      />
      <button className="btn btn--primary" type="submit" disabled={state === "loading"}>
        {state === "loading" ? "Joining…" : copy.button_label}
      </button>
      {state === "error" && (
        <p className="waitlist-error" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
