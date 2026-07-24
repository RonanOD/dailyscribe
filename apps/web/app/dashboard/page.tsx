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
  const { subscriptions } = await collections();
  const cbcSub = await subscriptions.findOne({ userId, service: "cbc" });

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
      />
    </main>
  );
}
