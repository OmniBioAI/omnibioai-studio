import React from "react";

const statusColor = {
  idle:     "var(--color-text-muted)",
  starting: "var(--color-warning)",
  running:  "var(--accent)",
  error:    "var(--color-danger)",
};

const statusLabel = {
  idle:     "IDLE",
  starting: "STARTING",
  running:  "RUNNING",
  error:    "ERROR",
};

export default function Sidebar({ nav, step, setStep, systemStatus, isServiceView, onStudioClick }) {
  return (
    <div style={{
      width:200, background:"var(--bg2)",
      borderRight:"1px solid var(--border)",
      display:"flex", flexDirection:"column", flexShrink:0,
    }}>
      {/* Logo */}
      <div style={{ padding:"18px 16px 14px", borderBottom:"1px solid var(--border)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
          <div style={{
            width:24, height:24, flexShrink:0,
            background:"linear-gradient(135deg, var(--accent), #0094ff)",
            clipPath:"polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
          }} />
          <span style={{ fontSize:'var(--font-size-base)', fontWeight:700, letterSpacing:"0.04em", color:"#fff" }}>
            OmniBioAI
          </span>
        </div>
        <div style={{
          fontSize:'var(--font-size-xs)', color:"var(--color-text-muted)", fontFamily:"var(--mono)",
          letterSpacing:"0.06em", paddingLeft:32,
        }}>
          STUDIO v0.4.0
        </div>
      </div>

      {/* ← Studio back button — visible when browsing a service */}
      {isServiceView && (
        <div style={{ padding:"8px 8px 0" }}>
          <div
            onClick={onStudioClick}
            style={{
              display:"flex", alignItems:"center", gap:8,
              padding:"8px 10px", borderRadius:'var(--radius-sm)', cursor:"pointer",
              fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", fontWeight:600,
              color:"var(--accent)",
              background:"rgba(0,229,160,0.08)",
              border:"1px solid rgba(0,229,160,0.2)",
            }}
          >
            ← Studio
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ padding:"12px 8px", flex:1, overflowY:"auto" }}>
        {nav.map(({ section, items }) => (
          <div key={section}>
            <div style={{
              fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)",
              letterSpacing:"0.12em", textTransform:"uppercase",
              padding:"8px 8px 4px", marginTop:8,
            }}>
              {section}
            </div>
            {items.map(({ name, idx }) => {
              const isActive = step === idx;
              return (
                <div
                  key={name}
                  onClick={() => setStep(idx)}
                  style={{
                    display:"flex", alignItems:"center", gap:8,
                    padding:"7px 8px", borderRadius:'var(--radius-sm)', cursor:"pointer",
                    fontSize:'var(--font-size-sm)', marginBottom:1, position:"relative",
                    transition:"all 0.15s",
                    color:      isActive ? "var(--accent)" : "var(--color-text-muted)",
                    background: isActive ? "rgba(0,229,160,0.08)" : "transparent",
                    border:     isActive ? "1px solid rgba(0,229,160,0.15)" : "1px solid transparent",
                  }}
                >
                  {isActive && (
                    <div style={{
                      position:"absolute", left:0, top:"50%",
                      transform:"translateY(-50%)",
                      width:2, height:16, background:"var(--accent)", borderRadius:'var(--radius-xs)',
                    }} />
                  )}
                  <div style={{
                    width:6, height:6, borderRadius:"50%",
                    background:"currentColor", opacity: isActive ? 1 : 0.4, flexShrink:0,
                  }} />
                  {name}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* System status */}
      <div style={{ padding:"12px 16px", borderTop:"1px solid var(--border)" }}>
        <div style={{
          display:"flex", alignItems:"center", gap:6,
          fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)",
          color: statusColor[systemStatus] || "var(--color-text-muted)",
        }}>
          <div style={{
            width:6, height:6, borderRadius:"50%",
            background: statusColor[systemStatus] || "var(--color-text-muted)",
            animation: systemStatus === "running" ? "pulse 2s infinite" : "none",
          }} />
          {statusLabel[systemStatus] || "IDLE"}
        </div>
      </div>
    </div>
  );
}
