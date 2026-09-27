import React from "react";

// Shared contextual shell for native Studio pages opened from the Studio portal.
// Keep this treatment aligned with ServiceViewer so native and embedded
// Native destinations provide the same clear way home.
export default function WorkbenchModuleHeader({ title, onBack }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      margin: "-20px -20px 20px", padding: "8px 16px",
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
        ← Back to Studio
      </button>
      <span style={{
        fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)",
        color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {title}
      </span>
    </div>
  );
}
