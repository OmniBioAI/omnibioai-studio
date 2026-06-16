const { app, BrowserWindow, ipcMain, shell, session, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { writeConfig, readConfig, resetConfig } = require("../backend/config");
const { spawn, execFile } = require("child_process");
const os = require("os");
const crypto = require("crypto");
const { initAutoUpdater } = require("./updater");

// In packaged app (DMG/AppImage/EXE) → always production mode
// In dev (npm run dev) → use env var
const DEV_MODE = app.isPackaged
  ? false
  : (process.env.OMNIBIOAI_DEV_MODE === 'true');

// ─── LICENSE ──────────────────────────────────────────────────────────────────
const LICENSE_SERVER = DEV_MODE
  ? 'http://localhost:8099'
  : 'https://license.omnibioai.org';
const LICENSE_FILE = path.join(app.getPath('userData'), 'license.json');

function getMachineId() {
  const raw = os.hostname() + os.platform() + os.arch();
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

async function validateLicense(key) {
  const machineId = getMachineId();
  try {
    const response = await fetch(`${LICENSE_SERVER}/api/license/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, machine_id: machineId })
    });
    if (!response.ok) {
      const err = await response.json();
      return { valid: false, reason: err.detail || 'Invalid license' };
    }
    return await response.json();
  } catch (e) {
    console.error('License server error:', LICENSE_SERVER, e.message);
    if (fs.existsSync(LICENSE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
      const expiry = new Date(cached.expiry);
      const cachedAt = new Date(cached.cached_at);
      const gracePeriod = new Date(cachedAt);
      gracePeriod.setDate(gracePeriod.getDate() + 7);
      if (new Date() < expiry && new Date() < gracePeriod) {
        return { ...cached, valid: true, offline: true };
      }
    }
    return {
      valid: false,
      reason: `Cannot reach license server at ${LICENSE_SERVER}. Check your internet connection.`
    };
  }
}

function saveLicense(data) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify({
    ...data,
    cached_at: new Date().toISOString()
  }));
}

function loadCachedLicense() {
  if (fs.existsSync(LICENSE_FILE)) {
    return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
  }
  return null;
}

let mainWindow;

// ─── PATH HELPERS ─────────────────────────────────────────────────────────────
function getComposePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "docker-compose.release.yml");
  }
  return path.join(__dirname, "..", "docker-compose.yml");
}

function getEnvPath() {
  return path.join(app.getAppPath(), '.env');
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

// ─── SECRET GENERATION ────────────────────────────────────────────────────────
function generateSecrets(envPath) {
  const defaults = {
    AUTH_SECRET_KEY:     'change-me',
    MYSQL_ROOT_PASSWORD: 'omnibioai',
    GF_ADMIN_PASSWORD:   'omnibioai',
    LICENSE_SECRET:      'omnibioai-secret-change-in-production',
    ADMIN_KEY:           'admin-secret',
  };

  let env = {};
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k) env[k.trim()] = v.join('=').trim();
    });
  }

  let changed = false;
  for (const [key, defaultVal] of Object.entries(defaults)) {
    if (!env[key] || env[key] === defaultVal) {
      env[key] = crypto.randomBytes(32).toString('hex');
      changed = true;
    }
  }

  if (changed) {
    const content = Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, content + '\n');
    return true;
  }
  return false;
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

  // Preserve any generated secrets already written by generateSecrets()
  const envPath = getEnvPath();
  const existing = {};
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k) existing[k.trim()] = v.join('=').trim();
    });
  }

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
    `WORKSPACE_HOST=${path.dirname(workDir)}`,
    `MACHINE_DIR=${path.dirname(path.dirname(workDir))}`,
    `DB_INIT_DIR=${getDbInitPath()}`,
    `VIDEO_DIR=${workDir}/videos`,
    `MYSQL_ROOT_PASSWORD=${existing.MYSQL_ROOT_PASSWORD || 'omnibioai'}`,
    `MYSQL_DEFAULT_DB=omnibioai`,
    `LIMSX_DJANGO_SECRET_KEY=${existing.LIMSX_DJANGO_SECRET_KEY || 'omnibioai-studio-secret'}`,
    `AUTH_SECRET_KEY=${existing.AUTH_SECRET_KEY     || ''}`,
    `GF_ADMIN_PASSWORD=${existing.GF_ADMIN_PASSWORD || ''}`,
    `GF_STUDIO_TOKEN=${existing.GF_STUDIO_TOKEN    || ''}`,
    `LICENSE_SECRET=${existing.LICENSE_SECRET       || ''}`,
    `ADMIN_KEY=${existing.ADMIN_KEY                 || ''}`,
  ];

  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");
}

// ─── ENV FILE READER ──────────────────────────────────────────────────────────
function readEnvFile() {
  const envPath = getEnvPath();
  const env = {};
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k) env[k.trim()] = v.join('=').trim();
    });
  }
  return env;
}

// ─── GRAFANA TOKEN PROVISIONING ───────────────────────────────────────────────
async function ensureGrafanaToken(adminPassword) {
  const env = readEnvFile();
  if (env.GF_STUDIO_TOKEN) return env.GF_STUDIO_TOKEN;

  const base64 = Buffer.from(`admin:${adminPassword}`).toString('base64');
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${base64}`,
  };
  const base = 'http://localhost:3000';

  // Create service account; if name already exists, search for the existing one
  let saId;
  const saRes = await fetch(`${base}/api/serviceaccounts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'omnibioai-studio', role: 'Viewer' }),
  });
  const saData = await saRes.json();
  if (saData.id) {
    saId = saData.id;
  } else {
    const search = await fetch(
      `${base}/api/serviceaccounts/search?query=omnibioai-studio`,
      { headers }
    ).then(r => r.json());
    saId = search.serviceAccounts?.[0]?.id;
    if (!saId) throw new Error(`Cannot create Grafana service account: ${JSON.stringify(saData)}`);
  }

  // Create a new token
  const tokenRes = await fetch(`${base}/api/serviceaccounts/${saId}/tokens`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: `studio-token-${Date.now()}` }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.key) throw new Error(`Token creation failed: ${JSON.stringify(tokenData)}`);

  // Persist token to .env
  const envPath = getEnvPath();
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const updated = /^GF_STUDIO_TOKEN=/m.test(envContent)
    ? envContent.replace(/^GF_STUDIO_TOKEN=.*/m, `GF_STUDIO_TOKEN=${tokenData.key}`)
    : envContent.trimEnd() + `\nGF_STUDIO_TOKEN=${tokenData.key}\n`;
  fs.writeFileSync(envPath, updated, 'utf-8');

  return tokenData.key;
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
  // Block window.open() — open external URLs in the system browser, keep app URLs in Electron
  contents.setWindowOpenHandler(({ url }) => {
    const isAppUrl = url.startsWith("http://localhost:5174") ||
                     url.startsWith("http://127.0.0.1:5174");
    if (!isAppUrl && isExternalUrl(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // For the main window: allow any localhost navigation (service pages navigate freely),
  // but redirect external URLs to the system browser instead of leaving Electron.
  contents.on("will-navigate", (event, url) => {
    if (contents !== mainWindow?.webContents) return;
    try {
      const { hostname } = new URL(url);
      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });
});

app.whenReady().then(() => {
  // Generate random secrets on first launch or when defaults are detected
  const repoEnvPath = getEnvPath();
  const rotated = generateSecrets(repoEnvPath);
  if (rotated) {
    dialog.showMessageBoxSync({
      type: 'info',
      title: 'Security Setup',
      message: 'OmniBioAI has generated secure random passwords for this installation.\n\nYour credentials are stored in:\n' + repoEnvPath,
      buttons: ['OK']
    });
  }

  // Ensure Docker Compose always starts with the repo .env
  const upProc = spawn("docker", ["compose", "--env-file", repoEnvPath, "-f", getComposePath(), "up", "-d"], {
    env: process.env,
    detached: true,
    stdio: 'ignore',
  });
  upProc.unref();

  session.defaultSession.webRequest.onHeadersReceived(
    (details, callback) => {
      if (DEV_MODE) {
        // Remove CSP entirely in dev mode
        delete details.responseHeaders['content-security-policy'];
        delete details.responseHeaders['Content-Security-Policy'];
        callback({ responseHeaders: details.responseHeaders });
      } else {
        // Production CSP with Sentry allowed
        delete details.responseHeaders['content-security-policy'];
        delete details.responseHeaders['Content-Security-Policy'];
        details.responseHeaders['Content-Security-Policy'] = [
          [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: https:",
            "connect-src 'self' ws: wss: http://localhost:* https://*.sentry.io https://o4511460178132992.ingest.us.sentry.io",
            "media-src 'self'"
          ].join("; ")
        ];
        callback({ responseHeaders: details.responseHeaders });
      }
    }
  );

  createWindow();
  // Attempt to tail logs after window loads (only if docker is already running)
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      window.addEventListener('message', (e) => {
        console.log('[Studio] received message:', JSON.stringify(e.data));
        if (e.data && e.data.type === 'open-external' && e.data.url) {
          console.log('[Studio] opening external URL:', e.data.url);
          window.electronAPI.openExternal(e.data.url);
        }
      }, true);
    `);
  });

  mainWindow.webContents.once("did-finish-load", () => {
    const cfg = readConfig();
    const hostIp = cfg?.server?.host_ip || "localhost";
    const server = DEV_MODE ? "app.omnibioai.org" : (hostIp || "localhost");
    mainWindow.webContents.executeJavaScript(
      `window.__OMNIBIOAI_SERVER__ = ${JSON.stringify(server)}`
    );
    if (!DEV_MODE) setTimeout(startLogStream, 6000);
    initAutoUpdater(mainWindow);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ─── EXTERNAL LINKS ───────────────────────────────────────────────────────────
function isExternalUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ||
           (parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1');
  } catch {
    return false; // relative paths, malformed strings — never open externally
  }
}

ipcMain.handle("open-external", async (_, url) => {
  if (isExternalUrl(url)) shell.openExternal(url);
});

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
const DEV_RESPONSE = { devMode: true, message: "Not available in Dev mode — use release build" };

ipcMain.handle("start-docker", async () => {
  if (DEV_MODE) return DEV_RESPONSE;
  ensureDbInit();
  return new Promise((resolve, reject) => {
    sendLog("Pulling latest images — this may take several minutes...");

    // Login to ghcr.io so private images can be pulled
    const ghcrToken = process.env.GHCR_TOKEN || loadCachedLicense()?.ghcr_token || '';
    if (ghcrToken) {
      try {
        sendLog('Logging into ghcr.io...');
        const { spawnSync } = require('child_process');
        const login = spawnSync(
          'docker',
          ['login', 'ghcr.io', '-u', 'man4ish', '--password-stdin'],
          { input: ghcrToken, encoding: 'utf8', stdio: 'pipe' }
        );
        if (login.status === 0) {
          sendLog('ghcr.io login successful');
        } else {
          sendLog('ghcr.io login failed: ' + (login.stderr || '').trim());
        }
      } catch (e) {
        sendLog('ghcr.io login error: ' + e.message);
      }
    } else {
      sendLog('No ghcr.io token found — private images may fail to pull');
    }

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

        // Provision Grafana service account token in background (fire-and-forget)
        const gfPassword = readEnvFile().GF_ADMIN_PASSWORD || 'omnibioai';
        (async () => {
          for (let i = 0; i < 20; i++) {
            try {
              const r = await fetch('http://localhost:3000/api/health');
              if (r.ok) { sendLog('Grafana healthy — provisioning service account…'); break; }
            } catch {}
            await new Promise(res2 => setTimeout(res2, 3000));
          }
          try {
            await ensureGrafanaToken(gfPassword);
            sendLog('Grafana service account token ready');
          } catch (e) {
            sendLog(`Grafana token provisioning failed: ${e.message}`);
          }
        })().catch(() => {});
      });

      up.on("error", reject);
    });
  });
});

