import { useEffect, useState, useSyncExternalStore } from "react";
import { getStorageUsage } from "./artifactsApi";
import { getSessionVersion, onSessionChange } from "./session";

const LOADING = Object.freeze({ status: "loading", data: null, error: "" });

export function useStorageUsage(refreshKey = 0) {
  const version = useSyncExternalStore(onSessionChange, getSessionVersion);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState(LOADING);

  useEffect(() => {
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && version === getSessionVersion();
    setState(LOADING);
    getStorageUsage({ signal: controller.signal }).then(data => {
      if (current()) setState({ version, reload, refreshKey, status: "success", data, error: "" });
    }).catch(error => {
      if (current() && error?.name !== "AbortError") {
        setState({ version, reload, refreshKey, status: "error", data: null, error: error?.code || "unavailable" });
      }
    });
    return () => controller.abort();
  }, [version, reload, refreshKey]);

  useEffect(() => {
    // Returning from an upload or Billing should fetch a new projection.
    const refreshVisible = () => {
      if (document.visibilityState === "visible") setReload(value => value + 1);
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, []);

  // Mask the previous user's completed result during render, before effects.
  return state.version === version && state.reload === reload && state.refreshKey === refreshKey ? state : LOADING;
}
