import type { Metadata } from "next";
import { LegalPage } from "../_components/LegalPage";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy — The Daily Scribe",
  description:
    "What Daily Scribe collects, why, who processes it, and how to get it deleted.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Daily Scribe (&ldquo;the service&rdquo;) is a small subscription tool that emails a
        personalised daily PDF to your Kindle Scribe, e-reader, or ordinary inbox. This page
        explains what personal information it handles and why. It is written to be read, not to
        cover every edge case; if something here is unclear, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>What is collected</h2>
      <ul>
        <li>
          <strong>Your email address</strong> — used to sign you in and to send your daily
          editions and account notices.
        </li>
        <li>
          <strong>Your delivery address</strong> — the Kindle or e-reader email you ask editions
          to be sent to, plus your delivery time and time zone.
        </li>
        <li>
          <strong>Your choices</strong> — which services (news, crossword, Kanji, Home Assistant
          summary, digest, &hellip;) you have enabled, and their settings.
        </li>
        <li>
          <strong>Service credentials you choose to provide</strong> — for example a Home
          Assistant URL and access token. These are encrypted at rest (AES-256-GCM) and are only
          ever used to produce your own editions. They are never shared between accounts.
        </li>
        <li>
          <strong>Delivery events</strong> — whether a message was delivered, bounced, or marked
          as spam, so failing addresses can be paused automatically.
        </li>
        <li>
          <strong>Handwriting you send back</strong> — if you use a check-in feature (e.g. Kanji
          practice), the PDF you mail back and the automated assessment of it.
        </li>
        <li>
          <strong>Waitlist requests</strong> — if you ask for an invitation, your email address
          and an optional referral tag, used only to send you an invite.
        </li>
      </ul>
      <p>
        There is no advertising, no ad tracking, and no sale or sharing of personal information
        for marketing.
      </p>

      <h2>Analytics</h2>
      <p>
        Both dailyscribe.ca and my.dailyscribe.ca use Vercel Web Analytics, which records
        aggregate page views without cookies and without building a profile of you.
      </p>

      <h2>Who processes your data</h2>
      <ul>
        <li>
          <strong>Vercel</strong> — hosting for the website and application.
        </li>
        <li>
          <strong>MongoDB Atlas</strong> — the database that stores your account and settings.
        </li>
        <li>
          <strong>Resend</strong> — sending your editions and sign-in emails, and receiving any
          documents you mail back.
        </li>
        <li>
          <strong>Google (Gemini API)</strong> — only for features that assess a page you mail
          back (for example, checking which characters you attempted).
        </li>
        <li>
          <strong>Google and GitHub</strong> — only if you choose to sign in with them; they
          confirm your email address to complete sign-in.
        </li>
      </ul>

      <h2>Email</h2>
      <p>
        Email from Daily Scribe is transactional only: sign-in links, your requested daily
        editions, delivery problems, and — if you joined the waitlist — a single invitation.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Your data is kept while your account is active. Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to export or delete your account
        and its data; deletion requests are honoured within 30 days.
      </p>

      <h2>Children</h2>
      <p>The service is not directed at children under 16.</p>

      <h2>Changes</h2>
      <p>
        If this policy changes materially, the updated version will be posted here with a new
        date.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </LegalPage>
  );
}
