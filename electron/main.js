const { app, BrowserWindow, ipcMain, shell, session } = require("electron");
const path = require("path");
const fs = require("fs");
const { writeConfig, readConfig, resetConfig } = require("../backend/config");
const { spawn, execFile } = require("child_process");

const BETA_MODE = true;

let mainWindow;

// ─── PATH HELPERS ─────────────────────────────────────────────────────────────
function getComposePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "docker-compose.yml");
  }
  return path.join(__dirname, "..", "docker-compose.yml");
}

function getEnvPath() {
  return path.join(app.getPath("userData"), ".env");
}

function getDbInitPath() {
  if (app.isPackaged) {
    return path.join(app.getPath("userData"), "db-init");
  }
  return path.join(__dirname, "..", "db-init");
}

function ensureDbInit() {
  if (!app.isPackaged) return;
  const dest = getDbInitPath();
  if (fs.existsSync(dest)) return;
  const src = path.join(process.resourcesPath, "db-init");
  if (fs.existsSync(src)) fs.cpSync(src, dest, { recursive: true });
}

// ─── DOCKER HELPERS ───────────────────────────────────────────────────────────
function composeArgs(...extra) {
  const args = ["compose", "-f", getComposePath()];
  const envPath = getEnvPath();
  if (fs.existsSync(envPath)) args.push("--env-file", envPath);
  return [...args, ...extra];
}

function sendLog(line) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("docker-log", line);
  }
}

function pipeLog(proc) {
  const emit = (data) =>
    data.toString().split("\n").filter((l) => l.trim()).forEach(sendLog);
  proc.stdout.on("data", emit);
  proc.stderr.on("data", emit);
}

// ─── ENV FILE GENERATION ──────────────────────────────────────────────────────
function writeEnvFile(config) {
  ensureDbInit();
  const llm      = config.llm      || {};
  const cloud    = config.cloud    || {};
  const settings = config.settings || {};
  const home     = app.getPath("home");

  const dataDir = settings.data_dir || path.join(home, "omnibioai", "data");
  const workDir = settings.work_dir || path.join(home, "omnibioai", "work");

  const lines = [
    `HOST_IP=0.0.0.0`,
    `ANTHROPIC_API_KEY=${llm.claude_api_key         || ""}`,
    `OPENAI_API_KEY=${llm.openai_api_key            || ""}`,
    `OLLAMA_URL=${llm.ollama_host                   || "http://ollama:11434"}`,
    `AWS_ACCESS_KEY_ID=${cloud.aws_access_key       || ""}`,
    `AWS_SECRET_ACCESS_KEY=${cloud.aws_secret_key   || ""}`,
    `AWS_DEFAULT_REGION=${cloud.aws_region          || "us-east-1"}`,
    `AZURE_SUBSCRIPTION_ID=${cloud.azure_subscription_id || ""}`,
    `GCP_PROJECT_ID=${cloud.gcp_project_id          || ""}`,
    `DATA_DIR=${dataDir}`,
    `WORK_DIR=${workDir}`,
    `WORKSPACE_HOST=${workDir}`,
    `DB_INIT_DIR=${getDbInitPath()}`,
    `VIDEO_DIR=${workDir}/videos`,
    `MYSQL_ROOT_PASSWORD=omnibioai`,
    `MYSQL_DEFAULT_DB=omnibioai`,
    `LIMSX_DJANGO_SECRET_KEY=omnibioai-studio-secret`,
  ];

  fs.mkdirSync(path.dirname(getEnvPath()), { recursive: true });
  fs.writeFileSync(getEnvPath(), lines.join("\n") + "\n", "utf-8");
}

