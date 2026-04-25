import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import Mode   from "./pages/Mode";
import LLM    from "./pages/LLM";
import Cloud  from "./pages/Cloud";
import HPC    from "./pages/HPC";
import Launch from "./pages/Launch";

const STEPS = ["Mode", "LLM", "Cloud", "HPC", "Launch"];

export default function App() {
  const [step, setStep] = useState(0);
  const [systemStatus, setSystemStatus] = useState("idle");

  const [config, setConfig] = useState({
    mode: "local",
    llm:   {},
    cloud: {},
    hpc:   {},
  });

  const pages = [
    <Mode   config={config} setConfig={setConfig} />,
    <LLM    config={config} setConfig={setConfig} />,
    <Cloud  config={config} setConfig={setConfig} />,
    <HPC    config={config} setConfig={setConfig} />,
    <Launch config={config} onStatusChange={setSystemStatus} />,
  ];

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font)",
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <Sidebar step={step} setStep={setStep} systemStatus={systemStatus} />

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Topbar */}
        <div
          style={{
            height: 48,
            background: "var(--bg2)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--mono)",
              color: "var(--muted)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            studio /{" "}
            <span style={{ color: "var(--text)" }}>
              {STEPS[step].toLowerCase()}
            </span>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {[
              { label: "v0.1.0", bg: "rgba(0,148,255,0.12)", color: "#0094ff", border: "rgba(0,148,255,0.2)" },
              { label: "BETA",   bg: "rgba(255,107,53,0.12)", color: "#ff6b35", border: "rgba(255,107,53,0.2)" },
            ].map(({ label, bg, color, border }) => (
              <span
                key={label}
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  padding: "3px 8px",
                  borderRadius: 4,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: bg,
                  color,
                  border: `1px solid ${border}`,
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Page content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 20,
            scrollbarWidth: "thin",
            scrollbarColor: "var(--border2) transparent",
          }}
        >
          {pages[step]}
        </div>

        {/* Wizard Nav */}
        <div
          style={{
            height: 52,
            background: "var(--bg2)",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: 10,
            flexShrink: 0,
          }}
        >
          {/* Step pips */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
            {STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 24,
                  height: 3,
                  borderRadius: 2,
                  background:
                    i < step
                      ? "var(--accent)"
                      : i === step
                      ? "var(--accent2)"
                      : "var(--border2)",
                  transition: "background 0.2s",
                }}
              />
            ))}
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--muted)",
                marginLeft: 8,
              }}
            >
              Step {step + 1} of {STEPS.length} — {STEPS[step]}
            </span>
          </div>

          {/* Controls */}
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{
              padding: "7px 16px",
              borderRadius: 6,
              fontSize: 11,
              fontFamily: "var(--font)",
              fontWeight: 500,
              cursor: step === 0 ? "not-allowed" : "pointer",
              opacity: step === 0 ? 0.4 : 1,
              background: "transparent",
              border: "1px solid var(--border2)",
              color: "var(--muted)",
              transition: "all 0.15s",
            }}
          >
            Back
          </button>

          <button
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={step === STEPS.length - 1}
            style={{
              padding: "7px 16px",
              borderRadius: 6,
              fontSize: 11,
              fontFamily: "var(--font)",
              fontWeight: 500,
              cursor: step === STEPS.length - 1 ? "not-allowed" : "pointer",
              opacity: step === STEPS.length - 1 ? 0.4 : 1,
              background: "var(--accent)",
              border: "none",
              color: "#000",
              transition: "all 0.15s",
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}