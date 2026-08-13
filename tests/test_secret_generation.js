// Unit tests for electron/secrets.js -- the Electron app's provisioning of
// the credentials docker-compose.release.yml now *requires* (see its
// ${VAR:?...} guards and SECURITY-COMPOSE-HARDENING.md).
//
// Run with:  node --test tests/test_secret_generation.js
//
// Uses only Node's built-in test runner and assert -- this repo has no JS
// test framework installed, and adding one just for this would be a much
// larger change than the fix warrants.
//
// Deliberately asserts on *properties* of generated secrets (length,
// randomness, difference from the known-weak literals) and never prints a
// generated value.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  SECRET_DEFAULTS,
  parseEnvFile,
  generateSecrets,
} = require("../electron/secrets.js");

function tmpEnvPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omnibioai-secrets-"));
  return path.join(dir, ".env");
}

// Every credential docker-compose.release.yml marks required must be one
// the app actually provisions -- otherwise a fresh install fails to start.
const COMPOSE_REQUIRED = [
  "MYSQL_ROOT_PASSWORD",
  "AUTH_SECRET_KEY",
  "LICENSE_SECRET",
  "GF_ADMIN_PASSWORD",
  "LIMSX_DJANGO_SECRET_KEY",
  "JUPYTER_TOKEN",
  "RSTUDIO_PASSWORD",
  "VSCODE_PASSWORD",
];

test("provisions every credential the release compose file requires", () => {
  for (const key of COMPOSE_REQUIRED) {
    assert.ok(
      key in SECRET_DEFAULTS,
      `${key} is a required var in docker-compose.release.yml but the app ` +
        `never generates it -- a fresh install would fail to start`
    );
  }
});

test("generates secrets into an empty/missing .env", () => {
  const envPath = tmpEnvPath();
  const changed = generateSecrets(envPath);

  assert.strictEqual(changed, true, "should report that it wrote secrets");
  assert.ok(fs.existsSync(envPath), ".env should have been created");

  const env = parseEnvFile(envPath);
  for (const key of Object.keys(SECRET_DEFAULTS)) {
    assert.ok(env[key], `${key} should have been generated`);
    assert.strictEqual(
      env[key].length,
      64,
      `${key} should be 32 random bytes hex-encoded`
    );
    assert.match(env[key], /^[0-9a-f]{64}$/, `${key} should be lowercase hex`);
  }
});

test("rotates values still set to the known-weak literals", () => {
  const envPath = tmpEnvPath();
  // Simulate a .env written by an older Studio version, where every
  // credential still holds the public, committed-to-the-repo default.
  fs.writeFileSync(
    envPath,
    Object.entries(SECRET_DEFAULTS)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n"
  );

  const changed = generateSecrets(envPath);
  assert.strictEqual(changed, true, "weak defaults must be rotated");

  const env = parseEnvFile(envPath);
  for (const [key, weak] of Object.entries(SECRET_DEFAULTS)) {
    assert.notStrictEqual(
      env[key],
      weak,
      `${key} must not still hold its known-weak default`
    );
    assert.match(env[key], /^[0-9a-f]{64}$/);
  }
});

test("preserves already-generated real secrets", () => {
  const envPath = tmpEnvPath();
  const first = generateSecrets(envPath);
  assert.strictEqual(first, true);
  const afterFirst = parseEnvFile(envPath);

  const second = generateSecrets(envPath);
  assert.strictEqual(
    second,
    false,
    "a second run must not rotate already-real secrets"
  );

  const afterSecond = parseEnvFile(envPath);
  for (const key of Object.keys(SECRET_DEFAULTS)) {
    assert.strictEqual(
      afterSecond[key],
      afterFirst[key],
      `${key} must survive a subsequent launch unchanged -- rotating it ` +
        `would orphan the data encrypted/signed under the previous value`
    );
  }
});

test("preserves unrelated keys already in .env", () => {
  const envPath = tmpEnvPath();
  fs.writeFileSync(envPath, "ANTHROPIC_API_KEY=user-provided\nDATA_DIR=/data\n");

  generateSecrets(envPath);

  const env = parseEnvFile(envPath);
  assert.strictEqual(env.ANTHROPIC_API_KEY, "user-provided");
  assert.strictEqual(env.DATA_DIR, "/data");
});

test("generates distinct values per key and per install", () => {
  const envA = tmpEnvPath();
  const envB = tmpEnvPath();
  generateSecrets(envA);
  generateSecrets(envB);

  const a = parseEnvFile(envA);
  const b = parseEnvFile(envB);

  // No key reuses another key's value within one install.
  const valuesA = Object.keys(SECRET_DEFAULTS).map((k) => a[k]);
  assert.strictEqual(
    new Set(valuesA).size,
    valuesA.length,
    "each credential must get its own independent value"
  );

  // No value is shared across two separate installs -- the whole point of
  // generating rather than shipping a default.
  for (const key of Object.keys(SECRET_DEFAULTS)) {
    assert.notStrictEqual(
      a[key],
      b[key],
      `${key} must differ between installations`
    );
  }
});

test("parseEnvFile handles values containing '='", () => {
  const envPath = tmpEnvPath();
  // Base64/fernet-style values routinely contain '=' padding; splitting
  // naively on the first '=' and discarding the rest would silently corrupt
  // them.
  fs.writeFileSync(envPath, "FIELD_ENCRYPTION_KEY=abc==\n");
  assert.strictEqual(parseEnvFile(envPath).FIELD_ENCRYPTION_KEY, "abc==");
});

test("parseEnvFile returns empty object for a missing file", () => {
  assert.deepStrictEqual(parseEnvFile(tmpEnvPath()), {});
});
