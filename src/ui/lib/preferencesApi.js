import { authUrl, clearSession, getSessionVersion, getToken } from "../lib/session";

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
  const response = await fetch(authUrl("/me/preferences"), {
    method, credentials: "omit", cache: "no-store",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(changes ? { "Content-Type": "application/json" } : {}) },
    ...(changes ? { body: JSON.stringify(changes) } : {}),
  });
  if (!current()) return null;
  if (response.status === 401) { clearSession(); return null; }
  if (!response.ok) throw new Error("Preferences service unavailable. Please try again.");
  const data = await response.json();
  if (!current()) return null;
  if (!data || !validTimezone(data.timezone)) throw new Error("Invalid preferences response");
  return { timezone: data.timezone };
}

export const getPreferences = () => request("GET");
export const updatePreferences = changes => request("PATCH", changes);
