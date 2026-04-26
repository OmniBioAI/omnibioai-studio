const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const { writeConfig, readConfig, resetConfig } = require("../backend/config");
const { exec, spawn } = require("child_process");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
  });
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  setTimeout(startLogStream, 3000);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ─── CONFIG ───────────────────────────────────────────
ipcMain.handle("save-config",  async (_, config) => writeConfig(config));
ipcMain.handle("load-config",  async () => readConfig());
ipcMain.handle("reset-config", async () => resetConfig());

// ─── DOCKER LIFECYCLE ─────────────────────────────────
ipcMain.handle("start-docker", async () => {
  return new Promise((resolve, reject) => {
    exec("bash scripts/start.sh", { cwd: path.join(__dirname, "..") },
      (err, stdout, stderr) => { if (err) return reject(stderr); resolve(stdout); }
    );
  });
});

ipcMain.handle("stop-docker", async () => {
  return new Promise((resolve, reject) => {
    exec("docker compose -f docker/docker-compose.yml down",
      { cwd: path.join(__dirname, "..") },
      (err, _, stderr) => { if (err) return reject(stderr); resolve("stopped"); }
    );
  });
});

ipcMain.handle("restart-docker", async () => {
  return new Promise((resolve, reject) => {
    exec("docker compose -f docker/docker-compose.yml restart",
      { cwd: path.join(__dirname, "..") },
      (err, _, stderr) => { if (err) return reject(stderr); resolve("restarted"); }
    );
  });
});

// ─── RESTART INDIVIDUAL SERVICE ───────────────────────
ipcMain.handle("restart-service", async (_, name) => {
  const allowed = ["mysql","redis","workbench","tes","toolserver",
    "model-registry","lims","ollama","opa","control-center"];
  if (!allowed.includes(name)) throw new Error(`Unknown service: ${name}`);
  return new Promise((resolve, reject) => {
    exec(`docker compose -f docker/docker-compose.yml restart ${name}`,
      { cwd: path.join(__dirname, "..") },
      (err, _, stderr) => { if (err) return reject(stderr); resolve(`${name} restarted`); }
    );
  });
});

// ─── HEALTH CHECK — exact container names ─────────────
ipcMain.handle("check-health", async () => {
  return new Promise((resolve) => {
    exec("docker ps --format '{{.Names}}'", (err, stdout) => {
      if (err) return resolve({
        mysql:false, redis:false, workbench:false, tes:false,
        toolserver:false, ollama:false, rag:false, opa:false,
        lims:false, "model-registry":false, "control-center":false,
      });
      const running = stdout.split("\n").map(s => s.trim());
      resolve({
        mysql:            running.includes("docker-mysql-1"),
        redis:            running.includes("docker-redis-1"),
        workbench:        running.includes("omnibioai-workbench"),
        tes:              running.includes("omnibioai-tes"),
        toolserver:       running.includes("omnibioai-toolserver"),
        ollama:           running.includes("docker-ollama-1"),
        rag:              running.includes("omnibioai-rag"),
        opa:              running.includes("docker-opa-1"),
        lims:             running.includes("lims-x"),
        "model-registry": running.includes("omnibioai-model-registry"),
        "control-center": running.includes("omnibioai-control-center"),
      });
    });
  });
});

// ─── LOG STREAMING ────────────────────────────────────
function startLogStream() {
  const proc = spawn("docker", [
    "compose", "-f", "docker/docker-compose.yml", "logs", "-f", "--tail=20"
  ], { cwd: path.join(__dirname, "..") });

  proc.stdout.on("data", (data) => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("log-stream", data.toString());
  });
}

// ─── OPEN WORKBENCH ───────────────────────────────────
ipcMain.handle("open-workbench", async () => {
  await shell.openExternal("http://localhost:8000");
  return true;
});
