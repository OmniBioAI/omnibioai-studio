import React, { useEffect, useRef, useState } from "react";

const GRAFANA_BASE  = "http://localhost:3000";
const DASHBOARD_URL = `${GRAFANA_BASE}/d/omnibioai-services/omnibioai-services?kiosk=tv&refresh=30s&from=now-1h&to=now`;
const DEFAULT_USER  = "admin";
const DEFAULT_PASS  = window.grafanaConfig?.password ?? "omnibioai";

export function GrafanaViewer({ onBack, label }) {
  const [phase, setPhase] = useState("authenticating"); // authenticating | ok | error
  const [error, setError] = useState("");
  const [user,  setUser]  = useState(DEFAULT_USER);
  const [pass,  setPass]  = useState(DEFAULT_PASS);
  const [busy,  setBusy]  = useState(false);
  const webviewRef         = useRef(null);

  const authenticate = async (username, password) => {
    setBusy(true);
    setError("");
    try {
      await window.electronAPI.grafanaLogin(username, password);
      setPhase("ok");
    } catch (e) {
      setError(e.message || "Auth failed — check Grafana is running");
      setPhase("error");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { authenticate(DEFAULT_USER, DEFAULT_PASS); }, []);

  /* ── authenticated: show dashboard webview ── */
  if (phase === "ok") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
          padding: "8px 16px",
          background: "var(--bg2)", borderBottom: "1px solid var(--border)",
        }}>
          <button
            onClick={onBack}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 12px", borderRadius: "var(--radius-sm)",
              background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.2)",
              color: "var(--accent)", fontFamily: "var(--font)", fontSize: "var(--font-size-xs)",
              fontWeight: 600, cursor: "pointer",
            }}
          >
            ← Back to Workbench
          </button>
          <span style={{
            fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)",
            color: "var(--color-text-muted)",
          }}>
            {label || "Metrics Dashboard"}
          </span>
          <span style={{
            marginLeft: "auto",
            fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)",
            color: "var(--border2)",
          }}>
            {DASHBOARD_URL}
          </span>
        </div>
        <webview
          ref={webviewRef}
          src={DASHBOARD_URL}
          style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
        />
      </div>
    );
  }

  /* ── authenticating / error: centered card ── */
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100%", background: "var(--color-bg)",
    }}>
      <div style={{
        width: 360,
        background: "var(--bg2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "32px 28px",
        boxShadow: "0 4px 32px rgba(0,0,0,0.4)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            marginBottom: 10,
          }}>
            <span style={{ fontSize: 22 }}>📈</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>
              Metrics Dashboard
            </span>
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
            {phase === "authenticating" ? "Connecting to Grafana…" : "Enter your Grafana credentials"}
          </div>
        </div>

        {phase === "authenticating" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              border: "3px solid var(--border2)", borderTopColor: "var(--accent)",
              animation: "omni-spin 0.7s linear infinite",
              margin: "0 auto 12px",
            }} />
            <span style={{ fontSize: "var(--font-size-sm)", fontFamily: "var(--mono)", color: "var(--color-text-secondary)" }}>
              Authenticating…
            </span>
          </div>
        )}

        {phase === "error" && (
          <form onSubmit={e => { e.preventDefault(); authenticate(user, pass); }}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {error && (
              <div style={{
                padding: "8px 12px",
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.30)",
                borderRadius: "var(--radius-sm)",
                color: "#ef4444",
                fontSize: "var(--font-size-xs)",
                fontFamily: "var(--mono)",
              }}>
                {error}
              </div>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                Username
              </span>
              <input
                type="text"
                value={user}
                onChange={e => setUser(e.target.value)}
                autoComplete="username"
                style={inputStyle}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                Password
              </span>
              <input
                type="password"
                value={pass}
                onChange={e => setPass(e.target.value)}
                autoComplete="current-password"
                style={inputStyle}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              style={{
                marginTop: 4, padding: "10px 16px",
                background: busy ? "rgba(0,229,160,0.4)" : "var(--accent)",
                color: "#000", border: "none",
                borderRadius: "var(--radius-sm)",
                fontFamily: "var(--font)", fontSize: "var(--font-size-sm)",
                fontWeight: 600, cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "Connecting…" : "Connect to Grafana"}
            </button>
          </form>
        )}
      </div>

      <style>{`@keyframes omni-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const inputStyle = {
  padding: "8px 10px",
  background: "var(--bg3)",
  border: "1px solid var(--border2)",
  borderRadius: "var(--radius-sm)",
  color: "#fff",
  fontFamily: "var(--font)",
  fontSize: "var(--font-size-sm)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
