const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AuthSession, resolveAuthOrigin } = require("../../electron/authSession");

function response(status, data) {
  return { status, ok: status >= 200 && status < 300, json: async () => data };
}

function secureStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: value => Buffer.from(`protected:${Buffer.from(value).toString("base64")}`),
    decryptString: value => Buffer.from(value.toString().replace(/^protected:/, ""), "base64").toString(),
  };
}

function fixture(t, fetchImpl, options = {}) {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "studio-auth-session-"));
  t.after(() => fs.rmSync(userDataPath, { recursive: true, force: true }));
  return new AuthSession({
    packaged: options.packaged ?? true,
    configuredOrigin: options.configuredOrigin,
    userDataPath,
    safeStorage: options.safeStorage ?? secureStorage(),
    fetchImpl,
    randomUUID: (() => { let id = 0; return () => `challenge-${++id}`; })(),
  });
}

test("packaged authentication requires HTTPS and development permits only loopback HTTP", () => {
  assert.equal(resolveAuthOrigin({ packaged: true }), "https://webstudio.omnibioai.org");
  assert.equal(resolveAuthOrigin({ packaged: false, configuredOrigin: "http://localhost:8001" }), "http://localhost:8001");
  assert.throws(() => resolveAuthOrigin({ packaged: true, configuredOrigin: "http://localhost:8001" }), /requires HTTPS/);
  assert.throws(() => resolveAuthOrigin({ packaged: false, configuredOrigin: "http://auth.example.org" }), /loopback/);
  assert.throws(() => resolveAuthOrigin({ packaged: true, configuredOrigin: "https://user:secret@example.org" }), /invalid/);
});

test("login stores the refresh token only through protected storage and exposes a safe profile", async t => {
  const session = fixture(t, async (url, options) => {
    assert.equal(new URL(url).origin, "https://webstudio.omnibioai.org");
    if (url.endsWith("/auth/login")) {
      assert.equal(options.redirect, "error");
      assert.equal(options.signal instanceof AbortSignal, true);
      assert.equal(options.body.includes("password"), true);
      return response(200, { access_token: "raw-access-secret", refresh_token: "raw-refresh-secret" });
    }
    assert.equal(url.endsWith("/auth/validate"), true);
    return response(200, { valid: true, user_id: 8, email: "user@example.org", roles: ["user"], permissions: ["read"], org_id: 4 });
  });
  const result = await session.login({ email: "user@example.org", password: "test-password" });
  assert.deepEqual(result, {
    authenticated: true, persistent: true, secureStorageAvailable: true,
    storageStatus: "available",
    user: { userId: 8, email: "user@example.org", roles: ["user"], permissions: ["read"], orgId: 4 },
  });
  const encrypted = fs.readFileSync(session.storePath);
  assert.equal(encrypted.includes(Buffer.from("raw-refresh-secret")), false);
  assert.deepEqual(Object.keys(result), ["authenticated", "persistent", "secureStorageAvailable", "storageStatus", "user"]);
  assert.equal(session.getAccessTokenForTrustedRequest(), "raw-access-secret");
});

test("login does not retain or persist tokens until Auth validates the session", async t => {
  const session = fixture(t, async url => url.endsWith("/auth/login")
    ? response(200, { access_token: "untrusted-access", refresh_token: "untrusted-refresh" })
    : response(401, { valid: false }));
  await assert.rejects(session.login({ email: "a@example.org", password: "password" }), /rejected the session/);
  assert.equal(session.snapshot().authenticated, false);
  assert.equal(session.getAccessTokenForTrustedRequest(), null);
  assert.equal(fs.existsSync(session.storePath), false);
});

test("invalid login errors are sanitized and malformed input is rejected before network access", async t => {
  let requests = 0;
  const session = fixture(t, async () => {
    requests += 1;
    return response(401, { detail: "secret-bearing backend detail" });
  });
  await assert.rejects(session.login({ email: "", password: "" }), /valid email and password/);
  assert.equal(requests, 0);
  await assert.rejects(session.login({ email: "a@example.org", password: "wrong" }), error => {
    assert.equal(error.message, "Invalid email or password");
    assert.equal(error.message.includes("secret-bearing"), false);
    return true;
  });
  assert.equal(requests, 1);
});

