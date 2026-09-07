import type { Metadata } from "next";
import { LegalPage } from "../_components/LegalPage";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Common questions about Daily Scribe — cost, the one address to whitelist, what's included, mailing pages back, Home Assistant, and cancelling.",
};

export default function FaqPage() {
  return (
    <LegalPage title="Questions & Answers" updated={false}>
      <p>
        Short answers to the things people ask before joining. If yours isn&rsquo;t here, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Is it really free?</h2>
      <p>
        Yes &mdash; free while Daily Scribe is in beta. If paid tiers arrive later you&rsquo;ll
        get plenty of notice, and a usable free option will stay.
      </p>

      <h2>What do I have to set up to receive editions on a Kindle?</h2>
      <p>
        One thing: add <code>my@dailyscribe.ca</code> to your Approved Personal Document E-mail
        List in your Amazon account. The guided setup walks you through it with screenshots.
        It&rsquo;s a one-time step, and it&rsquo;s the only address you ever need to allow.
      </p>

      <h2>Do I need any other accounts or subscriptions?</h2>
      <p>
        No. The services available today &mdash; the RT&Eacute;&nbsp;/&nbsp;BBC&nbsp;/&nbsp;CBC
        news digest, the daily write-in crossword, Kanji&nbsp;A&nbsp;Day, and the Home&nbsp;Assistant
        briefing &mdash; need no outside accounts or logins.
      </p>

      <h2>What is a &ldquo;write-in&rdquo; crossword?</h2>
      <p>
        A fresh crossword in every edition, with the answer key on the next page so nothing is
        spoiled early. You solve it on the Scribe with the pen.
      </p>

      <h2>How does mailing a page back work?</h2>
      <p>
        For practice sections like Kanji, you write your answers on the page, then email that
        page from your Scribe back to <code>my@dailyscribe.ca</code>. Daily Scribe reads your
        handwriting, marks it, and carries your streak forward. Nothing to install.
      </p>

      <h2>I run Home Assistant &mdash; what happens to my token?</h2>
      <p>
        The URL and long-lived access token you provide are encrypted at rest (AES-256-GCM) and
        used only to build your own morning briefing. They are never shared between accounts,
        and you can remove them at any time. Your Home&nbsp;Assistant must be reachable at a
        public address (Nabu&nbsp;Casa, a Cloudflare tunnel, and the like).
      </p>

      <h2>I don&rsquo;t have a Kindle. Can I still use it?</h2>
      <p>
        Yes. Every edition works the same delivered as a PDF to an ordinary inbox &mdash; no
        e-reader, no extra setup.
      </p>

      <h2>Can I change what&rsquo;s included, or when it arrives?</h2>
      <p>
        Any time, from your dashboard &mdash; add or drop sections, and set the delivery time
        and time zone.
      </p>

      <h2>How do I cancel or delete my data?</h2>
      <p>
        Turn everything off in the dashboard, or email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to delete your account and its
        data entirely; deletion requests are honoured within 30 days. See the{" "}
        <a href="/privacy">Privacy Policy</a> for details.
      </p>

      <h2>Are you affiliated with Amazon or Kindle?</h2>
      <p>
        No. Daily Scribe is an independent project. &ldquo;Kindle&rdquo; and &ldquo;Kindle
        Scribe&rdquo; are trademarks of Amazon; other names belong to their respective owners.
      </p>
    </LegalPage>
  );
}
