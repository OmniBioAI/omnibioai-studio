import { authUrl, clearSession, getSessionVersion, getToken } from "../lib/session";
import { PERSONALIZATION_DEFAULTS, PERSONALIZATION_FIELDS, personalizationValues, validatePersonalization } from "./personalization";

export class PreferencesValidationError extends Error {
  constructor() {
    super("Check your preference values and try again.");
    this.code = "PREFERENCES_VALIDATION";
  }
}

export function validTimezone(value) {
  if (value === null) return true;
  if (typeof value !== "string" || (value !== "UTC" && !value.includes("/"))) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch (_) { return false; }
}

async function request(method, changes) {
  const token = getToken(), version = getSessionVersion();
  const current = () => token === getToken() && version === getSessionVersion();
  if (!token) return null;
  if (changes && (Object.keys(changes).some(field => field !== "timezone" && !PERSONALIZATION_FIELDS.includes(field)) ||
    (Object.hasOwn(changes, "timezone") && !validTimezone(changes.timezone)) ||
    Object.keys(validatePersonalization({ ...PERSONALIZATION_DEFAULTS, ...changes })).length)) throw new PreferencesValidationError();
  const response = await fetch(authUrl("/me/preferences"), {
    method, credentials: "omit", cache: "no-store",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(changes ? { "Content-Type": "application/json" } : {}) },
    ...(changes ? { body: JSON.stringify(changes) } : {}),
  });
  if (!current()) return null;
  if (response.status === 401) { clearSession(); return null; }
  if (response.status === 422) throw new PreferencesValidationError();
  if (!response.ok) throw new Error("Preferences service unavailable. Please try again.");
  const data = await response.json();
  if (!current()) return null;
  if (!data || !validTimezone(data.timezone)) throw new Error("Invalid preferences response");
  // Older IAM versions still support timezone. Do not invent saved AI values
  // or acknowledge a personalization PATCH if the service lacks the fields.
  if (PERSONALIZATION_FIELDS.some(field => Object.hasOwn(data, field))) {
    if (Object.keys(validatePersonalization(data)).length) throw new Error("Invalid preferences response");
    return { timezone: data.timezone, ...personalizationValues(data) };
  }
  if (changes && PERSONALIZATION_FIELDS.some(field => Object.hasOwn(changes, field))) throw new Error("Invalid preferences response");
  return { timezone: data.timezone };
}

export const getPreferences = () => request("GET");
export const updatePreferences = changes => request("PATCH", changes);
