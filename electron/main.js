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
      webSecurity: false,
      webviewTag: true,
    },
  });
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// Open all localhost URLs in system browser
app.on("web-contents-created", (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
});

app.whenReady().then(() => {
  createWindow();
  setTimeout(startLogStream, 3000);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ─── EXTERNAL LINKS ───────────────────────────────────
ipcMain.handle("open-external", async (_, url) => shell.openExternal(url));

// ─── CONFIG ───────────────────────────────────────────
ipcMain.handle("save-config",  async (_, config) => writeConfig(config));
ipcMain.handle("load-config",  async () => readConfig());
ipcMain.handle("reset-config", async () => resetConfig());

// ─── DOCKER LIFECYCLE ─────────────────────────────────
ipcMain.handle("start-docker", async () => {
  return new Promise((resolve, reject) => {
    exec("bash scripts/start.sh",
      { cwd: path.join(__dirname, "..") },
      (err, stdout, stderr) => {
        if (err) return reject(stderr);
        resolve(stdout);
      }
    );
  });
});

ipcMain.handle("stop-docker", async () => {
  return new Promise((resolve, reject) => {
    exec(
      "docker compose -f docker/docker-compose.yml down",
      { cwd: path.join(__dirname, "..") },
      (err, _, stderr) => {
        if (err) return reject(stderr);
        resolve("stopped");
      }
    );
  });
});

ipcMain.handle("restart-docker", async () => {
  return new Promise((resolve, reject) => {
    exec(
      "docker compose -f docker/docker-compose.yml restart",
      { cwd: path.join(__dirname, "..") },
      (err, _, stderr) => {
        if (err) return reject(stderr);
        resolve("restarted");
      }
    );
  });
});

// ─── RESTART INDIVIDUAL SERVICE ───────────────────────
ipcMain.handle("restart-service", async (_, name) => {
  const allowed = [
    "mysql","redis","workbench","tes","toolserver",
    "model-registry","lims","ollama","opa","control-center",
    "dev-hub"
  ];
  if (!allowed.includes(name)) throw new Error(`Unknown service: ${name}`);
  return new Promise((resolve, reject) => {
    exec(
      `docker compose -f docker/docker-compose.yml restart ${name}`,
      { cwd: path.join(__dirname, "..") },
      (err, _, stderr) => {
        if (err) return reject(stderr);
        resolve(`${name} restarted`);
      }
    );
  });
});

// ─── HEALTH CHECK — matches real container names ───────
ipcMain.handle("check-health", async () => {
  return new Promise((resolve) => {
    exec("docker ps --format '{{.Names}}'", (err, stdout) => {
      if (err) return resolve({
        mysql:false, redis:false, workbench:false, tes:false,
        toolserver:false, ollama:false, opa:false,
        lims:false, "model-registry":false, "control-center":false,
      });
      const running = stdout.split("\n").map(s => s.trim());
      resolve({
        mysql:            running.some(s => s.includes("mysql")         && !s.includes("buildx")),
        redis:            running.some(s => s.includes("redis")         && !s.includes("buildx")),
        workbench:        running.some(s => s.includes("workbench")     && !s.includes("buildx")),
        tes:              running.some(s => s.includes("tes")           && !s.includes("buildx")),
        toolserver:       running.some(s => s.includes("toolserver")    && !s.includes("buildx")),
        ollama:           running.some(s => s.includes("ollama")        && !s.includes("buildx")),
        opa:              running.some(s => s.includes("opa")           && !s.includes("buildx")),
        lims:             running.some(s => s.includes("lims")          && !s.includes("buildx")),
        "model-registry": running.some(s => s.includes("model-registry")&& !s.includes("buildx")),
        "control-center": running.some(s => s.includes("control-center")&& !s.includes("buildx")),
      });
    });
  });
});

// ─── LOG STREAMING ────────────────────────────────────
function startLogStream() {
  const containers = [
    "omnibioai-workbench",
    "omnibioai-tes",
    "omnibioai-toolserver",
    "omnibioai-celery-worker",
  ];
  const proc = spawn("docker", ["logs", "-f", "--tail=20", ...containers]);
  proc.stdout.on("data", (data) => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("log-stream", data.toString());
  });
  proc.stderr.on("data", (data) => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("log-stream", data.toString());
  });
}

// ─── OPEN WORKBENCH ───────────────────────────────────
ipcMain.handle("open-workbench", async () => {
  await shell.openExternal("http://localhost:8000");
  return true;
});
