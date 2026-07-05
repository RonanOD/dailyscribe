import { Resend } from "resend";
import type { Asset } from "../plugins/index";

export interface DeliverOptions {
  to: string;
  subject: string;
  text?: string;
  assets: Asset[];
  /** From address for this send (e.g. "Daily Scribe <news@dailyscribe.ca>"). Falls back to the deliverer's default. */
  from?: string;
}

/** Delivery channel abstraction so Resend / Telegram can drop in later. */
export interface Deliverer {
  deliver(opts: DeliverOptions): Promise<void>;
}

export interface ResendConfig {
  /** Resend API key. */
  apiKey: string;
  /** Default From address used when a send doesn't specify one (e.g. "Daily Scribe <documents@dailyscribe.ca>"). */
  from: string;
}

/** The exact payload sent to Resend's `emails.send`. Pure/derivable so it can be unit-tested without the network. */
export interface ResendEmailPayload {
  from: string;
  to: string;
  subject: string;
  text: string;
  attachments: { filename: string; content: Buffer; content_type: string }[];
}

/** Build the Resend send payload from generic DeliverOptions. Pure — no side effects. */
export function buildResendEmail(opts: DeliverOptions, defaultFrom: string): ResendEmailPayload {
  return {
    from: opts.from ?? defaultFrom,
    to: opts.to,
    subject: opts.subject,
    text: opts.text ?? "",
    attachments: opts.assets.map((a) => ({
      filename: a.filename,
      content: a.bytes,
      content_type: a.contentType,
    })),
  };
}

/**
 * Deliver via Resend using Daily Scribe's own verified domain (dailyscribe.ca).
 * Users whitelist the From address once in their Kindle settings. No per-user
 * sending credentials — one app-wide API key.
 */
export function createResendDeliverer(config: ResendConfig): Deliverer {
  const resend = new Resend(config.apiKey);
  return {
    async deliver(opts: DeliverOptions): Promise<void> {
      const { error } = await resend.emails.send(buildResendEmail(opts, config.from));
      if (error) {
        throw new Error(`Resend delivery failed: ${error.name} — ${error.message}`);
      }
    },
  };
}
