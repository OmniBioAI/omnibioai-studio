import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_APPEARANCE, loadAppearance, saveAppearance } from "../lib/appearanceApi";

const AppearanceContext = createContext({
  ...DEFAULT_APPEARANCE,
  resolvedTheme: "dark",
  resolvedMotion: "system",
  setMode: () => {},
  setAccent: () => {},
  setDensity: () => {},
  setReducedMotion: () => {},
});

export const useAppearance = () => useContext(AppearanceContext);

// jsdom (this app's test environment) does not implement matchMedia at all —
// every call site must tolerate its absence rather than crash the app shell.
function safeMatchMedia(query) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  try { return window.matchMedia(query); } catch (_) { return null; }
}

// Subscribes to a MediaQueryList's "change" event (or the legacy
// addListener/removeListener pair some older WebKit builds only support),
// calling `onChange(matches)` once immediately and again on every change.
// No-op cleanup when matchMedia isn't available at all.
function useMediaQueryPreference(query, onChange) {
  useEffect(() => {
    const mql = safeMatchMedia(query);
    if (!mql) return;
    onChange(mql.matches);
    const handler = event => onChange(event.matches);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    if (typeof mql.addListener === "function") {
      mql.addListener(handler);
      return () => mql.removeListener(handler);
    }
  }, [query, onChange]);
}

// AppearanceProvider is intentionally mounted above LicenseGate/PreferencesProvider
// in App.jsx: Appearance has nothing to do with auth or personal server-synced
// preferences (/me/preferences) and should apply even on the signed-out Login
// screen. userId scopes storage only — Appearance itself never requires auth.
export default function AppearanceProvider({ userId, children }) {
  const [appearance, setAppearance] = useState(() => loadAppearance(userId));
  const [systemDark, setSystemDark] = useState(true);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const loadedForUser = useRef(userId);

  useEffect(() => {
    if (loadedForUser.current === userId) return;
    loadedForUser.current = userId;
    setAppearance(loadAppearance(userId));
  }, [userId]);

  useMediaQueryPreference("(prefers-color-scheme: dark)", setSystemDark);
  useMediaQueryPreference("(prefers-reduced-motion: reduce)", setSystemReducedMotion);

  const resolvedTheme = appearance.mode === "system" ? (systemDark ? "dark" : "light") : appearance.mode;
  const resolvedMotion = appearance.reducedMotion === "reduce" || systemReducedMotion ? "reduce" : "system";

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.accent = appearance.accent;
    root.dataset.density = appearance.density;
    root.dataset.motion = resolvedMotion;
  }, [resolvedTheme, appearance.accent, appearance.density, resolvedMotion]);

  useEffect(() => {
    saveAppearance(userId, appearance);
  }, [userId, appearance]);

  const value = useMemo(() => ({
    ...appearance,
    resolvedTheme,
    resolvedMotion,
    setMode: mode => setAppearance(previous => ({ ...previous, mode })),
    setAccent: accent => setAppearance(previous => ({ ...previous, accent })),
    setDensity: density => setAppearance(previous => ({ ...previous, density })),
    setReducedMotion: reducedMotion => setAppearance(previous => ({ ...previous, reducedMotion })),
  }), [appearance, resolvedTheme, resolvedMotion]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
