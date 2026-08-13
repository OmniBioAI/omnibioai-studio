// Pure, dependency-free secret-generation logic for the Studio release .env
// file. Deliberately has zero `require("electron")` (or any other Electron
// API) so it can be unit-tested with a plain Node runtime -- see
// tests/test_secret_generation.js. Extracted out of electron/main.js, same
// behavior, no functional change to the app.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Every credential the Electron app is responsible for provisioning before
// docker-compose.release.yml's own ${VAR:?...} required-var guards run --
// keep this list in sync with that file's required vars (see
// SECURITY-COMPOSE-HARDENING.md). Each value is the historical known-weak
// literal the release compose file used to silently fall back to; any
// existing .env value that still matches one of these gets rotated to a
// fresh random secret, same as a genuinely-unset value.
//
// LIMSX_DJANGO_SECRET_KEY, JUPYTER_TOKEN, RSTUDIO_PASSWORD, and
// VSCODE_PASSWORD were missing from this map for every release prior to
// this fix -- every installation of Studio was silently using the same
// hardcoded literal for each across every customer (LIMS's self-issued
// session-cookie signing key, and the Jupyter/RStudio/VSCode terminal
// credentials), since nothing ever rotated them. Added here to close that
// gap -- see docker-compose.release.yml's matching ${VAR:?...} guards.
const SECRET_DEFAULTS = {
  AUTH_SECRET_KEY: "change-me",
  MYSQL_ROOT_PASSWORD: "omnibioai",
  GF_ADMIN_PASSWORD: "omnibioai",
  LICENSE_SECRET: "omnibioai-secret-change-in-production",
  LIMSX_DJANGO_SECRET_KEY: "omnibioai-studio-secret",
  JUPYTER_TOKEN: "omnibioai",
  RSTUDIO_PASSWORD: "omnibioai",
  VSCODE_PASSWORD: "omnibioai",
  ADMIN_KEY: "admin-secret",
};

function parseEnvFile(envPath) {
  const env = {};
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf8")
      .split("\n")
      .forEach((line) => {
        const [k, ...v] = line.split("=");
        if (k) env[k.trim()] = v.join("=").trim();
      });
  }
  return env;
}

// Rotates any unset/still-default secret in envPath to a fresh random
// 32-byte hex value, in place. Returns true if the file was written
// (something changed), false if every secret already held a real,
// previously-generated value.
function generateSecrets(envPath) {
  const env = parseEnvFile(envPath);
  let changed = false;

  for (const [key, defaultVal] of Object.entries(SECRET_DEFAULTS)) {
    if (!env[key] || env[key] === defaultVal) {
      env[key] = crypto.randomBytes(32).toString("hex");
      changed = true;
    }
  }

  if (changed) {
    const content = Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, content + "\n");
  }

  return changed;
}

module.exports = { SECRET_DEFAULTS, parseEnvFile, generateSecrets };
