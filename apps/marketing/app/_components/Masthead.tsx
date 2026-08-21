const SIGN_IN_URL = "https://my.dailyscribe.ca";

export function Masthead() {
  return (
    <>
      <div className="utility-bar">
        <div className="utility-inner">
          <span>Good Morning &mdash; Your Edition Is On Its Way</span>
          <a className="utility-signin" href={SIGN_IN_URL}>
            Sign In
          </a>
        </div>
      </div>

      <header className="masthead">
        <p className="masthead-kicker">
          Delivered Every Morning &middot; Kindle Scribe, Any E-Reader, or Plain Email
        </p>
        <h1 className="masthead-title">The Daily Scribe</h1>
        <p className="masthead-tagline">One inbox. One PDF. Everything worth reading before breakfast.</p>
      </header>

      <nav className="sectionnav">
        <div className="sectionnav-inner">
          <a href="#practice">Practice</a>
          <a href="#play">Play</a>
          <a href="#read">Read</a>
          <a href="#live">Live</a>
          <a href="#premium">Premium</a>
          <a className="sectionnav-cta" href={SIGN_IN_URL}>
            Get Started
          </a>
        </div>
      </nav>
    </>
  );
}

export { SIGN_IN_URL };
