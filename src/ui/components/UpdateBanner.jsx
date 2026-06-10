import React, { useState, useEffect } from "react";

export default function UpdateBanner() {
  const [update, setUpdate] = useState(null); // { version } | null
  const [error, setError]   = useState(null); // { message } | null

  useEffect(() => {
    if (!window.api?.onUpdateAvailable) return;

    window.api.onUpdateAvailable((info) => setUpdate(info));
    window.api.onUpdateError((info) => setError(info));
  }, []);

  if (!update && !error) return null;

  const isError = !!error;
  const bg      = isError ? "rgba(255,71,87,0.12)"   : "rgba(0,148,255,0.10)";
  const border  = isError ? "rgba(255,71,87,0.3)"    : "rgba(0,148,255,0.25)";
  const color   = isError ? "var(--danger)"           : "var(--accent2)";
  const text    = isError
    ? `Update failed: ${error.message}`
    : `\u{1F504} OmniBioAI Studio v${update.version} is available — downloading…`;

  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      color,
      fontFamily: "var(--mono)",
      fontSize: "var(--font-size-xs)",
      padding: "5px 16px",
      textAlign: "center",
      flexShrink: 0,
      letterSpacing: "0.03em",
    }}>
      {text}
      {isError && (
        <button
          onClick={() => setError(null)}
          style={{
            marginLeft: 12,
            background: "transparent",
            border: "none",
            color,
            cursor: "pointer",
            fontSize: "var(--font-size-xs)",
            fontFamily: "var(--mono)",
          }}
        >
          dismiss
        </button>
      )}
    </div>
  );
}
