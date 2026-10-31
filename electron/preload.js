const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {

  // ─── CONFIG ───────────────────────────────────────
  saveConfig:    (config)   => ipcRenderer.invoke("save-config", config),
  loadConfig:    ()         => ipcRenderer.invoke("load-config"),
  resetConfig:   ()         => ipcRenderer.invoke("reset-config"),

  // ─── DOCKER LIFECYCLE ─────────────────────────────
  startDocker:   ()         => ipcRenderer.invoke("start-docker"),
  stopDocker:    ()         => ipcRenderer.invoke("stop-docker"),
  restartDocker: ()         => ipcRenderer.invoke("restart-docker"),

  // ─── INDIVIDUAL SERVICE ───────────────────────────
  restartService: (name)    => ipcRenderer.invoke("restart-service", name),

  // ─── HEALTH ───────────────────────────────────────
  checkHealth:   ()         => ipcRenderer.invoke("check-health"),

  // ─── LOGS — docker compose up/pull output ─────────
  onDockerLog:   (callback) =>
    subscribe("docker-log", callback),

  // ─── LOGS — live service log stream ───────────────
  streamLogs:    (callback) =>
    subscribe("log-stream", callback),

  // ─── AUTO-UPDATE ───────────────────────────────────
  onUpdateAvailable: (callback) =>
    subscribe("update-available", callback),
  onUpdateError:     (callback) =>
    subscribe("update-error", callback),

  // Return credential presence only; secret values never cross into renderer code.
  getCredentialStatus: () => ipcRenderer.invoke("credential-status"),

  // ─── WORKBENCH & LINKS ────────────────────────────
  openWorkbench: ()         => ipcRenderer.invoke("open-workbench"),
  openExternal:  (url)      => ipcRenderer.invoke("open-external", url),
  goHome:        ()         => ipcRenderer.invoke("go-home"),
});

function subscribe(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("electronAPI", {
  // Narrow account-session facade. It never returns access/refresh tokens or
  // accepts arbitrary URLs; the main process owns credentials and requests.
  authSessionStatus: () => ipcRenderer.invoke("auth-session-status"),
  authSessionLogin: (credentials) => ipcRenderer.invoke("auth-session-login", credentials),
  authSessionMfa: (input) => ipcRenderer.invoke("auth-session-mfa", input),
  authSessionMfaResend: (input) => ipcRenderer.invoke("auth-session-mfa-resend", input),
  authSessionRefresh: () => ipcRenderer.invoke("auth-session-refresh"),
  authSessionIdentity: () => ipcRenderer.invoke("auth-session-identity"),
  authSessionLogout: () => ipcRenderer.invoke("auth-session-logout"),
  onAuthSessionChange: (callback) => subscribe("auth-session-changed", callback),
  validateLicense: (credentials)   => ipcRenderer.invoke("license-validate", credentials),
  getLicense:      ()              => ipcRenderer.invoke("license-get-cached"),
  clearLicense:    ()              => ipcRenderer.invoke("license-clear"),
  grafanaLogin:    ()              => ipcRenderer.invoke("grafana-login"),
});
