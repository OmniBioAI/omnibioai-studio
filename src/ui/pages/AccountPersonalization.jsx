import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Card, Spinner } from "@omnibioai/ui";
import { usePreferences } from "../components/PreferencesProvider";
import { PERSONALIZATION_DEFAULTS, PERSONALIZATION_FIELDS, PERSONAL_INSTRUCTIONS_MAX_LENGTH,
  RESPONSE_STYLES, TECHNICAL_LEVELS, PREFERRED_LANGUAGES, instructionLength,
  personalizationValues, validatePersonalization } from "../lib/personalization";
import "./AccountPersonalization.css";

export default function AccountPersonalization() {
  const { owner } = usePreferences();
  return <PersonalizationForm key={owner} />;
}

function PersonalizationForm() {
  const preferences = usePreferences();
  const available = preferences.data && PERSONALIZATION_FIELDS.every(field => Object.hasOwn(preferences.data, field));
  const [draft, setDraft] = useState(PERSONALIZATION_DEFAULTS);
  const [saved, setSaved] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useLayoutEffect(() => {
    if (available) setDraft(personalizationValues(preferences.data));
  }, [preferences.data, available]);
  if (!preferences.authenticated) return <p>Sign in to manage your personalization.</p>;

  const errors = validatePersonalization(draft);
  const valid = Object.keys(errors).length === 0;
  const dirty = available && PERSONALIZATION_FIELDS.some(field => draft[field] !== preferences.data[field]);
  const change = (field, value) => { setDraft(previous => ({ ...previous, [field]: value })); setSaved(false); };

  async function save(event) {
    event.preventDefault();
    if (!valid || !dirty || preferences.saving) return;
    const changes = Object.fromEntries(PERSONALIZATION_FIELDS.filter(field => draft[field] !== preferences.data[field]).map(field => [field, draft[field]]));
    const success = await preferences.save(changes);
    if (alive.current) setSaved(success);
  }

  const select = (field, label, options, help) => <div className="personalization-field">
    <label htmlFor={`personalization-${field}`}>{label}</label>
    <select id={`personalization-${field}`} className="studio-field" value={draft[field] ?? ""} disabled={preferences.saving}
      onChange={event => change(field, event.target.value || null)} aria-invalid={!!errors[field]}
      aria-describedby={`personalization-${field}-help${errors[field] ? ` personalization-${field}-error` : ""}`}>
      {field === "preferred_language" && <option value="">Use the AI default</option>}
      {Object.entries(options).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
    </select>
    <p id={`personalization-${field}-help`}>{help}</p>
    {errors[field] && <p id={`personalization-${field}-error`} role="alert">{errors[field]}</p>}
  </div>;

  return <section className="personalization-page" aria-labelledby="personalization-heading">
    <h2 id="personalization-heading">Personalization</h2>
    <p className="account-preferences-description">Personal preferences for AI response presentation, technical depth and language, saved to your account across devices.</p>
    <p className="account-preferences-description">AI apps do not apply these settings yet. These preferences do not change scientific validation or account security.</p>
    <Card title="AI interaction preferences">
      {preferences.status === "loading" && <p role="status"><Spinner size="sm" /> Loading personalization…</p>}
      {preferences.status === "error" && <><p role="alert">{preferences.error}</p><Button onClick={preferences.reload}>Retry</Button></>}
      {preferences.status === "success" && !available && <><p role="alert">Personalization is not available from your account service yet.</p><Button onClick={preferences.reload}>Retry</Button></>}
      {preferences.status === "success" && available && <form className="account-preferences-form personalization-form" onSubmit={save} aria-busy={preferences.saving} noValidate>
        {select("response_style", "Response style", RESPONSE_STYLES, "Choose the amount of detail you prefer in AI responses.")}
        {select("technical_level", "Technical level", TECHNICAL_LEVELS, "Choose your preferred depth of explanation.")}
        {select("preferred_language", "Preferred language", PREFERRED_LANGUAGES, "Your preferred language for AI responses.")}
        <div className="personalization-field">
          <label htmlFor="personalization-instructions">Personal instructions</label>
          <textarea id="personalization-instructions" className="studio-field" rows={6} value={draft.personal_instructions}
            disabled={preferences.saving} onChange={event => change("personal_instructions", event.target.value)}
            aria-invalid={!!errors.personal_instructions} aria-describedby={`personalization-instructions-help personalization-instructions-count${errors.personal_instructions ? " personalization-instructions-error" : ""}`} />
          <p id="personalization-instructions-help">Optional plain-text preferences, such as “Define abbreviations.” Up to 2,000 characters.</p>
          <p id="personalization-instructions-count">{instructionLength(draft.personal_instructions)} / {PERSONAL_INSTRUCTIONS_MAX_LENGTH} characters</p>
          {errors.personal_instructions && <p id="personalization-instructions-error" role="alert">{errors.personal_instructions}</p>}
        </div>
        {preferences.error && <p role="alert">{preferences.error}</p>}
        <button type="submit" className="omni-btn omni-btn--primary omni-btn--sm" disabled={!valid || !dirty || preferences.saving}>{preferences.saving ? "Saving…" : "Save personalization"}</button>
        {preferences.saving && <p role="status">Saving personalization…</p>}
        {saved && <p role="status">Personalization saved.</p>}
      </form>}
    </Card>
  </section>;
}
