import Link from "next/link";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();
  return (
    <main className="landing">
      <section className="card">
        <h1>Daily Scribe</h1>
        <p className="tagline">Your daily crossword, news, and more — delivered to your Kindle.</p>
        <p className="muted">Something interesting is building here.</p>
        <Link className="button" href="/dashboard">
          {session ? "Go to dashboard" : "Sign in"}
        </Link>
      </section>
    </main>
  );
}
