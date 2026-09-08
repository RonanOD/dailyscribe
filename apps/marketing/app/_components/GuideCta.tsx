// Shared call-to-action rendered at the foot of every guide. Kept out of the
// Markdown so the copy and the per-guide ?ref= tag stay in one place.
export function GuideCta({ slug }: { slug: string }) {
  return (
    <aside className="guide-cta">
      <h2>Let Daily Scribe do this for you</h2>
      <p>
        Daily Scribe builds your edition every morning and emails it to your Kindle
        Scribe, any e-reader, or a plain inbox. It&rsquo;s in a small private beta and
        free while it lasts.
      </p>
      <p className="guide-cta-actions">
        <a className="btn btn--primary" href={`/?ref=guide-${slug}#get-started`}>
          Join the waitlist
        </a>
        <a
          className="btn btn--text"
          href="/uploads/daily-scribe-sample-digest.pdf"
          target="_blank"
          rel="noopener"
        >
          See a sample edition (PDF)
        </a>
      </p>
    </aside>
  );
}
