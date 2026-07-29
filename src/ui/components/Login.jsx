import React, { useState } from "react";
import { Badge } from "@omnibioai/ui";
import { loginWithPassword, loginWithLicenseKey, isElectron, getOAuthLoginUrl, oauthProviders } from "../lib/session";

const PROVIDER_LABELS = { google: "Google", github: "GitHub", microsoft: "Microsoft" };

const ACCENT = "#00d4aa";
const CARD_BG = "#0f1d2e";
const PAGE_BG = "#04080f";
const FIELD_BG = "#0a1420";
const FIELD_BORDER = "rgba(255, 255, 255, 0.1)";
const TEXT = "#e8eaf0";
const MUTED = "#7c8aa0";

function LogoMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20 2 L36 11 V29 L20 38 L4 29 V11 Z"
        stroke={ACCENT}
        strokeWidth="2"
        fill="rgba(0, 212, 170, 0.08)"
      />
      <path d="M20 12 L28 16.5 V25.5 L20 30 L12 25.5 V16.5 Z" fill={ACCENT} opacity="0.85" />
    </svg>
  );
}

function fieldStyle(extra) {
  return {
    width: "100%",
    boxSizing: "border-box",
    background: FIELD_BG,
    border: `1px solid ${FIELD_BORDER}`,
    borderRadius: 6,
    padding: "9px 12px",
    fontSize: 13,
    fontFamily: "var(--mono)",
    color: TEXT,
    outline: "none",
    ...extra,
  };
}

function labelStyle() {
  return {
    fontSize: 11,
    fontFamily: "var(--mono)",
    color: MUTED,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 6,
    display: "block",
  };
}

export default function Login({ title = "Sign in required", description }) {
  const [mode, setMode] = useState("password"); // "password" | "license"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "license") {
        await loginWithLicenseKey(licenseKey.trim(), email, isElectron() ? "desktop" : "web");
      } else {
        await loginWithPassword(email, password);
      }
      // Success dispatches omnibioai-session-changed; listeners (e.g. App.jsx)
      // pick up the new currentUser and re-render past this screen.
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const startOAuth = (provider) => {
    window.location.href = getOAuthLoginUrl(provider);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: PAGE_BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div
          style={{
            background: CARD_BG,
            border: "1px solid rgba(0, 212, 170, 0.25)",
            borderRadius: 8,
            padding: "2.5rem",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
            <LogoMark />
            <div style={{ fontSize: 20, fontWeight: 600, color: TEXT, marginTop: 14 }}>OmniBioAI Studio</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>AI-native bioinformatics platform</div>
          </div>

          {(title || description) && (
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              {title && <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{title}</div>}
              {description && (
                <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{description}</div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
            {["password", "license"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(""); }}
                style={{
                  flex: 1, padding: "8px 0", cursor: "pointer",
                  fontSize: 11, fontFamily: "var(--mono)",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  background: mode === m ? "rgba(0, 212, 170, 0.12)" : "transparent",
                  color: mode === m ? ACCENT : MUTED,
                  border: `1px solid ${mode === m ? "rgba(0, 212, 170, 0.4)" : FIELD_BORDER}`,
                  borderRadius: 6,
                  transition: "background 0.15s, color 0.15s, border-color 0.15s",
                }}
              >
                {m === "password" ? "Password" : "License Key"}
              </button>
            ))}
          </div>

          <form onSubmit={submit}>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle()}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@omnibioai"
                style={fieldStyle()}
              />
            </div>
            {mode === "password" ? (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle()}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={fieldStyle()}
                />
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle()}>License Key</label>
                <input
                  type="text"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="OMNI-XXXX-XXXX-XXXX-XXXX"
                  style={fieldStyle({ textTransform: "uppercase" })}
                />
              </div>
            )}
            {error && <div style={{ marginBottom: 14 }}><Badge variant="danger">{error}</Badge></div>}
            <button
              type="submit"
              disabled={busy}
              style={{
                width: "100%",
                padding: "10px 0",
                background: ACCENT,
                color: PAGE_BG,
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {!isElectron() && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 16px" }}>
                <div style={{ flex: 1, height: 1, background: FIELD_BORDER }} />
                <span style={{ fontSize: 11, color: MUTED, fontFamily: "var(--mono)" }}>or</span>
                <div style={{ flex: 1, height: 1, background: FIELD_BORDER }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {oauthProviders().map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => startOAuth(provider)}
                    style={{
                      width: "100%",
                      padding: "9px 0",
                      background: "transparent",
                      color: TEXT,
                      border: `1px solid ${FIELD_BORDER}`,
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Sign in with {PROVIDER_LABELS[provider] || provider}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
