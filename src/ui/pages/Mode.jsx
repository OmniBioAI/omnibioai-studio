import React from "react";
import { Panel, PanelHeader, PanelBody, HealthCard } from "../components/UI";

const MODES = [
  {
    id: "beta",
    title: "Beta Cloud",
    desc: "Connects to app.omnibioai.org\nNo local docker needed",
  },
  {
    id: "local",
    title: "Local",
    desc: "Docker + local GPU/CPU\nOffline-first, Ollama support",
    disabled: true,
    tooltip: "Available in future release",
  },
  {
    id: "hpc",
    title: "HPC",
    desc: "Slurm / PBS / LSF\nApptainer + remote execution",
    disabled: true,
    tooltip: "Available in future release",
  },
  {
    id: "cloud",
    title: "Cloud",
    desc: "AWS Batch / Azure Batch\nElastic auto-scaling compute",
    disabled: true,
    tooltip: "Available in future release",
  },
  {
    id: "hybrid",
    title: "Hybrid",
    desc: "Multi-backend orchestration\nPolicy-driven scheduling",
    disabled: true,
    tooltip: "Available in future release",
  },
];

const HEALTH = [
  { label: "MySQL",    status: "up",   port: ":3306"  },
  { label: "Redis",    status: "up",   port: ":6379"  },
  { label: "TES",      status: "up",   port: ":8081"  },
  { label: "Ollama",   status: "warn", port: ":11434" },
  { label: "RAG",      status: "down", port: ":8500"  },
];

export default function Mode({ config, setConfig }) {
  const selected = config.mode;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", marginBottom: 3 }}>
          Runtime Mode
        </div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: "var(--color-text-muted)", fontFamily: "var(--mono)" }}>
          select execution backend for workflow orchestration
        </div>
      </div>

      {/* Mode Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 14,
        }}
      >
        {MODES.map((m) => {
          const isSelected = selected === m.id;
          const isDisabled = !!m.disabled;
          return (
            <div
              key={m.id}
              onClick={() => !isDisabled && setConfig((p) => ({ ...p, mode: m.id }))}
              title={isDisabled ? m.tooltip : undefined}
              style={{
                background: isSelected ? "rgba(0,229,160,0.04)" : "var(--bg2)",
                border: isSelected
                  ? "1px solid rgba(0,229,160,0.4)"
                  : "1px solid var(--border)",
                borderRadius: 'var(--radius)',
                padding: "10px 12px",
                cursor: isDisabled ? "not-allowed" : "pointer",
                opacity: isDisabled ? 0.45 : 1,
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
                  {isDisabled && (
                    <span style={{ fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)", marginLeft:6 }}>
                      (coming soon)
                    </span>
                  )}
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
            </div>
          );
        })}
      </div>

      {/* Health Grid */}
      <Panel>
        <PanelHeader title="Service Health" icon iconColor="teal">
          <span style={{ fontSize: 'var(--font-size-xs)', fontFamily: "var(--mono)", color: "var(--color-text-muted)" }}>
            last check: 2s ago
          </span>
        </PanelHeader>
        <PanelBody style={{ padding: "10px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
            {HEALTH.map((h) => (
              <HealthCard key={h.label} {...h} />
            ))}
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
