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
    ipcRenderer.on("docker-log", (_, line) => callback(line)),

  // ─── LOGS — live service log stream ───────────────
  streamLogs:    (callback) =>
    ipcRenderer.on("log-stream", (_, data) => callback(data)),

  // ─── AUTO-UPDATE ───────────────────────────────────
  onUpdateAvailable: (callback) =>
    ipcRenderer.on("update-available", (_, info) => callback(info)),
  onUpdateError:     (callback) =>
    ipcRenderer.on("update-error", (_, info) => callback(info)),

  // ─── CREDENTIALS ──────────────────────────────────
  getCredentials: ()        => ipcRenderer.invoke("get-credentials"),

  // ─── WORKBENCH & LINKS ────────────────────────────
  openWorkbench: ()         => ipcRenderer.invoke("open-workbench"),
  openExternal:  (url)      => ipcRenderer.invoke("open-external", url),
  loadUrl:       (url)      => ipcRenderer.invoke("load-url", url),
  goHome:        ()         => ipcRenderer.invoke("go-home"),
});

contextBridge.exposeInMainWorld("electronAPI", {
  validateLicense: (key)           => ipcRenderer.invoke("license-validate", key),
  getLicense:      ()              => ipcRenderer.invoke("license-get-cached"),
  clearLicense:    ()              => ipcRenderer.invoke("license-clear"),
  grafanaLogin:    (user, password) => ipcRenderer.invoke("grafana-login", user, password),
});
