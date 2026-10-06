// Frontend-local Appearance (V1) persistence. Deliberately independent of
// preferencesApi.js — Appearance controls how Studio LOOKS and must never
// touch the /me/preferences backend contract or carry user identity/secrets.
// Stored value is user-scoped (keyed by userId, same identity Studio already
// uses for the session) so a shared browser profile can't leak one person's
// theme choice into another signed-in account.
const STORAGE_PREFIX = "omnibioai_appearance";
const VERSION = 1;

export const MODES = ["system", "light", "dark"];
export const ACCENTS = ["teal", "blue", "purple", "orange"];
export const DENSITIES = ["comfortable", "compact"];
export const MOTION_PREFS = ["system", "reduce"];

export const DEFAULT_APPEARANCE = Object.freeze({
  version: VERSION,
  mode: "system",
  accent: "teal",
  density: "comfortable",
  reducedMotion: "system",
});

function storageKey(userId) {
  return `${STORAGE_PREFIX}:${userId ?? "anonymous"}`;
}

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

// Never throws — a corrupt, tampered, or future-version record safely falls
// back to defaults field-by-field rather than breaking the Appearance page.
export function loadAppearance(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { ...DEFAULT_APPEARANCE };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_APPEARANCE };
    return {
      version: VERSION,
      mode: pick(parsed.mode, MODES, DEFAULT_APPEARANCE.mode),
      accent: pick(parsed.accent, ACCENTS, DEFAULT_APPEARANCE.accent),
      density: pick(parsed.density, DENSITIES, DEFAULT_APPEARANCE.density),
      reducedMotion: pick(parsed.reducedMotion, MOTION_PREFS, DEFAULT_APPEARANCE.reducedMotion),
    };
  } catch (_) {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(userId, appearance) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify({ ...DEFAULT_APPEARANCE, ...appearance, version: VERSION }));
  } catch (_) {
    // Storage unavailable (private mode, quota) — appearance degrades to
    // session-only state; nothing else in Studio depends on it persisting.
  }
}
