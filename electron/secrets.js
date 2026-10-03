// Pure, dependency-free secret-generation logic for the Studio release .env
// file. Deliberately has zero `require("electron")` (or any other Electron
// API) so it can be unit-tested with a plain Node runtime -- see
// tests/test_secret_generation.js. Extracted out of electron/main.js, same
// behavior, no functional change to the app.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Non-secret mapping consumed by the Redis bootstrap. Values are copied from
// the protected .env into per-user 0600 files so the Redis bootstrap sidecar
// does not need the full .env or secret-bearing process arguments.
const REDIS_ACL_CREDENTIALS = Object.freeze({
  redis_api_gateway_iam: "REDIS_API_GATEWAY_IAM_PASSWORD",
  redis_api_gateway_v1: "REDIS_API_GATEWAY_V1_PASSWORD",
  redis_audit_health_reader: "REDIS_AUDIT_HEALTH_READER_PASSWORD",
  redis_audit_producer: "REDIS_AUDIT_PRODUCER_PASSWORD",
  redis_audit_worker: "REDIS_AUDIT_WORKER_PASSWORD",
  redis_auth: "REDIS_AUTH_PASSWORD",
  redis_billing_quota_writer: "REDIS_BILLING_QUOTA_WRITER_PASSWORD",
  redis_cache_manager: "REDIS_CACHE_MANAGER_PASSWORD",
  redis_celery_lims: "REDIS_CELERY_LIMS_PASSWORD",
  redis_celery_workbench: "REDIS_CELERY_WORKBENCH_PASSWORD",
  redis_control_center: "REDIS_CONTROL_CENTER_PASSWORD",
  redis_control_center_status: "REDIS_CONTROL_CENTER_STATUS_PASSWORD",
  redis_healthcheck: "REDIS_HEALTHCHECK_PASSWORD",
  redis_iam_shared: "REDIS_IAM_SHARED_PASSWORD",
  redis_interaction_producer: "REDIS_INTERACTION_PRODUCER_PASSWORD",
  redis_interaction_worker: "REDIS_INTERACTION_WORKER_PASSWORD",
  redis_lims_cache: "REDIS_LIMS_CACHE_PASSWORD",
  redis_policy: "REDIS_POLICY_PASSWORD",
  redis_tes_iam: "REDIS_TES_IAM_PASSWORD",
  redis_usage_producer: "REDIS_USAGE_PRODUCER_PASSWORD",
  redis_usage_worker: "REDIS_USAGE_WORKER_PASSWORD",
  redis_workbench_channels: "REDIS_WORKBENCH_CHANNELS_PASSWORD",
  redis_workflow_iam: "REDIS_WORKFLOW_IAM_PASSWORD",
});

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
  INTERACTION_DB_PASSWORD: "change-me-in-production",
  GF_ADMIN_PASSWORD: "omnibioai",
  LICENSE_SECRET: "omnibioai-secret-change-in-production",
  LIMSX_DJANGO_SECRET_KEY: "omnibioai-studio-secret",
  JUPYTER_TOKEN: "omnibioai",
  RSTUDIO_PASSWORD: "omnibioai",
  VSCODE_PASSWORD: "omnibioai",
  ADMIN_KEY: "admin-secret",
  LIMSX_FIELD_ENCRYPTION_KEY: null,
  // Named Redis credentials consumed by the canonical ACL bootstrap.
  // Existing values are preserved; absent values are generated once. The
  // redis_admin and redis_backup break-glass inputs remain protected files.
  REDIS_API_GATEWAY_IAM_PASSWORD: null,
  REDIS_API_GATEWAY_V1_PASSWORD: null,
  REDIS_AUDIT_HEALTH_READER_PASSWORD: null,
  REDIS_AUDIT_PRODUCER_PASSWORD: null,
  REDIS_AUDIT_WORKER_PASSWORD: null,
  REDIS_AUTH_PASSWORD: null,
  REDIS_BILLING_QUOTA_WRITER_PASSWORD: null,
  REDIS_CACHE_MANAGER_PASSWORD: null,
  REDIS_CELERY_LIMS_PASSWORD: null,
  REDIS_CELERY_WORKBENCH_PASSWORD: null,
  REDIS_CONTROL_CENTER_PASSWORD: null,
  REDIS_CONTROL_CENTER_STATUS_PASSWORD: null,
  REDIS_HEALTHCHECK_PASSWORD: null,
  REDIS_IAM_SHARED_PASSWORD: null,
  REDIS_INTERACTION_PRODUCER_PASSWORD: null,
  REDIS_INTERACTION_WORKER_PASSWORD: null,
  REDIS_LIMS_CACHE_PASSWORD: null,
  REDIS_POLICY_PASSWORD: null,
  REDIS_TES_IAM_PASSWORD: null,
  REDIS_USAGE_PRODUCER_PASSWORD: null,
  REDIS_USAGE_WORKER_PASSWORD: null,
  REDIS_WORKBENCH_CHANNELS_PASSWORD: null,
  REDIS_WORKFLOW_IAM_PASSWORD: null,
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
    fs.writeFileSync(envPath, content + "\n", { mode: 0o600 });
  }

  // The file contains credentials even when no value needed generation.
  // Tighten an existing permissive mode as well as newly-created files.
  if (fs.existsSync(envPath)) fs.chmodSync(envPath, 0o600);

  return changed;
}

