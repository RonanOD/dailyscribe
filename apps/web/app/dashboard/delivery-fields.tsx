"use client";

/** The full IANA timezone list, when the runtime supports it (all modern
 *  browsers do). Falls back to a free-text input where it doesn't. */
export const IANA_TIMEZONES: string[] =
  typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [];

/** Shared delivery-time & timezone inputs. Used once per form (the dashboard's
 *  "Delivery" tab and the onboarding "Schedule" step). */
export function DeliveryFields(props: {
  idPrefix: string;
  time: string;
  setTime: (v: string) => void;
  tz: string;
  setTz: (v: string) => void;
}) {
  const { idPrefix } = props;
  return (
    <div className="row">
      <div className="field">
        <label htmlFor={`${idPrefix}-time`}>Delivery time</label>
        <input
          id={`${idPrefix}-time`}
          type="time"
          value={props.time}
          onChange={(e) => props.setTime(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-tz`}>Timezone (IANA)</label>
        {IANA_TIMEZONES.length > 0 ? (
          <select
            id={`${idPrefix}-tz`}
            value={props.tz}
            onChange={(e) => props.setTz(e.target.value)}
          >
            {!IANA_TIMEZONES.includes(props.tz) && <option value={props.tz}>{props.tz}</option>}
            {IANA_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`${idPrefix}-tz`}
            type="text"
            value={props.tz}
            onChange={(e) => props.setTz(e.target.value)}
            placeholder="America/Toronto"
          />
        )}
      </div>
    </div>
  );
}