test("storage unavailability fails closed without a plaintext or in-memory session", async t => {
  let requests = 0;
  const session = fixture(t, async () => {
    requests += 1;
    return response(200, { access_token: "access", refresh_token: "refresh" });
  }, { safeStorage: secureStorage(false) });
  await assert.rejects(session.login({ email: "a@example.org", password: "password" }), error => {
    assert.equal(error.code, "AUTH_SECURE_STORAGE");
    assert.equal(error.message, "Secure session storage is unavailable");
    return true;
  });
  assert.equal(session.snapshot().authenticated, false);
  assert.equal(session.snapshot().storageStatus, "unavailable");
  assert.equal(session.getAccessTokenForTrustedRequest(), null);
  assert.equal(fs.existsSync(session.storePath), false);
  assert.equal(requests, 0);
});

test("Linux basic_text storage is rejected as not protected by the OS key store", async t => {
  const storage = secureStorage(true);
  storage.getSelectedStorageBackend = () => "basic_text";
  const session = fixture(t, async url => url.endsWith("/auth/login")
    ? response(200, { access_token: "access", refresh_token: "refresh" })
    : response(200, { valid: true, user_id: 1, email: "a@example.org" }), { safeStorage: storage });
  await assert.rejects(session.login({ email: "a@example.org", password: "password" }), /Secure session storage is unavailable/);
  assert.equal(session.snapshot().authenticated, false);
  assert.equal(session.snapshot().secureStorageAvailable, false);
  assert.equal(session.snapshot().storageStatus, "unavailable");
  assert.equal(session.getAccessTokenForTrustedRequest(), null);
  assert.equal(fs.existsSync(session.storePath), false);
});

test("MFA challenge secrets stay in main and the renderer receives only an opaque handle", async t => {
  const session = fixture(t, async url => {
    if (url.endsWith("/auth/login")) return response(200, { mfa_required: true, challenge_token: "server-challenge-secret", methods: ["email"] });
    return response(200, { access_token: "access", refresh_token: "refresh" });
  });
  const challenge = await session.login({ email: "a@example.org", password: "password" });
  assert.deepEqual(challenge, { mfaRequired: true, challengeId: "challenge-1", methods: ["email"] });
  assert.equal(JSON.stringify(challenge).includes("server-challenge-secret"), false);
  await assert.rejects(session.completeMfa({ challengeId: "server-challenge-secret", code: "123456" }), /Invalid MFA/);
  await assert.rejects(session.completeMfa({ challengeId: challenge.challengeId, code: "bad" }), /Invalid MFA/);
});

test("MFA completion validates the returned session before exposing profile metadata", async t => {
  const session = fixture(t, async (url, options) => {
    if (url.endsWith("/auth/login")) return response(200, { mfa_required: true, challenge_token: "server-challenge", methods: ["totp"] });
    if (url.endsWith("/users/me/mfa/challenge")) {
      const body = JSON.parse(options.body);
      assert.equal(body.challenge_token, "server-challenge");
      assert.equal(body.code, "123456");
      return response(200, { access_token: "mfa-access", refresh_token: "mfa-refresh" });
    }
    return response(200, { valid: true, user_id: 10, email: "mfa@example.org", permissions: ["read"] });
  });
  const challenge = await session.login({ email: "mfa@example.org", password: "password" });
  const result = await session.completeMfa({ challengeId: challenge.challengeId, code: "123456" });
  assert.equal(result.authenticated, true);
  assert.equal(result.user.email, "mfa@example.org");
  assert.equal(JSON.stringify(result).includes("mfa-access"), false);
  assert.equal(session.getAccessTokenForTrustedRequest(), "mfa-access");
});