ipcMain.handle("stop-docker", async () => {
  if (DEV_MODE) return DEV_RESPONSE;
  return new Promise((resolve, reject) => {
    execFile("docker", composeArgs("down"), (err, _, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve("stopped");
    });
  });
});

ipcMain.handle("restart-docker", async () => {
  if (DEV_MODE) return DEV_RESPONSE;
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
  if (DEV_MODE) return DEV_RESPONSE;
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
        mysql:              has("mysql"),
        redis:              has("redis"),
        workbench:          has("workbench"),
        tes:                has("-tes"),
        toolserver:         has("toolserver"),
        ollama:             has("ollama"),
        opa:                has("opa"),
        lims:               has("lims"),
        "model-registry":   has("model-registry"),
        "control-center":   has("control-center"),
        rag:                has("-rag"),
        "dev-hub":          has("dev-hub"),
        "api-gateway":      has("api-gateway"),
        "auth-service":     has("auth"),
        "policy-engine":    has("policy-engine"),
        "hpc-policy-engine":has("hpc-policy"),
        "security-audit":   has("security-audit"),
        prometheus:         has("prometheus"),
        grafana:            has("grafana"),
        "workflow-bundles": has("workflow-bundles"),
        "tool-images":      has("tool-images"),
        videos:             has("videos"),
        launcher:           has("launcher"),
        "celery-worker":    has("celery"),
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

// ─── NAVIGATE MAIN WINDOW IN-PLACE ────────────────────────────────────────────
ipcMain.handle("load-url", async (_, url) => {
  mainWindow.loadURL(url);
});

ipcMain.handle("go-home", async () => {
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    mainWindow.loadURL("http://localhost:5174");
  }
});

// ─── GRAFANA AUTH ─────────────────────────────────────────────────────────────
ipcMain.handle('grafana-login', async () => {
  const env = readEnvFile();
  let studioToken = env.GF_STUDIO_TOKEN;
  if (!studioToken) {
    const adminPassword = env.GF_ADMIN_PASSWORD || 'omnibioai';
    studioToken = await ensureGrafanaToken(adminPassword);
  }

  const res = await fetch('http://localhost:3000/api/org', {
    headers: { 'Authorization': `Bearer ${studioToken}` },
  });
  if (!res.ok) throw new Error('Grafana token invalid or Grafana not running');

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['http://localhost:3000/*'] },
    (details, callback) => {
      details.requestHeaders['Authorization'] = `Bearer ${studioToken}`;
      callback({ requestHeaders: details.requestHeaders });
    }
  );
  return { message: 'Logged in' };
});

// ─── LICENSE ──────────────────────────────────────────────────────────────────
ipcMain.handle('license-validate', async (event, key) => {
  const result = await validateLicense(key);
  if (result.valid) {
    saveLicense(result);
    if (result.ghcr_token) {
      process.env.GHCR_TOKEN = result.ghcr_token;
    }
  }
  return result;
});

ipcMain.handle('license-get-cached', async () => {
  return loadCachedLicense();
});

ipcMain.handle('license-clear', async () => {
  if (fs.existsSync(LICENSE_FILE)) {
    fs.unlinkSync(LICENSE_FILE);
  }
  return { cleared: true };
});

// ─── CREDENTIALS ──────────────────────────────────────────────────────────────
ipcMain.handle('get-credentials', async () => {
  const envPath = getEnvPath();
  if (!fs.existsSync(envPath)) return null;
  const env = readEnvFile();
  return {
    grafanaPassword: env.GF_ADMIN_PASSWORD  || '',
    grafanaToken:    env.GF_STUDIO_TOKEN    || '',
    mysqlPassword:   env.MYSQL_ROOT_PASSWORD || '',
    authSecretKey:   env.AUTH_SECRET_KEY     || '',
    envPath,
  };
});
