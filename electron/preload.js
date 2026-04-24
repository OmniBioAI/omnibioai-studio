const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {

  // ─────────────────────────────
  // CONFIG
  // ─────────────────────────────

  saveConfig: (config) =>
    ipcRenderer.invoke("save-config", config),

  loadConfig: () =>
    ipcRenderer.invoke("load-config"),

  resetConfig: () =>
    ipcRenderer.invoke("reset-config"),

  // ─────────────────────────────
  // DOCKER LIFECYCLE
  // ─────────────────────────────

  startDocker: () =>
    ipcRenderer.invoke("start-docker"),

  stopDocker: () =>
    ipcRenderer.invoke("stop-docker"),

  restartDocker: () =>
    ipcRenderer.invoke("restart-docker"),

  // ─────────────────────────────
  // HEALTH & STATUS
  // ─────────────────────────────

  checkHealth: () =>
    ipcRenderer.invoke("check-health"),

  getLogs: () =>
    ipcRenderer.invoke("get-logs"),

  streamLogs: (callback) =>
    ipcRenderer.on("log-stream", (_, data) =>
      callback(data)
    ),

  // ─────────────────────────────
  // CLOUD VALIDATION
  // ─────────────────────────────

  validateCloud: () =>
    ipcRenderer.invoke("validate-cloud"),

  testAWS: () =>
    ipcRenderer.invoke("test-aws"),

  testAzure: () =>
    ipcRenderer.invoke("test-azure"),

  // ─────────────────────────────
  // HPC VALIDATION
  // ─────────────────────────────

  validateHPC: () =>
    ipcRenderer.invoke("validate-hpc"),

  testSSH: () =>
    ipcRenderer.invoke("test-ssh"),

  // ─────────────────────────────
  // LLM CONTROL LAYER
  // ─────────────────────────────

  testLLM: (provider) =>
    ipcRenderer.invoke("test-llm", provider),

  setActiveModel: (model) =>
    ipcRenderer.invoke("set-model", model),

  // ─────────────────────────────
  // UI ACTIONS
  // ─────────────────────────────

  openWorkbench: () =>
    ipcRenderer.invoke("open-workbench")
});