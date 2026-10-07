// Shared Electron-safe / browser-safe external-link opener.
//
// Extracted from Settings.jsx's existing `openExternal`, unchanged: Electron
// exposes `window.api.openExternal` via its preload bridge
// (electron/preload.js -> ipcRenderer.invoke("open-external", url) ->
// electron/main.js's shell.openExternal), which opens the URL in the user's
// default OS browser rather than Electron's own shell. A plain browser tab
// has no such bridge, so it falls back to a normal new-tab window.open.
//
// Same-origin-relative URLs are never passed here — every caller only ever
// passes a verified, hardcoded https:// destination, never a value derived
// from user input, a query param, or a backend response field.
export function openExternal(url) {
  if (window.api?.openExternal) {
    window.api.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
