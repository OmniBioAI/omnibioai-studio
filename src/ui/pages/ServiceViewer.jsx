import React, { useRef, useEffect } from "react";
import { isElectron } from "../lib/session";
import "./ServiceViewer.css";

export default function ServiceViewer({ url, label, onBack, backLabel = "Back to Studio" }) {
  const webviewRef = useRef(null);
  const electron = isElectron();
  const mobileFullScreen = label === "Workflows" || /Lit AI/i.test(label || "");

  useEffect(() => {
    if (!electron) return;
    const wv = webviewRef.current;
    if (!wv) return;
    const handler = (e) => {
      if (e.channel === 'open-external' && e.args?.[0]) {
        window.electronAPI.openExternal(e.args[0]);
      }
    };
    wv.addEventListener('ipc-message', handler);
    return () => wv.removeEventListener('ipc-message', handler);
  }, [electron]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        padding: "8px 16px",
        background: "var(--bg2)", borderBottom: "1px solid var(--border)",
      }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            minHeight: 44, padding: "8px 12px", borderRadius: "var(--radius-sm)",
            background: "var(--color-accent-surface)", border: "1px solid var(--color-accent-border)",
            color: "var(--accent)", fontFamily: "var(--font)", fontSize: "var(--font-size-xs)",
            fontWeight: 600, cursor: "pointer",
          }}
        >
          ← {backLabel}
        </button>
        <span className="service-viewer-label" style={{
          fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)",
          color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {label}
        </span>
        <span className="service-viewer-url" style={{
          marginLeft: "auto",
          fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)",
          color: "var(--border2)", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {url}
        </span>
        {mobileFullScreen && <a className="service-viewer-fullscreen" href={url} target="_blank" rel="noopener noreferrer">
          Open full screen
        </a>}
      </div>
      {electron ? (
        <webview
          ref={webviewRef}
          src={url}
          nodeintegration="true"
          style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
        />
      ) : (
        // <webview> is a Chromium/Electron-only element — in a real browser
        // tab (web build) it isn't a recognized custom element and renders
        // nothing, which is why service pages appeared blank there.
        <iframe
          src={url}
          title={label || url}
          style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
        />
      )}
    </div>
  );
}
