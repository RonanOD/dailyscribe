import { collections, decryptSecret, getOrCreateKanjiProgress } from "@dailyscribe/core";
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
  const haSub = await subscriptions.findOne({ userId, service: "ha-summary" });
  const kanjiSub = await subscriptions.findOne({ userId, service: "kanji" });
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

  // Kanji practice check-in address — only relevant once the user has
  // actually configured the Kanji service; shown even before their first
  // send so they can save it as a contact on their Kindle Scribe ahead of time.
  let kanjiInboundAddress: string | null = null;
  let lastSubmissionAt: Date | null = null;
  if (kanjiSub) {
    const progress = await getOrCreateKanjiProgress(userId);
    const inboundDomain = process.env.RESEND_INBOUND_DOMAIN;
    if (inboundDomain) {
      kanjiInboundAddress = `kanji-${progress.inboundToken}@${inboundDomain}`;
    }
    const { kanjiSubmissions } = await collections();
    const lastSubmission = await kanjiSubmissions.findOne({ userId }, { sort: { receivedAt: -1 } });
    lastSubmissionAt = lastSubmission?.receivedAt ?? null;
  }

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

      <DashboardForm
        cbc={cbcSub ? { config: cbcSub.config, enabled: cbcSub.enabled } : null}
        ha={haSub ? { config: haSub.config, enabled: haSub.enabled } : null}
        kanji={kanjiSub ? { config: kanjiSub.config, enabled: kanjiSub.enabled } : null}
        configured={configured}
      />

      {kanjiSub && (
        <section className="section">
          <h2>Kanji practice check-in</h2>
          {kanjiInboundAddress ? (
            <>
              <p className="hint">
                Mail your marked-up practice page back to <code>{kanjiInboundAddress}</code> (save it as a
                contact on your Kindle Scribe) — we&apos;ll store it, though nothing reads or grades it yet.
              </p>
              <p className="hint">
                {lastSubmissionAt
                  ? `Last submission received: ${lastSubmissionAt.toLocaleString()}`
                  : "No submissions received yet."}
              </p>
            </>
          ) : (
            <p className="hint">Inbound email isn&apos;t configured yet.</p>
          )}
        </section>
      )}
    </main>
  );
}
