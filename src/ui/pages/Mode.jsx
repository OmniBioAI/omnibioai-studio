import React, { useCallback, useEffect, useState } from "react";
import { Panel, PanelHeader, PanelBody, HealthCard } from "../components/UI";
import RequirePermission from "../components/RequirePermission";
import PageHeader from "../components/PageHeader";
import { getServiceHealth, refreshServiceHealth, useServiceHealth } from "../lib/serviceHealth";

const MANAGE_CONFIG = "manage_config";

const MODES = [
  {
    id: "beta",
    title: "Beta Cloud",
    desc: "Connects to webstudio.omnibioai.org\nNo local docker needed",
  },
];

const MODE_SERVICES = [
  { key: "mysql", label: "MySQL", port: ":3306" },
  { key: "redis", label: "Redis", port: ":6379" },
  { key: "tes", label: "TES", port: ":8081" },
  { key: "ollama", label: "Ollama", port: ":11434" },
  { key: "rag", label: "RAG", port: ":8090" },
];

export default function Mode({ config, setConfig, currentUser }) {
  return (
    <RequirePermission
      currentUser={currentUser}
      permission={MANAGE_CONFIG}
      description="Mode configuration requires an authenticated OmniBioAI account."
    >
      <ModeConsole config={config} setConfig={setConfig} />
    </RequirePermission>
  );
}

function ModeConsole({ config, setConfig }) {
  const health = useServiceHealth();
  const [lastCheck, setLastCheck] = useState("never");
  const selected = config.mode;
  const refreshHealth = useCallback(async () => {
    await refreshServiceHealth(MODE_SERVICES.map(service => service.key));
    setLastCheck(new Date().toTimeString().slice(0, 8));
  }, []);
  useEffect(() => {
    refreshHealth();
    const id = setInterval(refreshHealth, 5000);
    return () => clearInterval(id);
  }, [refreshHealth]);
  const selectMode = (modeId) => setConfig((previous) => ({ ...previous, mode: modeId }));
  const onModeKeyDown = (event) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const available = MODES;
    if (!available.length) return;
    const current = Math.max(0, available.findIndex(mode => mode.id === selected));
    const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1
      : (current + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + available.length) % available.length;
    const target = document.getElementById(`runtime-mode-${available[next].id}`);
    target?.focus();
    selectMode(available[next].id);
  };

  return (
    <div>
      <PageHeader title="Runtime Mode" description="select execution backend for workflow orchestration" />

      {/* Mode Cards */}
      <div
        className="studio-mode-grid"
        role="radiogroup"
        aria-label="Runtime mode"
        onKeyDown={onModeKeyDown}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 14,
        }}
      >
        {MODES.map((m) => {
          const isSelected = selected === m.id;
          return (
            <button
              key={m.id}
              id={`runtime-mode-${m.id}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={selected !== m.id && MODES.some(mode => mode.id === selected) ? -1 : 0}
              onClick={() => selectMode(m.id)}
              style={{
                width: "100%", textAlign: "left", fontFamily: "inherit",
                background: isSelected ? "rgba(0,229,160,0.04)" : "var(--bg2)",
                border: isSelected
                  ? "1px solid rgba(0,229,160,0.4)"
                  : "1px solid var(--border)",
                borderRadius: 'var(--radius)',
                padding: "10px 12px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <div
                style={{
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 500,
                  color: isSelected ? "var(--accent)" : "var(--text)",
                  marginBottom: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>
                  {m.title}
                </span>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    border: isSelected ? "none" : "1px solid var(--color-text-muted)",
                    background: isSelected ? "var(--accent)" : "transparent",
                    transition: "all 0.15s",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  fontFamily: "var(--mono)",
                  color: "var(--color-text-muted)",
                  lineHeight: 1.6,
                  whiteSpace: "pre-line",
                }}
              >
                {m.desc}
              </div>
            </button>
          );
        })}
      </div>

      {/* Health Grid */}
      <Panel>
        <PanelHeader title="Service Health" icon iconColor="teal">
          <span style={{ fontSize: 'var(--font-size-xs)', fontFamily: "var(--mono)", color: "var(--color-text-muted)" }}>
            last check: {lastCheck}
          </span>
        </PanelHeader>
        <PanelBody style={{ padding: "10px 16px" }}>
          <div className="studio-health-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
            {MODE_SERVICES.map((service) => {
              const record = health[service.key] || getServiceHealth(service.key);
              return <HealthCard key={service.key} {...service} status={record.state} reason={record.reason} />;
            })}
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
