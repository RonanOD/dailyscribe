import {
  applyCharacterSheet,
  applyMove,
  collections,
  createGeminiKanjiCheckClient,
  extractPdfPages,
  KANJI_CURRICULUM,
  SUNKEN_VAULT_CAMPAIGN,
  type DndGameStatus,
  type DndSubmissionShape,
  type KanjiCharCheckResult,
} from "@dailyscribe/core";
import { NextResponse } from "next/server";
import { Resend, type AttachmentData, type EmailReceivedEvent } from "resend";
import { readDndReply } from "@/lib/dnd/dnd-check";
import { extractInboundRefs } from "@/lib/inbound-refs";

type ReceivedEmailAttachment = EmailReceivedEvent["data"]["attachments"][number];

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB — a single PDF submission
const ACCEPTED_CONTENT_TYPES = new Set(["application/pdf"]);

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

/** A filled character-creation sheet is expected while there's no active hero
 *  yet (a new campaign) or after the previous run ended (won/dead — the
 *  terminal pages offer a restart); every other status expects an ordinary
 *  move reply. */
function dndExpectedShape(status: DndGameStatus): DndSubmissionShape {
  return status === "active" ? "move" : "character";
}

/**
 * DnD's mail-back handler: look up the campaign by inbound token, record the
 * submission, read the reply (deterministic checkbox + scoped OCR for a move,
 * one whole-page vision read for a character sheet — see dnd-check.ts), and
 * apply it via the pure engine functions. Mirrors the Kanji handling below,
 * but pulled into its own function since the two services' reply shapes
 * (and what "reading" them means) don't share meaningful code beyond the
 * submission bookkeeping pattern itself.
 */
