import {
  collections,
  createGeminiKanjiCheckClient,
  extractPdfPages,
  KANJI_CURRICULUM,
  type KanjiCharCheckResult,
} from "@dailyscribe/core";
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
// reports attachments: [] even though a real file exists. The wrapped link
// only resolves for requests that look like a real browser navigation —
// Amazon's redirect service 503s bare/non-browser clients — and even then
// intermittently, hence the retries (mirrors a working reference
// implementation elsewhere in this project's history, which saw the same
// intermittent 503s from a residential IP and handled them the same way).
const AMAZON_LINK_RE = /https:\/\/www\.amazon\.[a-z.]+\/gp\/f\.html\?[^"'\s>]*/g;
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};
const LINK_FETCH_ATTEMPTS = 3;

// The domain MX points every address at Resend inbound, so plain human mail
// (privacy@, contact@, …) lands on this same webhook. Anything addressed to
// one of these mailboxes is forwarded on to CONTACT_FORWARD_TO and does not
// enter the submission pipeline below.
const CONTACT_MAILBOXES = new Set(["privacy", "contact", "hello", "support", "abuse"]);

function addressLocalPart(addr: string): string {
  const angle = addr.match(/<([^>]+)>/);
  const email = (angle ? angle[1] : addr).trim().toLowerCase();
  return email.split("@")[0] ?? "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAttachmentFromEmailBody(resend: Resend, emailId: string): Promise<Buffer | null> {
  const { data: emailData, error } = await resend.emails.receiving.get(emailId);
  if (error || !emailData?.html) return null;

  for (const wrappedUrl of emailData.html.match(AMAZON_LINK_RE) ?? []) {
    const target = new URL(wrappedUrl).searchParams.get("U");
    if (!target || !/\.s3\.amazonaws\.com\/.*\.pdf/i.test(target)) continue;

    for (let attempt = 1; attempt <= LINK_FETCH_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(wrappedUrl, { redirect: "follow", headers: BROWSER_HEADERS });
        if (!res.ok) {
          console.warn(`resend-inbound: linked-copy fetch attempt ${attempt}/${LINK_FETCH_ATTEMPTS} got HTTP ${res.status}`);
        } else {
          const bytes = Buffer.from(await res.arrayBuffer());
          console.warn(
            `resend-inbound: diagnostic — fetched linked copy, contentLengthHeader=${res.headers.get("content-length")}, actualBytes=${bytes.length}`,
          );
          if (bytes.length > MAX_ATTACHMENT_BYTES) break;
          return bytes;
        }
      } catch (err) {
        console.warn(
          `resend-inbound: linked-copy fetch attempt ${attempt}/${LINK_FETCH_ATTEMPTS} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
      if (attempt < LINK_FETCH_ATTEMPTS) await sleep(2000 * attempt);
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

/**
 * Scans every page for the `dailyscribe:<service>:<token>` footer tag, since
 * a mailed-back submission may be a digest bundling other services' pages
 * alongside this one (the footer is `fixed` — repeated on every page of the
 * asset it came from). Returns every page carrying the *same* service+token
 * as the first match, so the caller can trim the PDF down to just those
 * pages before storing/grading it — unrelated bundled pages are never sent
 * on to a per-service handler.
 */
async function extractInboundRef(
  pdfBytes: Buffer,
): Promise<{ service: string; token: string; pageIndices: number[] } | null> {
  try {
    // pdfjs-dist's Node build needs @napi-rs/canvas (a native binary) for
    // DOMMatrix/Path2D polyfills, which didn't survive Vercel's serverless
    // bundling (ReferenceError: DOMMatrix is not defined, confirmed against
    // a real production failure) — pdfjs-serverless is a purpose-built
    // pdfjs-dist wrapper with pure-JS polyfills for exactly this class of
    // environment, no native deps.
    const { getDocument } = await import("pdfjs-serverless");
    const doc = await getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true }).promise;

    let ref: { service: string; token: string } | null = null;
    const pageIndices: number[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
      // A hyphenated line-wrap can split the ref token itself (e.g. "dai-\nlyscribe:kanji:…"),
      // which the plain join above renders as "dai- lyscribe:kanji:…" — defeat that by also
      // trying a hyphen-unwrapped variant before giving up on a page.
      const match = pageText.match(SUBJECT_RE) ?? pageText.replace(/-\s+/g, "").match(SUBJECT_RE);
      if (!match) continue;
      if (!ref) ref = { service: match[1], token: match[2] };
      if (match[1] === ref.service && match[2] === ref.token) pageIndices.push(i - 1); // 0-based, for pdf-lib
    }
    return ref ? { ...ref, pageIndices } : null;
  } catch (err) {
    console.error("resend-inbound: pdfjs-serverless failed to parse/extract text:", err instanceof Error ? err.stack : err);
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

  // Plain mail to a contact mailbox (privacy@ etc.) — forward it to a real
  // inbox and stop; it is not a mailed-back submission.
  const recipients = [
    ...(event.data.to ?? []),
    ...(event.data.cc ?? []),
    ...(event.data.received_for ?? []),
  ];
  if (recipients.some((r) => CONTACT_MAILBOXES.has(addressLocalPart(r)))) {
    const forwardTo = process.env.CONTACT_FORWARD_TO;
    if (!forwardTo) {
      console.warn("resend-inbound: contact mail received but CONTACT_FORWARD_TO is not set");
      return NextResponse.json({ ok: true, skipped: "contact mail, no forward configured" });
    }
    try {
      const { error } = await resend.emails.receiving.forward({
        emailId: event.data.email_id,
        to: forwardTo,
        from: process.env.MAIL_FROM_DEFAULT ?? "Daily Scribe <my@dailyscribe.ca>",
        passthrough: true,
      });
      if (error) {
        console.error("resend-inbound: contact forward failed:", error);
        return NextResponse.json({ ok: true, skipped: "contact forward failed" });
      }
    } catch (err) {
      console.error("resend-inbound: contact forward threw:", err instanceof Error ? err.message : err);
      return NextResponse.json({ ok: true, skipped: "contact forward threw" });
    }
    return NextResponse.json({ ok: true, forwarded: true });
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

  // Trim to just this service's own pages — a mailed-back digest carries
  // other bundled services' pages too, and neither storage nor grading
  // below should see content that isn't this submission's own.
  const serviceBytes = await extractPdfPages(attachmentBytes, ref.pageIndices);

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
    attachmentBytes: serviceBytes,
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
          attachmentBytes: serviceBytes,
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
