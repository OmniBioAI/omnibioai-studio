const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {

  // ─── CONFIG ───────────────────────────────
  saveConfig:   (config)   => ipcRenderer.invoke("save-config", config),
  loadConfig:   ()         => ipcRenderer.invoke("load-config"),
  resetConfig:  ()         => ipcRenderer.invoke("reset-config"),

  // ─── DOCKER LIFECYCLE ─────────────────────
  startDocker:  ()         => ipcRenderer.invoke("start-docker"),
  stopDocker:   ()         => ipcRenderer.invoke("stop-docker"),
  restartDocker:()         => ipcRenderer.invoke("restart-docker"),

  // ─── INDIVIDUAL SERVICE ───────────────────
  restartService:(name)    => ipcRenderer.invoke("restart-service", name),

  // ─── HEALTH ───────────────────────────────
  checkHealth:  ()         => ipcRenderer.invoke("check-health"),

  // ─── LOGS ─────────────────────────────────
  getLogs:      ()         => ipcRenderer.invoke("get-logs"),
  streamLogs:   (callback) =>
    ipcRenderer.on("log-stream", (_, data) => callback(data)),

  // ─── WORKBENCH ────────────────────────────
  openWorkbench:()         => ipcRenderer.invoke("open-workbench"),
});