async function handleDndSubmission(input: {
  resendEmailId: string;
  attachmentBytes: Buffer;
  attachmentFilename: string;
  attachmentContentType: string;
  token: string;
}): Promise<void> {
  const { dndCampaigns, dndSubmissions } = await collections();

  // A Resend retry (or, now, a second ref group from the same email — see
  // extractInboundRefs) must never double-apply a move: dndSubmissions has a
  // unique index on resendEmailId, so without this check a retry's insertOne
  // would throw, uncaught, on every attempt.
  const already = await dndSubmissions.findOne({ resendEmailId: input.resendEmailId });
  if (already) {
    console.log(`resend-inbound: dnd submission for email ${input.resendEmailId} already processed`);
    return;
  }

  const campaign = await dndCampaigns.findOne({ inboundToken: input.token });
  if (!campaign) {
    console.warn(`resend-inbound: no user matches inbound token (email ${input.resendEmailId})`);
    return;
  }

  const expectedShapeAtReceipt = dndExpectedShape(campaign.gameState.status);

  const { insertedId } = await dndSubmissions.insertOne({
    userId: campaign.userId,
    resendEmailId: input.resendEmailId,
    receivedAt: new Date(),
    attachmentFilename: input.attachmentFilename,
    attachmentContentType: input.attachmentContentType,
    attachmentBytes: input.attachmentBytes,
    expectedShapeAtReceipt,
    status: "received",
  });

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.warn("resend-inbound: GEMINI_API_KEY not set, leaving DnD submission unread");
    return;
  }

  try {
    const read = await readDndReply({
      pdfBytes: input.attachmentBytes,
      expectedShape: expectedShapeAtReceipt,
      apiKey: geminiApiKey,
      model: process.env.DND_GEMINI_MODEL || undefined,
    });

    const result =
      read.kind === "character"
        ? applyCharacterSheet(SUNKEN_VAULT_CAMPAIGN, read.sheet)
        : applyMove({ character: campaign.character, gameState: campaign.gameState, turnLog: campaign.turnLog }, SUNKEN_VAULT_CAMPAIGN, read.move);

    await dndCampaigns.updateOne(
      { _id: campaign._id },
      {
        $set: {
          character: result.state.character,
          gameState: result.state.gameState,
          turnLog: result.state.turnLog,
          updatedAt: new Date(),
        },
      },
    );
    await dndSubmissions.updateOne(
      { _id: insertedId },
      {
        $set: {
          status: "processed",
          visionResult: read.kind === "move" ? read.diagnostics : read.sheet,
          processedAt: new Date(),
        },
      },
    );
  } catch (err) {
    console.error("resend-inbound: DnD reply read/apply failed:", err instanceof Error ? err.message : err);
    await dndSubmissions.updateOne(
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

/**
 * Kanji's mail-back handler: look up progress by inbound token, record the
 * submission, and grade it against the batch it was sent for. Mirrors
 * handleDndSubmission's shape/bookkeeping pattern above.
 */
async function handleKanjiSubmission(input: {
  resendEmailId: string;
  attachmentBytes: Buffer;
  attachmentFilename: string;
  attachmentContentType: string;
  token: string;
}): Promise<void> {
  const { kanjiProgress, kanjiSubmissions } = await collections();

  const already = await kanjiSubmissions.findOne({ resendEmailId: input.resendEmailId });
  if (already) {
    console.log(`resend-inbound: kanji submission for email ${input.resendEmailId} already processed`);
    return;
  }

  const progress = await kanjiProgress.findOne({ inboundToken: input.token });
  if (!progress) {
    console.warn(`resend-inbound: no user matches inbound token (email ${input.resendEmailId})`);
    return;
  }

  const batchCharsAtReceipt = progress.lastBatchChars ?? [];

  const { insertedId } = await kanjiSubmissions.insertOne({
    userId: progress.userId,
    resendEmailId: input.resendEmailId,
    receivedAt: new Date(),
    attachmentFilename: input.attachmentFilename,
    attachmentContentType: input.attachmentContentType,
    attachmentBytes: input.attachmentBytes,
    batchCharsAtReceipt,
    status: "received",
  });

  if (batchCharsAtReceipt.length === 0) {
    // Happens when a submission arrives before the user's first Kanji send
    // (no lastBatchChars snapshot yet) — nothing to check against.
    await kanjiSubmissions.updateOne(
      { _id: insertedId },
      { $set: { status: "processed", checkResults: [], processedAt: new Date() } },
    );
    return;
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.warn("resend-inbound: GEMINI_API_KEY not set, leaving submission unchecked");
    return;
  }

  try {
    const expected = batchCharsAtReceipt.map((char) => ({
      char,
      meanings: KANJI_CURRICULUM.find((e) => e.char === char)?.meanings ?? [],
    }));
    const client = createGeminiKanjiCheckClient({ apiKey: geminiApiKey, model: process.env.GEMINI_MODEL || undefined });
    const checkResults: KanjiCharCheckResult[] = await client.check({
      attachmentBytes: input.attachmentBytes,
      contentType: input.attachmentContentType,
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

  const submission = await resolveSubmissionBytes(resend, resendEmailId, attachments);
  if (!submission) {
    console.warn(`resend-inbound: no usable PDF (attached or linked) on email ${resendEmailId}`);
    return NextResponse.json({ ok: true, skipped: "no usable attachment" });
  }
  const { bytes: attachmentBytes, filename: attachmentFilename, contentType: attachmentContentType } = submission;

  const refGroups = await extractInboundRefs(attachmentBytes);
  if (refGroups.length === 0) {
    console.warn(`resend-inbound: no dailyscribe ref found in PDF text (email ${resendEmailId})`);
    return NextResponse.json({ ok: true, skipped: "no ref found in PDF text" });
  }

  // One email can carry replies for several services at once (see
  // extractInboundRefs) — handle every group, not just the first. Each
  // handler does its own per-service idempotency check, so a retry of this
  // whole webhook event correctly re-skips whichever groups already landed
  // while still processing anything that didn't.
  const handled: string[] = [];
  for (const group of refGroups) {
    if (group.service !== "kanji" && group.service !== "dnd") {
      console.warn(`resend-inbound: unknown service "${group.service}" (email ${resendEmailId})`);
      continue;
    }
    // Trim to just this group's own pages — other groups' (or unrelated
    // bundled) pages in the same submission must never reach this handler.
    const serviceBytes = await extractPdfPages(attachmentBytes, group.pageIndices);
    if (group.service === "dnd") {
      await handleDndSubmission({ resendEmailId, attachmentBytes: serviceBytes, attachmentFilename, attachmentContentType, token: group.token });
    } else {
      await handleKanjiSubmission({ resendEmailId, attachmentBytes: serviceBytes, attachmentFilename, attachmentContentType, token: group.token });
    }
    handled.push(group.service);
  }

  return NextResponse.json({ ok: true, handled });
}
