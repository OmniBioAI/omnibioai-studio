import React, { useState } from "react";
import { Card, Button, Badge } from "@omnibioai/ui";
import { confirmOAuthLink } from "../lib/session";

const PROVIDER_LABELS = { google: "Google", github: "GitHub", microsoft: "Microsoft" };

export default function OAuthLinkConfirm({ linkToken, provider, email, onDone, onCancel }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await confirmOAuthLink(linkToken, password);
      onDone();
    } catch (err) {
      setError(err.message || "Could not confirm the link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{ width: 380 }}>
        <Card title="Link your account">
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginBottom: 16 }}>
            An account already exists for <strong style={{ color: "var(--text)" }}>{email}</strong>.
            Enter its password to link your {PROVIDER_LABELS[provider] || provider} sign-in to it.
          </div>
          <form onSubmit={submit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{
                fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)", color: "var(--color-text-muted)",
                letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, display: "block",
              }}>Existing account password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoFocus
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
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="primary" loading={busy} disabled={busy}>
                {busy ? "Linking…" : "Link account"}
              </Button>
              <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
