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
// LIMSX_FIELD_ENCRYPTION_KEY was likewise missing for every release prior
// to this fix, but for a different reason and with a different failure
// mode. It is wired into all three compose files as a bare
// ${LIMSX_FIELD_ENCRYPTION_KEY} (no `:?` guard), so the audit that built
// the list above -- which enumerated the `${VAR:?...}` required vars --
// never saw it. An unset value therefore interpolates to the empty string
// and compose starts happily, but omnibioai-lims' settings.py raises
// `FIELD_ENCRYPTION_KEY must be set in non-debug environments` at import
// and the LIMS container crash-loops on a fresh install. It has no weak
// literal to rotate away from (it never had a default at all), so its
// entry below is `null`.
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
  LIMSX_FIELD_ENCRYPTION_KEY: null,
};

// Secrets whose *format* is constrained by their consumer, rather than
// being an opaque random token. Anything not listed here gets the default
// 32-byte hex treatment.
//
// LIMSX_FIELD_ENCRYPTION_KEY feeds omnibioai-lims' EncryptedCharField
// (core/fields.py), which constructs a `cryptography` Fernet from it.
// Fernet requires exactly 32 url-safe-base64-encoded bytes -- a 44-char
// string ending in `=`. The default hex encoding used for every other
// secret here produces 64 chars and is *rejected* by Fernet, and does so
// in a way that would slip past LIMS's own startup guard (which only
// checks the value is non-empty): Django would boot fine and then throw
// `ValueError: Fernet key must be 32 url-safe base64-encoded bytes` on the
// first encrypted-field write. Generating the right shape here is what
// makes the value actually usable, not merely present.
const SECRET_GENERATORS = {
  LIMSX_FIELD_ENCRYPTION_KEY: () =>
    crypto.randomBytes(32).toString("base64url").padEnd(44, "="),
};

function generateSecretValue(key) {
  const generator = SECRET_GENERATORS[key];
  return generator ? generator() : crypto.randomBytes(32).toString("hex");
}

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
    // `defaultVal === null` means the secret never had a weak literal to
    // rotate away from -- only a genuinely unset value needs generating.
    if (!env[key] || (defaultVal !== null && env[key] === defaultVal)) {
      env[key] = generateSecretValue(key);
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

module.exports = {
  SECRET_DEFAULTS,
  SECRET_GENERATORS,
  generateSecretValue,
  parseEnvFile,
  generateSecrets,
};
