import type { Metadata } from "next";
import Link from "next/link";
import { signIn } from "@/auth";

export const metadata: Metadata = { title: "Check your email · Daily Scribe" };

/**
 * Shown after "Email me a sign-in link" (Auth.js `pages.verifyRequest`),
 * replacing Auth.js's generic page. Seven addresses asked for a link in Nov
 * 2026 and never signed in, so it points at the spam folder and offers the
 * sign-in methods that don't depend on email.
 */
export default function CheckEmailPage() {
  return (
    <main className="landing">
      <section className="card">
        <h1>
          <a className="heading-link" href="https://dailyscribe.ca/">
            Daily Scribe
          </a>
        </h1>
        <h2>Check your email</h2>
        <p>
          We&apos;ve sent you a sign-in link from <strong>my@dailyscribe.ca</strong>. It works once and expires in 24
          hours.
        </p>
        <p className="muted">
          Not there after a minute or two? Look in your spam, junk, or Promotions folder. If it&apos;s there, mark it
          &quot;Not spam&quot; so your daily editions and sign-in links arrive in your inbox.
        </p>

        <div className="signin-oauth">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <button className="button button--secondary" type="submit">
              Sign in with Google instead
            </button>
          </form>
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/dashboard" });
            }}
          >
            <button className="button button--secondary" type="submit">
              Sign in with GitHub instead
            </button>
          </form>
        </div>

        <p className="muted signin-note">
          Typo in your address? <Link href="/dashboard">Try again</Link>.
        </p>
      </section>
    </main>
  );
}
