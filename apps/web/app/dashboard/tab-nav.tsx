export interface TabDef {
  key: string;
  /** Full title, used as the accessible name and hover tooltip. */
  label: string;
  /** Emoji fallback glyph, used when `iconSrc` isn't set. */
  icon: string;
  /** Path to a real logo under /public; takes priority over `icon` when present. */
  iconSrc?: string;
  dirty?: boolean;
}

export function TabNav({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <nav className="tabnav" role="tablist" aria-label="Dashboard sections">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          aria-label={t.label}
          title={t.label}
          className={`tabnav-btn${active === t.key ? " active" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.iconSrc ? (
            <img src={t.iconSrc} alt="" aria-hidden="true" className="tabnav-icon" />
          ) : (
            <span aria-hidden="true" className="tabnav-emoji">
              {t.icon}
            </span>
          )}
          {t.dirty && <span className="tabnav-dot" aria-hidden="true" />}
        </button>
      ))}
    </nav>
  );
}
