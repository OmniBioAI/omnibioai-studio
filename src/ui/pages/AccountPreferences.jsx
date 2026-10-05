import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Card, Spinner } from "@omnibioai/ui";
import { usePreferences } from "../components/PreferencesProvider";
import { validTimezone } from "../lib/preferencesApi";

export default function AccountPreferences() {
  const { owner } = usePreferences();
  return <PreferenceForm key={owner} />;
}

function PreferenceForm() {
  const preferences = usePreferences();
  const [timezone, setTimezone] = useState(() => preferences.data?.timezone || "");
  const [saved, setSaved] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useLayoutEffect(() => { setTimezone(preferences.data?.timezone || ""); }, [preferences.data]);
  if (!preferences.authenticated) return <p>Sign in to manage your preferences.</p>;
  const valid = validTimezone(timezone || null);
  const dirty = timezone !== (preferences.data?.timezone || "");

  async function save(event) {
    event.preventDefault();
    if (!valid || !dirty || preferences.saving) return;
    const success = await preferences.save({ timezone: timezone || null });
    if (alive.current) setSaved(success);
  }

  return <section aria-labelledby="preferences-heading">
    <h2 id="preferences-heading">Preferences</h2>
    <p className="account-preferences-description">Personal settings saved to your OmniBioAI account across devices.</p>
    <Card title="Time display">
      {preferences.status === "loading" && <p role="status"><Spinner size="sm" /> Loading preferences…</p>}
      {preferences.status === "error" && <><p role="alert">{preferences.error}</p><Button onClick={preferences.reload}>Retry</Button></>}
      {preferences.status === "success" && <form className="account-preferences-form" onSubmit={save} aria-busy={preferences.saving}>
        <label htmlFor="account-timezone">Time zone</label>
        <input id="account-timezone" className="studio-field" list="account-timezones" value={timezone}
          onChange={event => { setTimezone(event.target.value); setSaved(false); }} disabled={preferences.saving}
          aria-invalid={!valid} aria-describedby="timezone-help timezone-validation" placeholder="Use this device’s time zone" autoComplete="off" />
        <datalist id="account-timezones">{["UTC", "America/Chicago", "America/New_York", "Europe/London", "Asia/Kolkata"].map(zone => <option key={zone} value={zone} />)}</datalist>
        <p id="timezone-help">Enter an IANA time zone, such as America/Chicago, or leave blank to use this device’s time zone. Applies to Studio job times, sessions and personal API-key timestamps. Date-only records and embedded applications keep their own formatting.</p>
        <p id="timezone-validation">{!valid ? "Enter a valid IANA time zone or UTC." : ""}</p>
        {preferences.error && <p role="alert">{preferences.error}</p>}
        <button type="submit" className="omni-btn omni-btn--primary omni-btn--sm" disabled={!valid || !dirty || preferences.saving}>{preferences.saving ? "Saving…" : "Save preferences"}</button>
        {saved && <p role="status">Preferences saved.</p>}
      </form>}
    </Card>
  </section>;
}
