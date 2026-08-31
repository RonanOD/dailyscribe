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
  attachments: { filename: string; content: Buffer; contentType: string }[];
}

/**
 * Ceiling for the summed size of a message's attachments. Resend rejects
 * messages over 40 MB and Kindle "Send to Kindle" tops out around 50 MB; stay
 * well under so a large multi-service digest fails loudly here (recorded as a
 * failed delivery) instead of being silently dropped by Resend.
 */
export const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export function totalAttachmentBytes(assets: Asset[]): number {
  return assets.reduce((sum, a) => sum + a.bytes.byteLength, 0);
}

/** Throw a user-safe Error if the attachments are too large to deliver. */
export function assertDeliverable(assets: Asset[]): void {
  const total = totalAttachmentBytes(assets);
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
    const mb = (total / (1024 * 1024)).toFixed(1);
    const cap = Math.round(MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024));
    const biggest = [...assets].sort((a, b) => b.bytes.byteLength - a.bytes.byteLength)[0];
    throw new Error(
      `Attachments total ${mb} MB, over the ${cap} MB limit` +
        (biggest ? ` (largest: ${biggest.filename})` : "") +
        ". Lower your article counts or split the digest.",
    );
  }
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
      contentType: a.contentType,
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
      assertDeliverable(opts.assets);
      const { error } = await resend.emails.send(buildResendEmail(opts, config.from));
      if (error) {
        throw new Error(`Resend delivery failed: ${error.name} — ${error.message}`);
      }
    },
  };
}
