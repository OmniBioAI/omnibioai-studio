// Standalone platform-detection helper for web-specific code under
// src/ui/lib/web/ and any future web-only components. Not imported by any
// existing (Electron-shared) file, per the isolation requirement — nothing
// here can change Electron build behavior.
//
// Checks both bridges preload.js exposes (electron/preload.js): `window.api`
// (config/docker lifecycle) and `window.electronAPI` (license/grafana/links).
// A narrower check on just one of the two would misreport platform if a
// future preload change adds one bridge before the other.
export function isElectron() {
  return typeof window !== "undefined" && !!(window.api || window.electronAPI);
}

export function isWeb() {
  return !isElectron();
}
