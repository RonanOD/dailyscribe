import { collections, type DeliveryEventType } from "@dailyscribe/core";
import type { Filter } from "mongodb";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import type { Subscription } from "@dailyscribe/core";

export const runtime = "nodejs";

const HANDLED: DeliveryEventType[] = ["email.delivered", "email.bounced", "email.complained"];

/**
 * Resend delivery-status webhook for the shared outbound sender. Records
 * bounce / complaint / delivered events, and — on a hard bounce or a spam
 * complaint — disables every subscription pointed at that address so we stop
 * mailing a dead or hostile inbox and protect sender reputation. Configure a
 * webhook in the Resend dashboard for these event types and put its signing
 * secret in RESEND_EVENTS_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const webhookSecret = process.env.RESEND_EVENTS_WEBHOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  if (!webhookSecret || !apiKey) {
    console.error("resend-events: RESEND_EVENTS_WEBHOOK_SECRET or RESEND_API_KEY is not set.");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const rawBody = await req.text();
  const resend = new Resend(apiKey);

  let event;
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret,
    });
  } catch (err) {
    console.warn("resend-events: signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!HANDLED.includes(event.type as DeliveryEventType)) {
    return NextResponse.json({ ok: true, skipped: `unhandled ${event.type}` });
  }

  const type = event.type as DeliveryEventType;
  const data = event.data as {
    email_id: string;
    to: string[];
    subject?: string;
    bounce?: { type: string; subType: string; message: string };
  };
  const recipients = (data.to ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean);

  const { deliveryEvents, subscriptions } = await collections();

  // Idempotent — Resend retries webhooks.
  try {
    await deliveryEvents.insertOne({
      emailId: data.email_id,
      type,
      to: recipients,
      subject: data.subject,
      bounce: data.bounce,
      createdAt: new Date(event.created_at),
      recordedAt: new Date(),
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return NextResponse.json({ ok: true, skipped: "already recorded" });
    }
    throw err;
  }

  // Hard bounce (permanent) or spam complaint → stop sending to that address.
  const isHardBounce = type === "email.bounced" && /permanent/i.test(data.bounce?.type ?? "");
  const isComplaint = type === "email.complained";
  let disabled = 0;
  if ((isHardBounce || isComplaint) && recipients.length > 0) {
    const reason = isComplaint
      ? "Delivery paused: this message was marked as spam. Check your Kindle address, then re-enable your services."
      : `Delivery paused: mail to this address bounced permanently${
          data.bounce?.message ? ` (${data.bounce.message})` : ""
        }. Check the address and that my@dailyscribe.ca is on your Kindle's approved-sender list, then re-enable.`;
    const res = await subscriptions.updateMany(
      { "config.kindleEmail": { $in: recipients }, enabled: true } as Filter<Subscription>,
      { $set: { enabled: false, disabledReason: reason } },
    );
    disabled = res.modifiedCount;
  }

  return NextResponse.json({ ok: true, type, disabled });
}
