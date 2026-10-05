import React, { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getSessionVersion, getToken, onSessionChange } from "../lib/session";
import { getPreferences, updatePreferences } from "../lib/preferencesApi";

const PreferencesContext = createContext({ status: "unavailable", data: null });
export const usePreferences = () => useContext(PreferencesContext);

export default function PreferencesProvider({ currentUser, children }) {
  const version = useSyncExternalStore(onSessionChange, getSessionVersion);
  return <SessionPreferences owner={`${version}:${currentUser?.userId ?? "signed-out"}`} version={version}
    authenticated={!!currentUser}>{children}</SessionPreferences>;
}

function SessionPreferences({ owner, version, authenticated, children }) {
  const [state, setState] = useState({ owner, status: "loading", data: null, error: "", saving: false });
  const alive = useRef(false), serial = useRef(0), locked = useRef(false);
  const token = getToken();
  const current = id => alive.current && id === serial.current && version === getSessionVersion() && token === getToken();

  async function load() {
    const id = ++serial.current;
    setState({ owner, status: "loading", data: null, error: "", saving: false });
    try {
      const data = await getPreferences();
      if (current(id) && data) setState({ owner, status: "success", data, error: "", saving: false });
    } catch (_) {
      if (current(id)) setState({ owner, status: "error", data: null, error: "Unable to load preferences.", saving: false });
    }
  }

  useEffect(() => {
    alive.current = true;
    locked.current = false;
    if (authenticated) load();
    else setState({ owner, status: "unavailable", data: null, error: "", saving: false });
    return () => { alive.current = false; serial.current++; };
  }, [owner]);

  async function save(changes) {
    if (locked.current || state.owner !== owner || state.status !== "success") return false;
    locked.current = true;
    const id = ++serial.current;
    setState(previous => ({ ...previous, saving: true, error: "" }));
    try {
      const data = await updatePreferences(changes);
      if (current(id) && data) {
        setState({ owner, status: "success", data, saving: false, error: "" });
        return true;
      }
    } catch (_) {
      if (current(id)) setState(previous => ({ ...previous, saving: false, error: "Unable to save preferences. The change has not been confirmed." }));
    } finally {
      if (current(id)) locked.current = false;
    }
    return false;
  }

  // Mask the old account synchronously; do not remount Studio/embedded apps
  // just because a token refresh advances the authenticated generation.
  const effective = state.owner === owner ? state : { status: "loading", data: null, error: "", saving: false };
  return <PreferencesContext.Provider value={{ ...effective, owner, authenticated, reload: load, save }}>{children}</PreferencesContext.Provider>;
}

// IAM naive timestamps represent UTC. Date-only fields and embedded apps keep
// their own semantics; this helper is for Studio job/session/API-key instants.
export function useAccountDateTime() {
  const { data } = usePreferences();
  return (value, timeOnly = false) => {
    if (value === null || value === undefined || value === "") return "Unavailable";
    const normalized = typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value) ? `${value}Z` : value;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return "Unavailable";
    const options = { ...(data?.timezone ? { timeZone: data.timezone } : {}), timeZoneName: "short" };
    return timeOnly ? date.toLocaleTimeString(undefined, options) : date.toLocaleString(undefined, options);
  };
}
