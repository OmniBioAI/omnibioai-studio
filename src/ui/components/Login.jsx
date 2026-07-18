import React, { useState } from "react";
import { Card, Button, Badge, Input } from "@omnibioai/ui";
import { loginWithPassword, isElectron, getOAuthLoginUrl, oauthProviders } from "../lib/session";

const PROVIDER_LABELS = { google: "Google", github: "GitHub", microsoft: "Microsoft" };

export default function Login({ title = "Sign in required", description }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await loginWithPassword(email, password);
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
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}>
      <div style={{ width: 340 }}>
        <Card title={title}>
          {description && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginBottom: 16 }}>
              {description}
            </div>
          )}
          <form onSubmit={submit}>
            <div style={{ marginBottom: 12 }}>
              <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@omnibioai" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{
                fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)", color: "var(--color-text-muted)",
                letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, display: "block",
              }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "var(--bg2)", border: "1px solid var(--border2)",
                  borderRadius: "var(--radius-sm)", padding: "7px 10px",
                  fontSize: "var(--font-size-sm)", fontFamily: "var(--mono)",
                  color: "var(--text)", outline: "none",
                }}
              />
            </div>
            {error && <div style={{ marginBottom: 12 }}><Badge variant="danger">{error}</Badge></div>}
            <Button variant="primary" loading={busy} disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          {!isElectron() && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 14px" }}>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontFamily: "var(--mono)" }}>or</span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {oauthProviders().map((provider) => (
                  <Button key={provider} variant="secondary" onClick={() => startOAuth(provider)}>
                    Sign in with {PROVIDER_LABELS[provider] || provider}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