// ─── WINDOW ───────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      webviewTag: true,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    const devUrl = "http://localhost:5174";
    mainWindow.loadURL(devUrl).catch(() => {
      setTimeout(() => mainWindow.loadURL(devUrl), 2000);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.on("web-contents-created", (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
});

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    delete headers['content-security-policy'];
    delete headers['Content-Security-Policy'];
    headers['Content-Security-Policy'] = [
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:"
    ];
    callback({ responseHeaders: headers });
  });

  createWindow();
  // Attempt to tail logs after window loads (only if docker is already running)
  mainWindow.webContents.once("did-finish-load", () => {
    const cfg = readConfig();
    const hostIp = cfg?.server?.host_ip || "localhost";
    const server = BETA_MODE ? "app.omnibioai.org" : hostIp;
    mainWindow.webContents.executeJavaScript(
      `window.__OMNIBIOAI_SERVER__ = ${JSON.stringify(server)}`
    );
    if (!BETA_MODE) setTimeout(startLogStream, 6000);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ─── EXTERNAL LINKS ───────────────────────────────────────────────────────────
ipcMain.handle("open-external", async (_, url) => shell.openExternal(url));

// ─── CONFIG ───────────────────────────────────────────────────────────────────
ipcMain.handle("save-config", async (_, config) => {
  const result = writeConfig(config);
  try {
    writeEnvFile(config);
  } catch (e) {
    console.error("writeEnvFile failed:", e);
  }
  return result;
});

ipcMain.handle("load-config", async () => readConfig());

ipcMain.handle("reset-config", async () => {
  resetConfig();
  const envPath = getEnvPath();
  if (fs.existsSync(envPath)) fs.unlinkSync(envPath);
});

// ─── DOCKER LIFECYCLE ─────────────────────────────────────────────────────────
const BETA_RESPONSE = { betaMode: true, message: "Not available in Beta — cloud mode active" };

ipcMain.handle("start-docker", async () => {
  if (BETA_MODE) return BETA_RESPONSE;
  ensureDbInit();
  return new Promise((resolve, reject) => {
    sendLog("Pulling latest images — this may take several minutes...");

    const pull = spawn("docker", composeArgs("pull"), { env: process.env });
    pipeLog(pull);

    pull.on("error", (err) => {
      sendLog(`Docker not found: ${err.message}`);
      reject(err);
    });

    pull.on("close", (pullCode) => {
      if (pullCode !== 0) {
        sendLog(`Image pull finished with warnings (${pullCode}) — starting with cached images`);
      }

      sendLog("Starting services with docker compose up -d...");
      const up = spawn("docker", composeArgs("up", "-d"), { env: process.env });
      pipeLog(up);

      up.on("close", (code) => {
        if (code !== 0) {
          return reject(new Error(`docker compose up -d failed (exit ${code})`));
        }
        sendLog("All containers started — health checks will update shortly");
        resolve("started");
      });

      up.on("error", reject);
    });
  });
});

ipcMain.handle("stop-docker", async () => {
  if (BETA_MODE) return BETA_RESPONSE;
  return new Promise((resolve, reject) => {
    execFile("docker", composeArgs("down"), (err, _, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve("stopped");
    });
  });
});

ipcMain.handle("restart-docker", async () => {
  if (BETA_MODE) return BETA_RESPONSE;
  return new Promise((resolve, reject) => {
    execFile("docker", composeArgs("restart"), (err, _, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve("restarted");
    });
  });
});

// ─── RESTART INDIVIDUAL SERVICE ───────────────────────────────────────────────
const ALLOWED_SERVICES = [
  "mysql", "redis", "workbench", "tes", "toolserver",
  "model-registry", "lims", "ollama", "opa", "control-center", "dev-hub",
];

ipcMain.handle("restart-service", async (_, name) => {
  if (BETA_MODE) return BETA_RESPONSE;
  if (!ALLOWED_SERVICES.includes(name)) throw new Error(`Unknown service: ${name}`);
  return new Promise((resolve, reject) => {
    execFile("docker", composeArgs("restart", name), (err, _, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve(`${name} restarted`);
    });
  });
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
ipcMain.handle("check-health", async () => {
  return new Promise((resolve) => {
    execFile("docker", ["ps", "--format", "{{.Names}}"], (err, stdout) => {
      if (err) return resolve({
        mysql: false, redis: false, workbench: false, tes: false,
        toolserver: false, ollama: false, opa: false,
        lims: false, "model-registry": false, "control-center": false,
      });
      const running = stdout.split("\n").map((s) => s.trim());
      const has = (name) => running.some((s) => s.includes(name) && !s.includes("buildx"));
      resolve({
        mysql:            has("mysql"),
        redis:            has("redis"),
        workbench:        has("workbench"),
        tes:              has("-tes"),
        toolserver:       has("toolserver"),
        ollama:           has("ollama"),
        opa:              has("opa"),
        lims:             has("lims"),
        "model-registry": has("model-registry"),
        "control-center": has("control-center"),
      });
    });
  });
});

// ─── LOG STREAMING ────────────────────────────────────────────────────────────
function startLogStream() {
  execFile(
    "docker",
    ["ps", "--format", "{{.Names}}", "--filter", "status=running"],
    (err, stdout) => {
      if (err || !stdout.trim()) return;
      const running = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
      const candidates = ["workbench", "tes", "toolserver", "celery-worker"];
      const targets = candidates.filter((name) => running.some((r) => r.includes(name)));
      if (!targets.length) return;

      const proc = spawn("docker", ["logs", "-f", "--tail=20", ...targets]);
      proc.stdout.on("data", (d) => {
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send("log-stream", d.toString());
      });
      proc.stderr.on("data", (d) => {
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send("log-stream", d.toString());
      });
    }
  );
}

// ─── OPEN WORKBENCH ───────────────────────────────────────────────────────────
ipcMain.handle("open-workbench", async () => {
  shell.openExternal("http://localhost:8000");
  return true;
});
