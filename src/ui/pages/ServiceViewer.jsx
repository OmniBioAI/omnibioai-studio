import React from "react";

export default function ServiceViewer({ url, label, onBack }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>

      {/* Toolbar */}
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
          color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {label}
        </span>
        <span style={{
          marginLeft: "auto",
          fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)",
          color: "var(--border2)", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {url}
        </span>
      </div>

      {/* Embedded service page */}
      <webview
        src={url}
        style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
      />
    </div>
  );
}
