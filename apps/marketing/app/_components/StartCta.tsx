import { SIGN_IN_URL } from "./Masthead";

export interface StartCopy {
  button_label: string;
  note: string;
}

/**
 * The sign-up call to action. Links to the dashboard app's /start, which keeps
 * the ?ref= campaign tag (this page's own, or the default `source`) for the
 * signup report, then shows the sign-in page.
 */
export function StartCta({ copy, source }: { copy: StartCopy; source: string }) {
  return (
    <div className="start-cta">
      <a className="btn btn--primary" href={`${SIGN_IN_URL}/start?ref=${encodeURIComponent(source)}`} data-ref-link>
        {copy.button_label}
      </a>
      <p className="start-cta-note">{copy.note}</p>
    </div>
  );
}
