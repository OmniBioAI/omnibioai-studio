const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SESSION_FILE = "auth-session.enc";
const MAX_CREDENTIAL_LENGTH = 4096;
const AUTH_REQUEST_TIMEOUT_MS = 15000;

function resolveAuthOrigin({ packaged, configuredOrigin }) {
  const fallback = packaged ? "https://webstudio.omnibioai.org" : "http://localhost:8001";
  const value = configuredOrigin || fallback;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Authentication service URL is invalid");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("Authentication service URL is invalid");
  }
  if (packaged && parsed.protocol !== "https:") {
    throw new Error("Packaged authentication requires HTTPS");
  }
  if (!packaged && parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) {
    throw new Error("Development authentication must use HTTPS or local loopback");
  }
  return parsed.origin;
}

function isToken(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 16384;
}

function safeProfile(data) {
  if (!data?.valid || data.user_id == null || typeof data.email !== "string") return null;
  return {
    userId: data.user_id,
    email: data.email,
    roles: Array.isArray(data.roles) ? data.roles : [],
    permissions: Array.isArray(data.permissions) ? data.permissions : [],
    orgId: data.org_id ?? null,
  };
}

class AuthSession {
  constructor({
    packaged = false,
    configuredOrigin,
    safeStorage,
    userDataPath,
    fetchImpl = globalThis.fetch,
    fsImpl = fs,
    randomUUID = crypto.randomUUID,
    platform = process.platform,
  }) {
    this.origin = resolveAuthOrigin({ packaged, configuredOrigin });
    this.packaged = packaged;
    this.safeStorage = safeStorage;
    this.userDataPath = userDataPath;
    this.fetchImpl = fetchImpl;
    this.fs = fsImpl;
    this.randomUUID = randomUUID;
    this.platform = platform;
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    this.persistent = false;
    this.restored = false;
    this.storageStatus = this.secureStorageAvailable() ? "available" : "unavailable";
    this.challengeTokens = new Map();
  }

  get storePath() {
    return path.join(this.userDataPath, SESSION_FILE);
  }

