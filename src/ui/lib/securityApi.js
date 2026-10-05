// Personal-security client for canonical omnibioai-auth endpoints. Identity
// remains in session.js; this module only owns MFA-device and session calls.
import { authUrl, clearSession, getSessionVersion, getToken } from "../lib/session";

async function request(path, options = {}) {
  const token = getToken();
  const version = getSessionVersion();
  const res = await fetch(authUrl(path), {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    credentials: "omit",
    cache: "no-store",
  });

  if (version !== getSessionVersion() || token !== getToken()) return null;
  if (res.status === 401) {
    clearSession();
    return null;
  }
  if (!res.ok) {
    const error = new Error("Personal security service unavailable. Please try again.");
    error.status = res.status;
    // Only these enrollment errors are safe, fixed IAM contract strings.
    // Never propagate response bodies, validation inputs, or backend traces.
    if (path === "/users/me/mfa/totp/verify" && res.status === 400) {
      const body = await res.json().catch(() => null);
      if (version !== getSessionVersion() || token !== getToken()) return null;
      const messages = {
        "Invalid verification code": "Invalid verification code. Try a new code from your authenticator.",
        "This enrollment is no longer active -- start a new one": "This enrollment is no longer active. Start again.",
        "This device is already verified": "This authenticator is already verified. Close setup and refresh the device list.",
      };
      if (Object.hasOwn(messages, body?.detail)) {
        error.mfaMessage = messages[body.detail];
        error.mfaTerminal = body.detail !== "Invalid verification code";
      }
    }
    throw error;
  }
  if (res.status === 204) return null;
  const data = await res.json();
  if (version !== getSessionVersion() || token !== getToken()) return null;
  return data;
}

export const listMfaDevices = ({ signal } = {}) =>
  request("/users/me/mfa/devices", { signal });

export const listSessions = ({ signal } = {}) =>
  request("/sessions", { signal });

export const revokeSession = (sessionId, { signal } = {}) =>
  request(`/sessions/${encodeURIComponent(sessionId)}/revoke`, { method: "POST", signal });

export const startMfaEnrollment = () => request("/users/me/mfa/totp/enroll", { method: "POST" });
export const verifyMfaEnrollment = (deviceId, code) => request("/users/me/mfa/totp/verify", {
  method: "POST", body: JSON.stringify({ device_id: deviceId, code }),
});
export const removeMfaDevice = deviceId => request(`/users/me/mfa/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
export const getRecoveryCodeStatus = () => request("/users/me/mfa/recovery-codes");
export const generateRecoveryCodes = () => request("/users/me/mfa/recovery-codes", { method: "POST" });
export const regenerateRecoveryCodes = () => request("/users/me/mfa/recovery-codes/regenerate", { method: "POST" });
