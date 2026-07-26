import { collections, decryptSecret } from "@dailyscribe/core";
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
        configured={configured}
      />
    </main>
  );
}
