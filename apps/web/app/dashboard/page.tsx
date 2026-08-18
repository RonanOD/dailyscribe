import { Suspense } from "react";
import { collections, decryptSecret, type KanjiSubmission } from "@dailyscribe/core";
import { auth, signIn, signOut } from "@/auth";
import { DashboardForm } from "./dashboard-form";

export const runtime = "nodejs";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="landing">
        <section className="card">
          <h1>Daily Scribe</h1>
          <p className="muted">Sign in to configure your daily delivery.</p>
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/dashboard" });
            }}
          >
            <button className="button" type="submit">
              Sign in with GitHub
            </button>
          </form>
        </section>
      </main>
    );
  }

  const userId = session.user.id;
  const { subscriptions, userSecrets } = await collections();
  const cbcSub = await subscriptions.findOne({ userId, service: "cbc" });
  const bbcSub = await subscriptions.findOne({ userId, service: "bbc" });
  const haSub = await subscriptions.findOne({ userId, service: "ha-summary" });
  const kanjiSub = await subscriptions.findOne({ userId, service: "kanji" });
  const digestSub = await subscriptions.findOne({ userId, service: "digest" });
  const secretDocs = await userSecrets.find({ userId }).toArray();
  const haDoc = secretDocs.find((d) => d.provider === "ha");
  let haUrl: string | undefined = undefined;
  if (haDoc) {
    try {
      const parsed = JSON.parse(decryptSecret(haDoc.data)) as { url?: string };
      haUrl = parsed.url;
    } catch {
      // Ignore
    }
  }

  const configured = {
    ha: Boolean(haDoc),
    haUrl,
  };

  // Inbound reply address — the same my@dailyscribe.ca address every user
  // already has to know as the outbound sender, doing double duty as the
  // shared inbound address for every service (routing is done via metadata
  // embedded in the mailed-back PDF, not the address). Only relevant once
  // the user has actually configured the Kanji service; shown even before
  // their first send so they can save it as a contact on their Kindle
  // Scribe ahead of time (though it's likely already saved, as the sender).
  let inboundAddress: string | null = null;
  let lastSubmission: KanjiSubmission | null = null;
  if (kanjiSub) {
    const inboundDomain = process.env.RESEND_INBOUND_DOMAIN;
    if (inboundDomain) {
      inboundAddress = `my@${inboundDomain}`;
    }
    const { kanjiSubmissions } = await collections();
    lastSubmission = await kanjiSubmissions.findOne({ userId }, { sort: { receivedAt: -1 } });
  }

  // Server-rendered, so a plain toLocaleString() would use the server's own
  // timezone (UTC on Vercel) rather than the user's — format explicitly in
  // whatever timezone they've set for their delivery.
  const lastSubmissionFormatted = lastSubmission
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: kanjiSub?.config.timezone || "UTC",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(lastSubmission.receivedAt)
    : null;

  const CHECK_LABEL: Record<string, string> = { matched: "matched", unclear: "unclear", no_attempt: "not attempted" };

  return (
    <main className="dashboard">
      <header className="topbar">
        <h1>Daily Scribe</h1>
        <div className="who">
          <span>{session.user.email ?? session.user.name}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="link" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <Suspense fallback={null}>
      <DashboardForm
        cbc={cbcSub ? { config: cbcSub.config, enabled: cbcSub.enabled } : null}
        bbc={bbcSub ? { config: bbcSub.config, enabled: bbcSub.enabled } : null}
        ha={haSub ? { config: haSub.config, enabled: haSub.enabled } : null}
        kanji={kanjiSub ? { config: kanjiSub.config, enabled: kanjiSub.enabled } : null}
        digestEnabled={digestSub?.enabled ?? false}
        configured={configured}
        afterFields={
          kanjiSub && (
            <section className="section">
              <h2>Kanji practice check-in</h2>
              {inboundAddress ? (
                <>
                  <p className="hint">
                    Mail the marked-up PDF back to <code>{inboundAddress}</code> — the same address Daily Scribe
                    sends from, so it&apos;s easy to remember (worth saving as a Send-to contact on your Kindle
                    Scribe too, for one-tap replies). Each day&apos;s PDF carries a hidden marker that ties it
                    back to your account, so we&apos;ll know it&apos;s yours and check which characters you
                    attempted. Send the PDF itself (e.g. via Kindle Scribe&apos;s Send/Export after marking it up) — a photo of
                    a printed page won&apos;t work.
                  </p>
                  {lastSubmission ? (
                    <>
                      <p className="hint">Last submission received: {lastSubmissionFormatted}</p>
                      {lastSubmission.status === "processed" &&
                        lastSubmission.checkResults &&
                        lastSubmission.checkResults.length > 0 && (
                          <p className="hint">
                            {lastSubmission.checkResults.filter((r) => r.status === "matched").length}/
                            {lastSubmission.checkResults.length} matched —{" "}
                            {lastSubmission.checkResults
                              .map((r) => `${r.char} (${CHECK_LABEL[r.status]})`)
                              .join(", ")}
                          </p>
                        )}
                      {lastSubmission.status === "processed" && lastSubmission.checkResults?.length === 0 && (
                        <p className="hint">
                          No expected characters were on record for this submission, so there was nothing to check.
                        </p>
                      )}
                      {lastSubmission.status === "failed" && (
                        <p className="hint">
                          We received this submission, but the automatic check couldn&apos;t be completed.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="hint">No submissions received yet.</p>
                  )}
                </>
              ) : (
                <p className="hint">Inbound email isn&apos;t configured yet.</p>
              )}
            </section>
          )
        }
      />
      </Suspense>
    </main>
  );
}
