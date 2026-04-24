const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { writeConfig } = require("../backend/config");
const { exec } = require("child_process");
const fs = require("fs");

let mainWindow;

function createWindow() {

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // ─────────────────────────────
  // DEV vs PROD SWITCH
  // ─────────────────────────────

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "../dist/index.html")
    );
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ─────────────────────────────
// CONFIG MANAGEMENT
// ─────────────────────────────

ipcMain.handle("save-config", async (_, config) => {
  writeConfig(config);

  fs.writeFileSync(
    path.join(app.getPath("userData"), "omnibioai.config.json"),
    JSON.stringify(config, null, 2)
  );

  return true;
});

// ─────────────────────────────
// DOCKER CONTROL
// ─────────────────────────────

ipcMain.handle("start-docker", async () => {
  return new Promise((resolve, reject) => {

    exec("bash scripts/start.sh", (err, stdout, stderr) => {

      if (err) {
        console.error(stderr);
        reject(stderr);
        return;
      }

      resolve(stdout);
    });
  });
});

// ─────────────────────────────
// HEALTH CHECK (IMPORTANT)
// ─────────────────────────────

ipcMain.handle("check-health", async () => {
  return new Promise((resolve) => {

    exec("docker ps --format '{{.Names}}'", (err, stdout) => {

      const services = stdout.split("\n");

      resolve({
        toolserver: services.includes("omnibioai-toolserver"),
        tes: services.includes("omnibioai-tes"),
        mysql: services.includes("omnibioai-mysql"),
        redis: services.includes("omnibioai-redis"),
        workbench: services.includes("omnibioai-workbench")
      });
    });
  });
});

// ─────────────────────────────
// STOP SYSTEM
// ─────────────────────────────

ipcMain.handle("stop-docker", async () => {
  return new Promise((resolve, reject) => {

    exec("docker compose down", (err, stdout, stderr) => {

      if (err) return reject(stderr);

      resolve("stopped");
    });
  });
});