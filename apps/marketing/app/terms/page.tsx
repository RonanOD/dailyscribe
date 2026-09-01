import type { Metadata } from "next";
import { LegalPage } from "../_components/LegalPage";
import { CONTACT_EMAIL, GOVERNING_LAW, OWNER_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Use — The Daily Scribe",
  description: "The terms you agree to when you use Daily Scribe.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>
        Daily Scribe is an independent project run by {OWNER_NAME}. By creating an account or
        using the service you agree to these terms.
      </p>

      <h2>What the service is</h2>
      <p>
        Daily Scribe fetches content you select and emails it to you as a PDF on a schedule you
        control. It is currently in an early beta, offered free of charge, and is provided
        &ldquo;as is&rdquo; with no warranty. Features may change and the service may be paused
        or discontinued with reasonable notice.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your sign-in method secure. Use one sign-in method (email link, Google, or GitHub)
        consistently. You are responsible for the delivery address you configure and for any
        credentials you add for a service.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Use the service for your own personal, non-commercial reading.</li>
        <li>
          Do not attempt to overload, probe, or abuse the sending infrastructure, or use it to
          send mail to addresses that are not your own.
        </li>
        <li>Do not use the service to infringe anyone&rsquo;s rights or break the law.</li>
      </ul>
      <p>Accounts that abuse the service may be suspended or removed.</p>

      <h2>Third-party content and names</h2>
      <p>
        Editions may include material from third-party sources (for example news feeds). That
        material belongs to its publishers and is provided for your personal use; your use of it
        is subject to those publishers&rsquo; own terms. Where a service needs your own
        subscription or credentials (for example a newspaper login), you must have the right to
        use them and must follow that source&rsquo;s terms.
      </p>
      <p>
        Daily Scribe is not affiliated with, endorsed by, or sponsored by Amazon, Kindle, The
        New York Times, CBC, BBC, RTÉ, Home Assistant, Google, or GitHub. All trademarks belong
        to their respective owners.
      </p>

      <h2>Payment</h2>
      <p>
        The service is free during the beta. If paid tiers are introduced, you will be told
        before any charge applies and can decline.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent permitted by law, {OWNER_NAME} is not liable for any indirect or
        consequential loss arising from use of the service, or for a missed or delayed edition.
      </p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of {GOVERNING_LAW}.</p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </LegalPage>
  );
}
