import React from "react";

const navItems = [
  { section: "Setup", items: ["Mode", "LLM", "Cloud", "HPC"] },
  { section: "Runtime", items: ["Launch"] },
];

export default function Sidebar({ step, setStep, systemStatus }) {
  const allItems = ["Mode", "LLM", "Cloud", "HPC", "Launch"];

  const statusLabel = {
    idle: "IDLE",
    starting: "STARTING",
    running: "RUNNING",
    error: "ERROR",
  };

  const statusColor = {
    idle: "#6b7280",
    starting: "#ffa502",
    running: "#00e5a0",
    error: "#ff4757",
  };

  return (
    <div
      style={{
        width: 200,
        background: "var(--bg2)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "18px 16px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <div
            style={{
              width: 24,
              height: 24,
              background: "linear-gradient(135deg, #00e5a0, #0094ff)",
              clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "#fff",
            }}
          >
            OmniBioAI
          </span>
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--muted)",
            fontFamily: "var(--mono)",
            letterSpacing: "0.06em",
            paddingLeft: 32,
          }}
        >
          STUDIO v0.1.0
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "12px 8px", flex: 1 }}>
        {navItems.map(({ section, items }) => (
          <div key={section}>
            <div
              style={{
                fontSize: 9,
                fontFamily: "var(--mono)",
                color: "var(--muted)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "8px 8px 4px",
                marginTop: 8,
              }}
            >
              {section}
            </div>
            {items.map((name) => {
              const idx = allItems.indexOf(name);
              const isActive = step === idx;
              return (
                <div
                  key={name}
                  onClick={() => setStep(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 8px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 12,
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    background: isActive ? "rgba(0,229,160,0.08)" : "transparent",
                    border: isActive
                      ? "1px solid rgba(0,229,160,0.15)"
                      : "1px solid transparent",
                    marginBottom: 1,
                    position: "relative",
                    transition: "all 0.15s",
                  }}
                >
                  {isActive && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 2,
                        height: 16,
                        background: "var(--accent)",
                        borderRadius: 2,
                      }}
                    />
                  )}
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "currentColor",
                      opacity: isActive ? 1 : 0.4,
                      flexShrink: 0,
                    }}
                  />
                  {name}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Status */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            fontFamily: "var(--mono)",
            color: statusColor[systemStatus] || "var(--muted)",
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: statusColor[systemStatus] || "var(--muted)",
              animation: systemStatus === "running" ? "pulse 2s infinite" : "none",
            }}
          />
          {statusLabel[systemStatus] || "IDLE"}
        </div>
      </div>
    </div>
  );
}