test("an invalid or interrupted MFA attempt does not expose or discard the opaque challenge", async t => {
  let attempts = 0;
  const session = fixture(t, async url => {
    if (url.endsWith("/auth/login")) return response(200, { mfa_required: true, challenge_token: "server-challenge", methods: ["totp"] });
    if (url.endsWith("/users/me/mfa/challenge")) {
      attempts += 1;
      if (attempts === 1) return response(401, { detail: "backend detail must not escape" });
      return response(200, { access_token: "access", refresh_token: "refresh" });
    }
    return response(200, { valid: true, user_id: 10, email: "mfa@example.org" });
  });
  const challenge = await session.login({ email: "mfa@example.org", password: "password" });
  await assert.rejects(session.completeMfa({ challengeId: challenge.challengeId, code: "123456" }), error => {
    assert.equal(error.message, "MFA verification failed");
    assert.equal(error.message.includes("backend detail"), false);
    return true;
  });
  assert.equal(session.challengeTokens.has(challenge.challengeId), true);
  const result = await session.completeMfa({ challengeId: challenge.challengeId, code: "654321" });
  assert.equal(result.authenticated, true);
  assert.equal(session.challengeTokens.has(challenge.challengeId), false);
});

test("MFA recovery codes retain their existing alphanumeric hyphenated format", async t => {
  let submittedCode;
  let submittedMethod;
  const session = fixture(t, async (url, options) => {
    if (url.endsWith("/auth/login")) return response(200, { mfa_required: true, challenge_token: "challenge", methods: ["totp", "recovery_code"] });
    if (url.endsWith("/users/me/mfa/challenge")) {
      const body = JSON.parse(options.body);
      submittedCode = body.code;
      submittedMethod = body.method;
      return response(200, { access_token: "access", refresh_token: "refresh" });
    }
    return response(200, { valid: true, user_id: 4, email: "recovery@example.org" });
  });
  const challenge = await session.login({ email: "recovery@example.org", password: "password" });
  const result = await session.completeMfa({
    challengeId: challenge.challengeId,
    code: "ABCD-EFGH-JKLM",
    method: "recovery_code",
  });
  assert.equal(result.authenticated, true);
  assert.equal(submittedCode, "ABCD-EFGH-JKLM");
  assert.equal(submittedMethod, "recovery_code");
  await assert.rejects(session.completeMfa({ challengeId: challenge.challengeId, code: "bad", method: "recovery_code" }), /Invalid MFA/);
});

test("restore refreshes the protected refresh credential and logout clears it", async t => {
  const store = fixture(t, async url => {
    if (url.endsWith("/auth/refresh")) return response(200, { access_token: "new-access", refresh_token: "new-refresh" });
    return response(200, { valid: true, user_id: 2, email: "restored@example.org" });
  });
  store.fs.mkdirSync(store.userDataPath, { recursive: true });
  store.fs.writeFileSync(store.storePath, Buffer.from(`protected:${Buffer.from("stored-refresh").toString("base64")}`), { mode: 0o600 });
  const restored = await store.restore();
  assert.equal(restored.authenticated, true);
  assert.equal(restored.user.email, "restored@example.org");
  await store.clear();
  assert.equal(store.getAccessTokenForTrustedRequest(), null);
  assert.equal(fs.existsSync(store.storePath), false);
});

test("transient restore failure preserves the encrypted session for a later retry", async t => {
  let calls = 0;
  const store = fixture(t, async () => {
    calls += 1;
    throw new Error("offline");
  });
  store.fs.mkdirSync(store.userDataPath, { recursive: true });
  store.fs.writeFileSync(store.storePath, Buffer.from(`protected:${Buffer.from("refresh").toString("base64")}`));
  const first = await store.restore();
  assert.equal(first.authenticated, false);
  assert.equal(fs.existsSync(store.storePath), true);
  assert.equal(store.restored, false);
  assert.equal(calls, 1);
});

