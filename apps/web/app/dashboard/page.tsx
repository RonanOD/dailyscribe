import { collections } from "@dailyscribe/core";
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
  const nytSub = await subscriptions.findOne({ userId, service: "nyt-crossword" });
  const cbcSub = await subscriptions.findOne({ userId, service: "cbc" });
  const secretDocs = await userSecrets.find({ userId }).project({ provider: 1 }).toArray();
  const configured = {
    nyt: secretDocs.some((d) => d.provider === "nyt"),
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
        nyt={nytSub ? { config: nytSub.config, enabled: nytSub.enabled } : null}
        cbc={cbcSub ? { config: cbcSub.config, enabled: cbcSub.enabled } : null}
        configured={configured}
      />
    </main>
  );
}
