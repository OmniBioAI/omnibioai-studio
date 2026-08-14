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
  SECRET_GENERATORS,
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
  // Not `:?`-guarded in compose (so a missing value interpolates to "" and
  // compose still starts), but omnibioai-lims' settings.py raises at import
  // when it is empty -- the LIMS container crash-loops instead. Just as
  // install-blocking as the guarded vars above, which is exactly why it was
  // missed: the audit that built this list enumerated the `:?` vars.
  "LIMSX_FIELD_ENCRYPTION_KEY",
];

// Secrets generated as plain 32-byte hex. Anything in SECRET_GENERATORS has
// a consumer-imposed format instead and is asserted separately below.
const HEX_SECRETS = Object.keys(SECRET_DEFAULTS).filter(
  (k) => !(k in SECRET_GENERATORS)
);

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
  }
  for (const key of HEX_SECRETS) {
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
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n"
  );

  const changed = generateSecrets(envPath);
  assert.strictEqual(changed, true, "weak defaults must be rotated");

  const env = parseEnvFile(envPath);
  for (const [key, weak] of Object.entries(SECRET_DEFAULTS)) {
    if (weak === null) continue;
    assert.notStrictEqual(
      env[key],
      weak,
      `${key} must not still hold its known-weak default`
    );
  }
  for (const key of HEX_SECRETS) {
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

// ── LIMS field-encryption key (Fernet format) ────────────────────────────
//
// Generating this one as plain hex like every other secret would satisfy
// LIMS's own startup guard (which only checks non-emptiness) and then fail
// at the first encrypted-field write with "Fernet key must be 32 url-safe
// base64-encoded bytes". These assert the shape `cryptography`'s Fernet
// actually accepts, without ever printing a generated key.

test("generates LIMSX_FIELD_ENCRYPTION_KEY in valid Fernet format", () => {
  const envPath = tmpEnvPath();
  generateSecrets(envPath);
  const key = parseEnvFile(envPath).LIMSX_FIELD_ENCRYPTION_KEY;

  assert.ok(key, "LIMSX_FIELD_ENCRYPTION_KEY must be generated");
  assert.strictEqual(
    key.length,
    44,
    "a Fernet key is exactly 44 characters (32 bytes url-safe base64 + padding)"
  );
  assert.match(
    key,
    /^[A-Za-z0-9_-]{43}=$/,
    "must be url-safe base64 (-_ alphabet, no +/) with '=' padding -- " +
      "hex or standard base64 would be rejected by Fernet"
  );
  // Decodes back to exactly 32 bytes, which is the actual Fernet contract.
  assert.strictEqual(
    Buffer.from(key, "base64").length,
    32,
    "must decode to exactly 32 bytes"
  );
});

test("LIMSX_FIELD_ENCRYPTION_KEY is not hex-formatted", () => {
  // Direct regression guard on the specific wrong fix: adding the key to
  // SECRET_DEFAULTS without a format-aware generator.
  const envPath = tmpEnvPath();
  generateSecrets(envPath);
  const key = parseEnvFile(envPath).LIMSX_FIELD_ENCRYPTION_KEY;

  assert.doesNotMatch(
    key,
    /^[0-9a-f]{64}$/,
    "a 64-char hex key passes LIMS's non-empty startup guard but throws " +
      "ValueError on the first encrypted-field write -- it must be Fernet-shaped"
  );
});

test("LIMSX_FIELD_ENCRYPTION_KEY survives relaunch and differs per install", () => {
  const envA = tmpEnvPath();
  const envB = tmpEnvPath();
  generateSecrets(envA);
  const firstA = parseEnvFile(envA).LIMSX_FIELD_ENCRYPTION_KEY;

  // Rotating this value on relaunch would orphan every already-encrypted
  // field -- the data would silently read back as null.
  generateSecrets(envA);
  assert.strictEqual(
    parseEnvFile(envA).LIMSX_FIELD_ENCRYPTION_KEY,
    firstA,
    "must not rotate on a subsequent launch -- existing ciphertext would " +
      "become permanently unreadable"
  );

  generateSecrets(envB);
  assert.notStrictEqual(
    parseEnvFile(envB).LIMSX_FIELD_ENCRYPTION_KEY,
    firstA,
    "each installation must get its own encryption key"
  );
});

test("main.js writeEnvFile carries every generated secret through", () => {
  // writeEnvFile() rewrites .env wholesale from a fixed list of lines. Any
  // generated secret missing from that list is erased on the next config
  // save -- which is how LIMSX_FIELD_ENCRYPTION_KEY would have been wiped
  // even after being generated correctly. Static source check: main.js
  // pulls in Electron APIs at require() time and cannot be imported here.
  const mainSrc = fs.readFileSync(
    path.join(__dirname, "..", "electron", "main.js"),
    "utf8"
  );

  for (const key of Object.keys(SECRET_DEFAULTS)) {
    if (key === "ADMIN_KEY") continue; // dead var, retained only for rotation
    assert.ok(
      mainSrc.includes(`${key}=\${existing.${key}`),
      `electron/main.js's writeEnvFile() must preserve ${key} from the ` +
        `existing .env -- omitting it silently erases the generated value ` +
        `the next time settings are saved`
    );
  }
});

test("an operator-supplied Fernet key is never overwritten", () => {
  const envPath = tmpEnvPath();
  // A key an operator generated themselves per DEPLOYMENT.md. Throwaway,
  // structurally valid, not a real deployment value.
  const supplied = require("node:crypto")
    .randomBytes(32)
    .toString("base64url")
    .padEnd(44, "=");
  fs.writeFileSync(envPath, `LIMSX_FIELD_ENCRYPTION_KEY=${supplied}\n`);

  generateSecrets(envPath);

  assert.strictEqual(
    parseEnvFile(envPath).LIMSX_FIELD_ENCRYPTION_KEY,
    supplied,
    "an operator-provided encryption key must be preserved verbatim"
  );
});
