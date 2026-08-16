import { collections, createGeminiKanjiCheckClient, KANJI_CURRICULUM, type KanjiCharCheckResult } from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { Resend, type AttachmentData, type EmailReceivedEvent } from "resend";

type ReceivedEmailAttachment = EmailReceivedEvent["data"]["attachments"][number];

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB — a single PDF submission
const ACCEPTED_CONTENT_TYPES = new Set(["application/pdf"]);

// Every PDF Daily Scribe generates carries `dailyscribe:<service>:<token>` in
// its footer text, so a single shared inbound address can route mail for any
// (current or future) service without the address itself encoding anything —
// the mailed-back PDF is the only source of truth. Kindle Scribe's annotate
// pipeline strips PDF /Info metadata, but its actual text content stream
// survives intact (confirmed against a real round-tripped submission), so
// this is read via plain text extraction, not vision/OCR.
const SUBJECT_RE = /dailyscribe:([a-z0-9_-]+):([a-f0-9]+)/;

// Kindle Scribe's "send" flow doesn't always attach the file directly —
// for larger PDFs it instead emails a notification with a click-tracking
// link (wrapping a presigned S3 URL) to a cloud-hosted copy, and Resend then
// reports attachments: [] even though a real file exists. Confirmed against
// a real submission: the wrapped link only resolves with a normal browser
// User-Agent (Amazon's redirect service 503s on non-browser clients).
const AMAZON_LINK_RE = /https:\/\/www\.amazon\.[a-z.]+\/gp\/f\.html\?[^"'\s>]*/g;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchAttachmentFromEmailBody(resend: Resend, emailId: string): Promise<Buffer | null> {
  const { data: emailData, error } = await resend.emails.receiving.get(emailId);
  if (error || !emailData?.html) return null;

  for (const wrappedUrl of emailData.html.match(AMAZON_LINK_RE) ?? []) {
    const target = new URL(wrappedUrl).searchParams.get("U");
    if (!target || !/\.s3\.amazonaws\.com\/.*\.pdf/i.test(target)) continue;

    try {
      const res = await fetch(wrappedUrl, { redirect: "follow", headers: { "User-Agent": BROWSER_USER_AGENT } });
      if (!res.ok) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > MAX_ATTACHMENT_BYTES) continue;
      return bytes;
    } catch {
      continue;
    }
  }
  return null;
}

/** Resolves the mailed-back PDF's bytes, trying a normal attachment first
 *  and falling back to a linked cloud copy (see fetchAttachmentFromEmailBody)
 *  when Resend reports no attachment at all. */
async function resolveSubmissionBytes(
  resend: Resend,
  resendEmailId: string,
  attachments: readonly ReceivedEmailAttachment[],
): Promise<{ bytes: Buffer; filename: string; contentType: string } | null> {
  const candidate = attachments.find((a) => ACCEPTED_CONTENT_TYPES.has(a.content_type));
  if (candidate) {
    const { data: attachmentList, error: attachmentError } = await resend.emails.receiving.attachments.list({
      emailId: resendEmailId,
    });
    if (attachmentError || !attachmentList) {
      console.error("resend-inbound: failed to list attachments:", attachmentError);
      return null;
    }
    const attachmentData = attachmentList.data.find((a: AttachmentData) => a.id === candidate.id);
    if (!attachmentData) {
      console.error(`resend-inbound: attachment ${candidate.id} not found in list response`);
      return null;
    }
    if (attachmentData.size > MAX_ATTACHMENT_BYTES) {
      console.warn(`resend-inbound: attachment ${candidate.id} too large (${attachmentData.size} bytes), skipping`);
      return null;
    }
    // download_url expires in ~1 hour; fetched immediately within this request.
    const fileRes = await fetch(attachmentData.download_url);
    if (!fileRes.ok) {
      console.error(`resend-inbound: failed to download attachment: HTTP ${fileRes.status}`);
      return null;
    }
    return {
      bytes: Buffer.from(await fileRes.arrayBuffer()),
      filename: candidate.filename ?? "submission",
      contentType: candidate.content_type,
    };
  }

  const linkedBytes = await fetchAttachmentFromEmailBody(resend, resendEmailId);
  if (linkedBytes) {
    console.warn(`resend-inbound: no direct attachment on email ${resendEmailId}, used linked copy from body`);
    return { bytes: linkedBytes, filename: "submission.pdf", contentType: "application/pdf" };
  }

  return null;
}

async function extractInboundRef(pdfBytes: Buffer): Promise<{ service: string; token: string } | null> {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBytes),
      useWorkerFetch: false,
    }).promise;

    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += " " + content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
      const match = text.match(SUBJECT_RE);
      if (match) return { service: match[1], token: match[2] };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resend inbound webhook (event.type "email.received") for all mailed-back
 * submissions, across every service — one shared address, routed entirely by
 * metadata embedded in the PDF itself (see SUBJECT_RE) rather than by which
 * address it was sent to. Verify → fetch the PDF attachment → read its
 * embedded service+token → dispatch to that service's handler.
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

  const { email_id: resendEmailId, attachments } = event.data;
  const { kanjiProgress, kanjiSubmissions } = await collections();

  const already = await kanjiSubmissions.findOne({ resendEmailId });
  if (already) {
    return NextResponse.json({ ok: true, skipped: "already processed" });
  }

  const submission = await resolveSubmissionBytes(resend, resendEmailId, attachments);
  if (!submission) {
    console.warn(`resend-inbound: no usable PDF (attached or linked) on email ${resendEmailId}`);
    return NextResponse.json({ ok: true, skipped: "no usable attachment" });
  }
  const { bytes: attachmentBytes, filename: attachmentFilename, contentType: attachmentContentType } = submission;

  const ref = await extractInboundRef(attachmentBytes);
  if (!ref) {
    console.warn(`resend-inbound: no dailyscribe ref found in PDF text (email ${resendEmailId})`);
    return NextResponse.json({ ok: true, skipped: "no ref found in PDF text" });
  }

  switch (ref.service) {
    case "kanji":
      break;
    default:
      console.warn(`resend-inbound: unknown service "${ref.service}" (email ${resendEmailId})`);
      return NextResponse.json({ ok: true, skipped: "unknown service" });
  }

  const progress = await kanjiProgress.findOne({ inboundToken: ref.token });
  if (!progress) {
    console.warn(`resend-inbound: no user matches inbound token (email ${resendEmailId})`);
    return NextResponse.json({ ok: true, skipped: "unknown token" });
  }

  const batchCharsAtReceipt = progress.lastBatchChars ?? [];

  const { insertedId } = await kanjiSubmissions.insertOne({
    userId: progress.userId,
    resendEmailId,
    receivedAt: new Date(),
    attachmentFilename,
    attachmentContentType,
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
          contentType: attachmentContentType,
          expected,
        });
        await kanjiSubmissions.updateOne(
          { _id: insertedId },
          { $set: { status: "processed", checkResults, processedAt: new Date() } },
        );

        // Queue anything not clearly matched to be resent (instead of fresh
        // curriculum) on the next send; clear anything that's now matched,
        // including chars queued by an earlier check-in.
        const matchedChars = checkResults.filter((r) => r.status === "matched").map((r) => r.char);
        const unmatchedChars = checkResults.filter((r) => r.status !== "matched").map((r) => r.char);
        const retryChars = Array.from(
          new Set([...(progress.retryChars ?? []).filter((c) => !matchedChars.includes(c)), ...unmatchedChars]),
        );
        await kanjiProgress.updateOne({ userId: progress.userId }, { $set: { retryChars, updatedAt: new Date() } });
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
