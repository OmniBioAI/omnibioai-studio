import React, { useEffect, useRef, useState } from "react";
import { Card, Button, Badge, Spinner } from "@omnibioai/ui";

const GRAFANA_BASE = "http://localhost:3000";

const QUERY_SUFFIX = "?kiosk=tv&refresh=30s&from=now-1h&to=now";

const TABS = [
  { label: "Services",          uid: "omnibioai-services" },
  { label: "Platform Overview", uid: "omnibioai-platform-overview" },
  { label: "LIMS",              uid: "omnibioai-lims" },
  { label: "RAG",               uid: "omnibioai-rag" },
];

function dashboardUrl(uid) {
  return `${GRAFANA_BASE}/d/${uid}/${uid}${QUERY_SUFFIX}`;
}

export function GrafanaViewer({ onBack, label }) {
  const [phase,     setPhase]     = useState("authenticating"); // authenticating | ok | error
  const [error,     setError]     = useState("");
  const [busy,      setBusy]      = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const webviewRef                 = useRef(null);

  const authenticate = async () => {
    setBusy(true);
    setError("");
    try {
      await window.electronAPI.grafanaLogin();
      setPhase("ok");
    } catch (e) {
      setError(e.message || "Auth failed — check Grafana is running");
      setPhase("error");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { authenticate(); }, []);

  /* ── authenticating ── */
  if (phase === "authenticating") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: "var(--color-bg)" }}>
        <Spinner size="lg" />
      </div>
    );
  }

  /* ── authenticated: show dashboard with tab bar ── */
  if (phase === "ok") {
    const currentUrl = dashboardUrl(TABS[activeTab].uid);
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

        {/* ── top bar ── */}
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
            {currentUrl}
          </span>
        </div>

        {/* ── tab bar ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 2, flexShrink: 0,
          padding: "0 16px",
          background: "var(--bg2)", borderBottom: "1px solid var(--border)",
        }}>
          {TABS.map((tab, i) => {
            const active = i === activeTab;
            return (
              <button
                key={tab.uid}
                onClick={() => setActiveTab(i)}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: "none",
                  borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                  color: active ? "var(--accent)" : "var(--color-text-muted)",
                  fontFamily: "var(--font)",
                  fontSize: "var(--font-size-xs)",
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                  transition: "color 0.15s, border-color 0.15s",
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── dashboard webview ── */}
        <webview
          ref={webviewRef}
          src={currentUrl}
          style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
        />
      </div>
    );
  }

  /* ── error: show message with retry ── */
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100%", background: "var(--color-bg)",
    }}>
      <div style={{ width: 380, textAlign: "center" }}>
        <Card elevated>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📈</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
              Metrics Dashboard
            </div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
              Could not connect to Grafana
            </div>
          </div>
          {error && <Badge variant="danger" style={{ marginBottom: 16 }}>{error}</Badge>}
          <Button variant="primary" loading={busy} disabled={busy} onClick={authenticate}>
            {busy ? "Connecting…" : "Retry"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
