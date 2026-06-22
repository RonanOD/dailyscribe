import nodemailer from "nodemailer";
import type { Asset } from "../plugins/index";

export interface DeliverOptions {
  to: string;
  subject: string;
  text?: string;
  assets: Asset[];
}

/** Delivery channel abstraction so Resend / Telegram can drop in later. */
export interface Deliverer {
  deliver(opts: DeliverOptions): Promise<void>;
}

export interface GmailConfig {
  /** Full Gmail address used as the SMTP user and From address. */
  user: string;
  /** Gmail App Password (requires 2FA on the account). */
  appPassword: string;
}

/**
 * Deliver via Gmail SMTP using an App Password. The From address must be on the
 * recipient Kindle's "Approved Personal Document E-mail List".
 */
export function createGmailDeliverer(config: GmailConfig): Deliverer {
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: config.user, pass: config.appPassword },
  });

  return {
    async deliver({ to, subject, text, assets }: DeliverOptions): Promise<void> {
      await transport.sendMail({
        from: config.user,
        to,
        subject,
        text: text ?? "",
        attachments: assets.map((a) => ({
          filename: a.filename,
          content: a.bytes,
          contentType: a.contentType,
        })),
      });
    },
  };
}
