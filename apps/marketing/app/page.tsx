import ReactMarkdown from "react-markdown";
import { getLandingContent } from "@/lib/content";
import { Masthead, SIGN_IN_URL } from "./_components/Masthead";

export default function HomePage() {
  const content = getLandingContent();

  return (
    <div className="page">
      <Masthead />

      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <span className="dateline">{content.dateline}</span>
              <h2 className="hero-headline">{content.hero_heading}</h2>
              <p className="hero-dek">{content.hero_subheading}</p>
              <div className="hero-actions">
                <a className="btn btn--primary" href={SIGN_IN_URL}>
                  Start Reading Free
                </a>
                <a className="btn btn--text" href="#inside">
                  See what&rsquo;s inside &#8595;
                </a>
              </div>
            </div>
            <div className="hero-art">
              <img src={content.hero_image} alt={content.hero_image_alt} width={420} height={460} />
            </div>
          </div>
        </section>

        <section className="teasers" id="inside">
          <div className="container teaser-grid">
            {content.teasers.map((teaser) => (
              <div className="teaser" key={teaser.anchor}>
                <p className="kicker">{teaser.kicker}</p>
                <h3 className="teaser-title">{teaser.title}</h3>
                <p className="teaser-dek">{teaser.body}</p>
                <a className="teaser-link" href={`#${teaser.anchor}`}>
                  Read more &rarr;
                </a>
              </div>
            ))}
          </div>
        </section>

        <section className="how">
          <div className="container">
            <h2 className="how-title">How your edition gets made</h2>
            <div className="how-grid">
              {content.how_it_works.map((step) => (
                <div className="how-step" key={step.numeral}>
                  <p className="how-numeral">{step.numeral}</p>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {content.features.map((feature) => (
          <section
            key={feature.id}
            id={feature.id}
            className={`feature${feature.media_right ? " feature--media-right" : ""}`}
          >
            <div className="container feature-grid">
              {feature.media_right ? (
                <>
                  <FeatureBody feature={feature} />
                  <div className="feature-art">
                    <img src={feature.image} alt={feature.image_alt} width={220} height={220} />
                  </div>
                </>
              ) : (
                <>
                  <div className="feature-art">
                    <img src={feature.image} alt={feature.image_alt} width={220} height={220} />
                  </div>
                  <FeatureBody feature={feature} />
                </>
              )}
            </div>
          </section>
        ))}
      </main>

      <section className="premium" id="premium">
        <div className="container">
          <div className="premium-box">
            <div>
              <p className="kicker">Premium</p>
              <h2 className="premium-headline">{content.premium_callout.heading}</h2>
              <p className="premium-body">{content.premium_callout.body}</p>
              <a className="btn btn--primary" href={SIGN_IN_URL}>
                Upgrade to Premium
              </a>
            </div>
            <ul className="premium-list">
              {content.premium_callout.points.map((point) => (
                <li key={point.heading}>
                  <strong>{point.heading}</strong> {point.body}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="plainmail">
        <div className="container plainmail-grid">
          <div className="plainmail-art">
            <img
              src={content.plain_email_note.image}
              alt={content.plain_email_note.image_alt}
              width={220}
              height={160}
            />
          </div>
          <div>
            <h2 className="plainmail-headline">{content.plain_email_note.heading}</h2>
            <p className="plainmail-body">{content.plain_email_note.body}</p>
          </div>
        </div>
      </section>

      <section className="readers">
        <div className="container">
          <h2 className="readers-title">Built for people who still like paper</h2>
          <p className="readers-sub">A few of the mornings Daily Scribe was made for.</p>
          <div className="readers-grid">
            {content.vignettes.map((vignette) => (
              <div className="readers-card" key={vignette.caption}>
                <img src={vignette.image} alt={vignette.image_alt} width={92} height={92} />
                <p>{vignette.caption}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta" id="get-started">
        <div className="container">
          <h2>{content.final_cta.heading}</h2>
          <p>{content.final_cta.body}</p>
          <a className="btn btn--primary" href={SIGN_IN_URL}>
            Sign In To Get Started
          </a>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div className="footer-brand">
            <h2>The Daily Scribe</h2>
            <p>One inbox. One PDF. Every morning.</p>
          </div>
          <div className="footer-links">
            <div className="footer-col">
              <h4>Sections</h4>
              <a href="#practice">Practice</a>
              <a href="#play">Play</a>
              <a href="#read">Read</a>
              <a href="#live">Live</a>
            </div>
            <div className="footer-col">
              <h4>Coming Soon</h4>
              <a href="#play">Dungeons &amp; Dragons</a>
              <a href="#read">Classic Novels</a>
              <a href="#health">Eating &amp; Drinking</a>
            </div>
            <div className="footer-col">
              <h4>Account</h4>
              <a href="#premium">Premium</a>
              <a href={SIGN_IN_URL}>Sign In</a>
            </div>
          </div>
        </div>
        <div className="container footer-legal">
          <span>&copy; {new Date().getFullYear()} The Daily Scribe</span>
          <span>dailyscribe.ca</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureBody({
  feature,
}: {
  feature: ReturnType<typeof getLandingContent>["features"][number];
}) {
  return (
    <div>
      <p className="kicker">{feature.kicker}</p>
      <h2 className="feature-headline">{feature.title}</h2>
      <ReactMarkdown components={{ p: (props) => <p className="feature-body" {...props} /> }}>
        {feature.body}
      </ReactMarkdown>
      <p className="feature-note">
        {feature.coming_soon && <span className="stamp">Coming Soon</span>} {feature.note}
      </p>
    </div>
  );
}