test("unavailable secure storage preserves only opaque ciphertext for later recovery", async t => {
  const session = fixture(t, async () => { throw new Error("network must not be used"); }, { safeStorage: secureStorage(false) });
  session.fs.mkdirSync(session.userDataPath, { recursive: true });
  session.fs.writeFileSync(session.storePath, Buffer.from("opaque-encrypted-session"));
  const snapshot = await session.restore();
  assert.equal(snapshot.authenticated, false);
  assert.equal(snapshot.storageStatus, "unavailable");
  assert.equal(session.restored, false);
  assert.equal(fs.existsSync(session.storePath), true);
  assert.equal(session.getAccessTokenForTrustedRequest(), null);
});

test("restore fails closed if refreshed session material cannot be protected", async t => {
  let encryptionChecks = 0;
  const storage = secureStorage(true);
  storage.isEncryptionAvailable = () => ++encryptionChecks < 4;
  const session = fixture(t, async url => url.endsWith("/auth/refresh")
    ? response(200, { access_token: "new-access", refresh_token: "new-refresh" })
    : response(200, { valid: true, user_id: 2, email: "restored@example.org" }), { safeStorage: storage });
  session.fs.mkdirSync(session.userDataPath, { recursive: true });
  session.fs.writeFileSync(session.storePath, Buffer.from(`protected:${Buffer.from("stored-refresh").toString("base64")}`));
  const snapshot = await session.restore();
  assert.equal(snapshot.authenticated, false);
  assert.equal(snapshot.storageStatus, "error");
  assert.equal(session.getAccessTokenForTrustedRequest(), null);
  assert.equal(fs.existsSync(session.storePath), false);
});

test("corrupt encrypted storage is cleared without plaintext recovery", async t => {
  const session = fixture(t, async () => { throw new Error("should not contact Auth before decrypting"); });
  session.safeStorage.decryptString = () => { throw new Error("invalid ciphertext"); };
  session.fs.mkdirSync(session.userDataPath, { recursive: true });
  session.fs.writeFileSync(session.storePath, Buffer.from("not-protected-data"));
  const snapshot = await session.restore();
  assert.equal(snapshot.authenticated, false);
  assert.equal(snapshot.storageStatus, "corrupt");
  assert.equal(fs.existsSync(session.storePath), false);
  assert.equal(session.getAccessTokenForTrustedRequest(), null);
});

test("refresh preserves a session on network failure but clears it on server rejection", async t => {
  let refreshStatus = 200;
  let offline = false;
  const session = fixture(t, async url => {
    if (offline) throw new Error("offline");
    if (url.endsWith("/auth/login")) return response(200, { access_token: "access", refresh_token: "refresh" });
    if (url.endsWith("/auth/refresh")) return response(refreshStatus, refreshStatus === 200
      ? { access_token: "refreshed-access", refresh_token: "refreshed-refresh" } : {});
    return response(200, { valid: true, user_id: 3, email: "active@example.org" });
  });
  await session.login({ email: "active@example.org", password: "password" });
  offline = true;
  assert.equal(await session.refresh(), null);
  assert.equal(session.getAccessTokenForTrustedRequest(), "access");
  assert.equal(fs.existsSync(session.storePath), true);
  offline = false;
  refreshStatus = 401;
  assert.equal(await session.refresh(), null);
  assert.equal(session.getAccessTokenForTrustedRequest(), null);
  assert.equal(fs.existsSync(session.storePath), false);
});

test("logout sends revocation before reporting the signed-out state", async t => {
  let revoked = false;
  const session = fixture(t, async (url, options) => {
    if (url.endsWith("/auth/logout")) {
      const body = JSON.parse(options.body);
      assert.equal(body.refresh_token, "refresh");
      assert.equal(body.access_token, "access");
      revoked = true;
    }
    if (url.endsWith("/auth/validate")) return response(200, { valid: true, user_id: 1, email: "a@example.org" });
    return response(200, { access_token: "access", refresh_token: "refresh" });
  });
  await session.login({ email: "a@example.org", password: "password" });
  const result = await session.clear();
  assert.equal(revoked, true);
  assert.equal(result.authenticated, false);
  assert.equal(session.getAccessTokenForTrustedRequest(), null);
  assert.equal(fs.existsSync(session.storePath), false);
});
