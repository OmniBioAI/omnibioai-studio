import React, { useState } from "react";
import { Badge } from "@omnibioai/ui";
import { loginWithPassword, loginWithLicenseKey, isElectron, getOAuthLoginUrl, oauthProviders } from "../lib/session";

const PROVIDER_LABELS = { google: "Google", github: "GitHub", microsoft: "Microsoft" };

const ACCENT = "#00d4aa";
const CARD_BG = "#0f1d2e";
const PAGE_BG = "#04080f";
const FIELD_BG = "#080e1a";
const FIELD_BORDER = "rgba(0, 212, 170, 0.12)";
const TEXT = "#e8f0fe";
const MUTED = "#7a9bbf";
const LABEL_MUTED = "#3d5a78";

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

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M15.68 8.18c0-.57-.05-1.11-.14-1.64H8v3.1h4.3a3.68 3.68 0 0 1-1.6 2.42v2h2.58c1.51-1.39 2.4-3.44 2.4-5.88z"/>
      <path fill="#34A853" d="M8 16c2.16 0 3.97-.72 5.29-1.94l-2.58-2c-.72.48-1.63.77-2.71.77-2.08 0-3.85-1.41-4.48-3.3H.86v2.07A8 8 0 0 0 8 16z"/>
      <path fill="#FBBC05" d="M3.52 9.53a4.8 4.8 0 0 1 0-3.06V4.4H.86a8 8 0 0 0 0 7.2l2.66-2.07z"/>
      <path fill="#EA4335" d="M8 3.18c1.17 0 2.23.4 3.06 1.19l2.29-2.29A7.95 7.95 0 0 0 8 0a8 8 0 0 0-7.14 4.4l2.66 2.07C4.15 4.59 5.92 3.18 8 3.18z"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill={MUTED} xmlns="http://www.w3.org/2000/svg">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="7.2" height="7.2" fill="#F25022"/>
      <rect x="8.8" y="0" width="7.2" height="7.2" fill="#7FBA00"/>
      <rect x="0" y="8.8" width="7.2" height="7.2" fill="#00A4EF"/>
      <rect x="8.8" y="8.8" width="7.2" height="7.2" fill="#FFB900"/>
    </svg>
  );
}

const PROVIDER_ICONS = { google: GoogleIcon, github: GitHubIcon, microsoft: MicrosoftIcon };

function fieldStyle(extra) {
  return {
    width: "100%",
    boxSizing: "border-box",
    background: FIELD_BG,
    border: `1px solid ${FIELD_BORDER}`,
    borderRadius: 6,
    padding: "0.65rem 0.9rem",
    fontSize: 13,
    fontFamily: "var(--mono)",
    color: TEXT,
    outline: "none",
    ...extra,
  };
}

function labelStyle() {
  return {
    fontSize: "0.7rem",
    fontFamily: "var(--mono)",
    color: LABEL_MUTED,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 6,
    display: "block",
  };
}

export default function Login({ title, description }) {
  const [mode, setMode] = useState("license"); // "password" | "license"
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
        width: "100vw",
        background: PAGE_BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(0,212,170,0.03) 1px, transparent 1px), " +
            "linear-gradient(90deg, rgba(0,212,170,0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>
        <div
          className="studio-login-card"
          style={{
            background: CARD_BG,
            border: "1px solid rgba(0, 212, 170, 0.25)",
            borderRadius: 12,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
            <LogoMark />
            <div
              style={{
                fontFamily: "var(--mono)",
                color: ACCENT,
                fontSize: 15,
                marginTop: 12,
                letterSpacing: "0.02em",
              }}
            >
              OmniBioAI / beta
            </div>
            <div
              style={{
                marginTop: 12,
                background: "rgba(0, 212, 170, 0.08)",
                border: "1px solid rgba(0, 212, 170, 0.2)",
                borderRadius: 3,
                padding: "3px 8px",
                fontFamily: "var(--mono)",
                fontSize: "0.65rem",
                color: ACCENT,
              }}
            >
              ● Private beta · v0.7.0
            </div>
          </div>

          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 600, color: TEXT }}>Welcome back</div>
            <div style={{ fontSize: "0.82rem", color: MUTED, marginTop: 6 }}>AI-native bioinformatics platform</div>
            {(title || description) && (
              <div style={{ marginTop: 10 }}>
                {title && <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{title}</div>}
                {description && <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{description}</div>}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: 4,
              marginBottom: 20,
              background: FIELD_BG,
              border: `1px solid ${FIELD_BORDER}`,
              borderRadius: 6,
              padding: 3,
            }}
          >
            {["password", "license"].map((m) => (
              <button
                key={m}
                type="button"
                className="studio-login-tab"
                onClick={() => { setMode(m); setError(""); }}
                style={{
                  flex: 1, padding: "8px 0", cursor: "pointer",
                  fontSize: "0.78rem", fontFamily: "var(--mono)",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  background: mode === m ? CARD_BG : "transparent",
                  color: mode === m ? ACCENT : MUTED,
                  border: mode === m ? "1px solid rgba(0, 212, 170, 0.25)" : "1px solid transparent",
                  borderRadius: 5,
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
                  style={fieldStyle({ color: ACCENT, letterSpacing: "0.1em", textTransform: "uppercase" })}
                />
              </div>
            )}
            {error && <div style={{ marginBottom: 14 }}><Badge variant="danger">{error}</Badge></div>}
            <button
              type="submit"
              disabled={busy}
              className="studio-login-btn"
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
              {busy ? "Signing in…" : mode === "license" ? "Activate License →" : "Sign in"}
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
                {oauthProviders().map((provider) => {
                  const Icon = PROVIDER_ICONS[provider];
                  return (
                    <button
                      key={provider}
                      type="button"
                      className="studio-login-btn"
                      onClick={() => startOAuth(provider)}
                      style={{
                        width: "100%",
                        padding: "9px 0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        background: "transparent",
                        color: MUTED,
                        border: "1px solid rgba(0, 212, 170, 0.15)",
                        borderRadius: 6,
                        fontSize: "0.82rem",
                        cursor: "pointer",
                      }}
                    >
                      {Icon && <Icon />}
                      Sign in with {PROVIDER_LABELS[provider] || provider}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: 24, fontSize: "0.72rem", color: LABEL_MUTED }}>
            No account? Request beta access at{" "}
            <a href="https://omnibioai.org" style={{ color: ACCENT, textDecoration: "none" }}>
              omnibioai.org
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