  async request(route, { method = "GET", body, token } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try {
      response = await this.fetchImpl(`${this.origin}${route}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
      });
    } catch {
      const error = new Error("Authentication service is unavailable");
      error.code = "AUTH_NETWORK";
      throw error;
    }
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async persistRefreshToken() {
    this.persistent = false;
    const encryptionAvailable = this.secureStorageAvailable();
    if (!this.refreshToken || !encryptionAvailable) {
      if (!encryptionAvailable) this.storageStatus = "unavailable";
      this.removePersisted();
      return false;
    }
    const temporary = `${this.storePath}.${this.randomUUID()}.tmp`;
    try {
      const encrypted = this.safeStorage.encryptString(this.refreshToken);
      this.fs.mkdirSync(this.userDataPath, { recursive: true, mode: 0o700 });
      this.fs.writeFileSync(temporary, encrypted, { mode: 0o600, flag: "wx" });
      this.fs.renameSync(temporary, this.storePath);
      this.persistent = true;
      this.storageStatus = "available";
      return true;
    } catch {
      this.storageStatus = "error";
      try { this.fs.unlinkSync(temporary); } catch { /* no temporary file to remove */ }
      this.removePersisted();
      return false;
    }
  }

  removePersisted() {
    try { this.fs.unlinkSync(this.storePath); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  async acceptTokens(data) {
    if (!isToken(data?.access_token) || !isToken(data?.refresh_token)) {
      throw new Error("Authentication service returned an invalid session");
    }
    const { response, data: validation } = await this.request("/auth/validate", {
      method: "POST", body: { token: data.access_token },
    });
    const user = response.ok ? safeProfile(validation) : null;
    if (!user) {
      throw new Error("Authentication service rejected the session");
    }
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.user = user;
    if (!await this.persistRefreshToken()) {
      await this.clear();
      const error = new Error("Secure session storage is unavailable");
      error.code = "AUTH_SECURE_STORAGE";
      throw error;
    }
    this.restored = true;
    return this.snapshot();
  }

  snapshot() {
    return {
      authenticated: Boolean(this.accessToken && this.user),
      persistent: this.persistent,
      secureStorageAvailable: this.secureStorageAvailable(),
      storageStatus: this.storageStatus,
      user: this.user,
    };
  }

  secureStorageAvailable() {
    try {
      if (!this.safeStorage?.isEncryptionAvailable?.()) return false;
      if (this.platform === "linux") {
        const backend = this.safeStorage.getSelectedStorageBackend?.();
        return typeof backend === "string" && backend.length > 0 && backend !== "basic_text";
      }
      return true;
    } catch {
      return false;
    }
  }

  async restore() {
    if (this.restored) return this.snapshot();
    this.restored = true;
    this.storageStatus = this.secureStorageAvailable() ? "available" : "unavailable";
    if (!this.fs.existsSync(this.storePath)) return this.snapshot();
    const encryptionAvailable = this.secureStorageAvailable();
    if (!encryptionAvailable) {
      // Keep the opaque ciphertext so a temporarily unavailable OS key store
      // can recover on a later attempt. Nothing is decrypted or restored.
      this.restored = false;
      return this.snapshot();
    }
    try {
      const stat = this.fs.lstatSync(this.storePath);
      if (!stat.isFile() || stat.size > 65536) throw new Error("invalid encrypted session file");
      const decrypted = this.safeStorage.decryptString(this.fs.readFileSync(this.storePath));
      if (!isToken(decrypted)) throw new Error("invalid encrypted session");
      const { response, data } = await this.request("/auth/refresh", { method: "POST", body: { refresh_token: decrypted } });
      if (!response.ok) {
        this.removePersisted();
        return this.snapshot();
      }
      this.refreshToken = data.refresh_token || decrypted;
      this.accessToken = data.access_token;
      if (!isToken(this.accessToken) || !isToken(this.refreshToken)) throw new Error("invalid refresh response");
      if (!await this.persistRefreshToken()) {
        await this.clear({ revoke: false });
        this.storageStatus = "error";
        return this.snapshot();
      }
      const validation = await this.request("/auth/validate", { method: "POST", body: { token: this.accessToken } });
      this.user = validation.response.ok ? safeProfile(validation.data) : null;
      if (!this.user) await this.clear({ revoke: false });
      return this.snapshot();
    } catch (error) {
      if (error.code === "AUTH_NETWORK") {
        this.accessToken = null;
        this.refreshToken = null;
        this.user = null;
        this.restored = false;
        return this.snapshot();
      }
      this.storageStatus = "corrupt";
      this.accessToken = null;
      this.refreshToken = null;
      this.user = null;
      this.removePersisted();
      return this.snapshot();
    }
  }

  async login({ email, password }) {
    if (typeof email !== "string" || email.length > 320 || typeof password !== "string"
      || password.length < 1 || password.length > MAX_CREDENTIAL_LENGTH) {
      throw new Error("Enter a valid email and password");
    }
    if (!this.secureStorageAvailable()) {
      this.storageStatus = "unavailable";
      const error = new Error("Secure session storage is unavailable");
      error.code = "AUTH_SECURE_STORAGE";
      throw error;
    }
    const { response, data } = await this.request("/auth/login", { method: "POST", body: { email, password } });
    if (!response.ok) throw new Error(response.status === 401 ? "Invalid email or password" : "Login failed");
    if (data.mfa_required) {
      if (!isToken(data.challenge_token)) throw new Error("Authentication service returned an invalid challenge");
      if (this.challengeTokens.size >= 8) this.challengeTokens.delete(this.challengeTokens.keys().next().value);
      const challengeId = this.randomUUID();
      this.challengeTokens.set(challengeId, data.challenge_token);
      return { mfaRequired: true, challengeId, methods: Array.isArray(data.methods) ? data.methods : [] };
    }
    return this.acceptTokens(data);
  }

  async completeMfa({ challengeId, code, method }) {
    const validCode = typeof code === "string" && (method === "email"
      ? /^\d{6}$/.test(code)
      : method === "totp"
        ? /^\d{6}$/.test(code)
        : method === "recovery_code"
          ? /^[A-Za-z0-9-]{6,32}$/.test(code)
          : /^[A-Za-z0-9-]{6,32}$/.test(code));
    if (typeof challengeId !== "string" || !this.challengeTokens.has(challengeId)
      || !validCode
      || (method !== undefined && !["email", "totp", "recovery_code"].includes(method))) {
      throw new Error("Invalid MFA challenge");
    }
    const challengeToken = this.challengeTokens.get(challengeId);
    const { response, data } = await this.request("/users/me/mfa/challenge", {
      method: "POST", body: { challenge_token: challengeToken, code, ...(method ? { method } : {}) },
    });
    if (response.ok && data.mfa_required && isToken(data.challenge_token)) {
      this.challengeTokens.delete(challengeId);
      if (this.challengeTokens.size >= 8) this.challengeTokens.delete(this.challengeTokens.keys().next().value);
      const nextChallengeId = this.randomUUID();
      this.challengeTokens.set(nextChallengeId, data.challenge_token);
      return { mfaRequired: true, challengeId: nextChallengeId, methods: Array.isArray(data.methods) ? data.methods : [] };
    }
    if (!response.ok || !data.access_token) throw new Error("MFA verification failed");
    this.challengeTokens.delete(challengeId);
    return this.acceptTokens(data);
  }

  async resendMfa({ challengeId }) {
    const challengeToken = typeof challengeId === "string" ? this.challengeTokens.get(challengeId) : null;
    if (!challengeToken) throw new Error("Invalid MFA challenge");
    const { response, data } = await this.request("/users/me/mfa/email/resend", {
      method: "POST", body: { challenge_token: challengeToken },
    });
    if (!response.ok) throw new Error("Unable to resend verification code");
    return data.cooldown_seconds ?? 60;
  }

  async refresh() {
    if (!this.refreshToken) return null;
    let result;
    try {
      result = await this.request("/auth/refresh", {
        method: "POST", body: { refresh_token: this.refreshToken },
      });
    } catch (error) {
      if (error.code === "AUTH_NETWORK") return null;
      throw error;
    }
    const { response, data } = result;
    if (!response.ok || !isToken(data.access_token)) {
      if ([400, 401, 403].includes(response.status)) await this.clear({ revoke: false });
      return null;
    }
    try {
      return await this.acceptTokens({ ...data, refresh_token: data.refresh_token || this.refreshToken });
    } catch (error) {
      if (error.code === "AUTH_NETWORK") {
        this.accessToken = null;
        this.user = null;
        this.restored = false;
        return null;
      }
      throw error;
    }
  }

  async identity() {
    const status = await this.restore();
    if (!status.authenticated) return null;
    const { response, data } = await this.request("/me", { token: this.accessToken });
    if (response.status === 401) {
      await this.clear({ revoke: false });
      return null;
    }
    if (!response.ok || !data?.user || typeof data.user.email !== "string" || data.user.id == null) {
      throw new Error("Identity service is unavailable");
    }
    return { user: { id: data.user.id, email: data.user.email }, organizations: data.organizations || [] };
  }

  async clear({ revoke = true } = {}) {
    const access = this.accessToken;
    const refresh = this.refreshToken;
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    this.persistent = false;
    this.challengeTokens.clear();
    this.restored = true;
    this.removePersisted();
    if (revoke && refresh) {
      try {
        await this.request("/auth/logout", {
          method: "POST", body: { refresh_token: refresh, ...(access ? { access_token: access } : {}) },
        });
      } catch { /* Local logout succeeds even if server revocation is unavailable. */ }
    }
    return this.snapshot();
  }

  getAccessTokenForTrustedRequest() {
    return this.user ? this.accessToken : null;
  }
}

module.exports = { AuthSession, SESSION_FILE, resolveAuthOrigin };
