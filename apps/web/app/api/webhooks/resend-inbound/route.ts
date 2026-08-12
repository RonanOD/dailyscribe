import { collections, createGeminiKanjiCheckClient, KANJI_CURRICULUM, type KanjiCharCheckResult } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { Resend, type AttachmentData, type EmailReceivedEvent } from "resend";

type ReceivedEmailAttachment = EmailReceivedEvent["data"]["attachments"][number];

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB — a single scanned/photographed page
const ACCEPTED_CONTENT_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const LOCAL_PART_PREFIX = "kanji-";

function extractInboundToken(toAddresses: string[]): string | null {
  for (const to of toAddresses) {
    const localPart = to.split("@")[0] ?? "";
    if (localPart.startsWith(LOCAL_PART_PREFIX)) {
      return localPart.slice(LOCAL_PART_PREFIX.length);
    }
  }
  return null;
}

/**
 * Resend inbound webhook (event.type "email.received") for the Kanji
 * handwriting check-in. Verify → route by per-user token → fetch the
 * attachment → store it → grade it against the expected batch via Gemini.
 * Anyone can email this endpoint once they know a user's token, so this only
 * proves the request really came from Resend, not that the sender is who
 * they claim to be — the token itself is the only practical guard available
 * (see KanjiProgress.inboundToken).
 */
export async function POST(req: Request) {
  const webhookSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  if (!webhookSecret || !apiKey) {
    console.error("resend-inbound: RESEND_INBOUND_WEBHOOK_SECRET or RESEND_API_KEY is not set.");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  // Signature verification needs the raw, unparsed body — must read it before
  // any JSON parsing.
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
    console.warn("resend-inbound: signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true, skipped: "not email.received" });
  }

  const { email_id: resendEmailId, to, attachments } = event.data;
  const inboundToken = extractInboundToken(to);
  if (!inboundToken) {
    console.warn(`resend-inbound: no ${LOCAL_PART_PREFIX}<token> address found in`, to);
    return NextResponse.json({ ok: true, skipped: "no matching address" });
  }

  const { kanjiProgress, kanjiSubmissions } = await collections();
  const progress = await kanjiProgress.findOne({ inboundToken });
  if (!progress) {
    console.warn(`resend-inbound: no user matches inbound token (email ${resendEmailId})`);
    return NextResponse.json({ ok: true, skipped: "unknown token" });
  }

  const already = await kanjiSubmissions.findOne({ resendEmailId });
  if (already) {
    return NextResponse.json({ ok: true, skipped: "already processed" });
  }

  const candidate = attachments.find((a: ReceivedEmailAttachment) => ACCEPTED_CONTENT_TYPES.has(a.content_type));
  if (!candidate) {
    console.warn(`resend-inbound: no PDF/image attachment on email ${resendEmailId}`);
    return NextResponse.json({ ok: true, skipped: "no usable attachment" });
  }

  const { data: attachmentList, error: attachmentError } = await resend.emails.receiving.attachments.list({
    emailId: resendEmailId,
  });
  if (attachmentError || !attachmentList) {
    console.error("resend-inbound: failed to list attachments:", attachmentError);
    return NextResponse.json({ error: "Failed to fetch attachment" }, { status: 502 });
  }

  const attachmentData = attachmentList.data.find((a: AttachmentData) => a.id === candidate.id);
  if (!attachmentData) {
    console.error(`resend-inbound: attachment ${candidate.id} not found in list response`);
    return NextResponse.json({ error: "Attachment not found" }, { status: 502 });
  }
  if (attachmentData.size > MAX_ATTACHMENT_BYTES) {
    console.warn(`resend-inbound: attachment ${candidate.id} too large (${attachmentData.size} bytes), skipping`);
    return NextResponse.json({ ok: true, skipped: "attachment too large" });
  }

  // download_url expires in ~1 hour; fetched immediately within this request.
  const fileRes = await fetch(attachmentData.download_url);
  if (!fileRes.ok) {
    console.error(`resend-inbound: failed to download attachment: HTTP ${fileRes.status}`);
    return NextResponse.json({ error: "Failed to download attachment" }, { status: 502 });
  }
  const attachmentBytes = Buffer.from(await fileRes.arrayBuffer());
  const batchCharsAtReceipt = progress.lastBatchChars ?? [];

  const { insertedId } = await kanjiSubmissions.insertOne({
    userId: progress.userId,
    resendEmailId,
    receivedAt: new Date(),
    attachmentFilename: candidate.filename ?? "submission",
    attachmentContentType: candidate.content_type,
    attachmentBytes,
    batchCharsAtReceipt,
    status: "received",
  });

  // Grade the submission against the batch it was sent for. This never blocks
  // the response to Resend — the capture above already durably succeeded,
  // and a non-200 here would only cost a wasted retry (the idempotency check
  // above means a retry can never reach this step a second time anyway).
  if (batchCharsAtReceipt.length === 0) {
    // Happens when a submission arrives before the user's first Kanji send
    // (no lastBatchChars snapshot yet) — nothing to check against.
    await kanjiSubmissions.updateOne(
      { _id: insertedId },
      { $set: { status: "processed", checkResults: [], processedAt: new Date() } },
    );
  } else {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.warn("resend-inbound: GEMINI_API_KEY not set, leaving submission unchecked");
    } else {
      try {
        const expected = batchCharsAtReceipt.map((char) => ({
          char,
          meanings: KANJI_CURRICULUM.find((e) => e.char === char)?.meanings ?? [],
        }));
        const client = createGeminiKanjiCheckClient({ apiKey: geminiApiKey, model: process.env.GEMINI_MODEL || undefined });
        const checkResults: KanjiCharCheckResult[] = await client.check({
          attachmentBytes,
          contentType: candidate.content_type,
          expected,
        });
        await kanjiSubmissions.updateOne(
          { _id: insertedId },
          { $set: { status: "processed", checkResults, processedAt: new Date() } },
        );
      } catch (err) {
        console.error("resend-inbound: Gemini kanji check failed:", err instanceof Error ? err.message : err);
        await kanjiSubmissions.updateOne(
          { _id: insertedId },
          {
            $set: {
              status: "failed",
              processingError: err instanceof Error ? err.message : String(err),
              processedAt: new Date(),
            },
          },
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