// Materialize the generated/preserved Redis application credentials into a
// dedicated owner-only directory. Existing files are never overwritten: a
// mismatch means the operator must reconcile the credential source explicitly.
function writeRedisAclCredentialFiles(envPath, credentialDir) {
  const env = parseEnvFile(envPath);
  const entries = Object.entries(REDIS_ACL_CREDENTIALS).map(([user, key]) => {
    const value = env[key];
    if (!value || Buffer.byteLength(value, "utf8") < 16 || /[\0\r\n]/.test(value)) {
      throw new Error(`required Redis credential input is missing or malformed for ${user}`);
    }
    return [user, value];
  });

  fs.mkdirSync(credentialDir, { recursive: true, mode: 0o700 });
  const dirStat = fs.lstatSync(credentialDir);
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) {
    throw new Error("Redis ACL credential directory is not a real directory");
  }
  fs.chmodSync(credentialDir, 0o700);

  const lstatIfPresent = (filePath) => {
    try { return fs.lstatSync(filePath); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  };

  // Preflight every existing file before creating or tightening any files.
  for (const [user, value] of entries) {
    const filePath = path.join(credentialDir, `${user}.pass`);
    const fileStat = lstatIfPresent(filePath);
    if (!fileStat) continue;
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      throw new Error(`Redis ACL credential file is unsafe for ${user}`);
    }
    if (fs.readFileSync(filePath, "utf8") !== value) {
      throw new Error(`Redis ACL credential source mismatch for ${user}; explicit reconciliation required`);
    }
  }

  for (const [user, value] of entries) {
    const filePath = path.join(credentialDir, `${user}.pass`);
    if (!lstatIfPresent(filePath)) {
      let fd;
      let created = false;
      try {
        fd = fs.openSync(filePath, "wx", 0o600);
        created = true;
        fs.writeFileSync(fd, value, "utf8");
        fs.fsyncSync(fd);
      } catch (error) {
        if (created) { try { fs.unlinkSync(filePath); } catch {} }
        throw new Error(`could not safely publish Redis ACL credential for ${user}`);
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
    }
    fs.chmodSync(filePath, 0o600);
  }
  return entries.length;
}

module.exports = {
  SECRET_DEFAULTS,
  SECRET_GENERATORS,
  REDIS_ACL_CREDENTIALS,
  generateSecretValue,
  parseEnvFile,
  generateSecrets,
  writeRedisAclCredentialFiles,
};
