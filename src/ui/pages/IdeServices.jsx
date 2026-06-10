import React, { useState, useEffect, useCallback } from "react";

function JupyterIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="17" r="9" fill="#F37726" />
      <circle cx="16" cy="5.5" r="2.5" fill="#9B9B9B" />
      <circle cx="25.3" cy="23.5" r="2.5" fill="#9B9B9B" />
      <circle cx="6.7" cy="23.5" r="2.5" fill="#9B9B9B" />
    </svg>
  );
}

function RStudioIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14" fill="#276DC3" />
      <text x="16" y="22" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold" fontFamily="Arial, sans-serif">R</text>
    </svg>
  );
}

function VSCodeIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 19.841V4.16a1.5 1.5 0 0 0-.85-1.573zM16.883 17.68l-7.853-6.518 7.853-6.518v13.036z" fill="#007ACC" />
    </svg>
  );
}

const IDE_SERVICES = [
  {
    tool:   "jupyter",
    label:  "Jupyter",
    port:   8888,
    accent: "#F37726",
    desc:   "Interactive notebooks with full bioinformatics stack",
    Icon:   JupyterIcon,
  },
  {
    tool:   "rstudio",
    label:  "RStudio",
    port:   8787,
    accent: "#276DC3",
    desc:   "R + Bioconductor — Seurat, DESeq2, scran, monocle3",
    Icon:   RStudioIcon,
  },
  {
    tool:   "vscode",
    label:  "VS Code",
    port:   8083,
    accent: "#007ACC",
    desc:   "Python + R + Nextflow + WDL extensions",
    Icon:   VSCodeIcon,
  },
];

function getHostIp() {
  return (
    window.__OMNIBIOAI_CONFIG__?.hostIp ||
    localStorage.getItem("omnibioai_host_ip") ||
    "192.168.86.234"
  );
}

function launcherUrl(path) {
  return `http://${getHostIp()}:5190${path}`;
}

function StatusBadge({ status }) {
  if (status === "running") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)",
        padding: "3px 8px", borderRadius: "var(--radius-xs)",
        background: "rgba(0,229,160,0.12)",
        color: "var(--accent)",
        border: "1px solid rgba(0,229,160,0.25)",
        letterSpacing: "0.06em",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
        RUNNING
      </span>
    );
  }
  if (status === "starting") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)",
        padding: "3px 8px", borderRadius: "var(--radius-xs)",
        background: "rgba(255,165,2,0.12)",
        color: "var(--color-warning)",
        border: "1px solid rgba(255,165,2,0.25)",
        letterSpacing: "0.06em",
      }}>
        <span style={{
          width: 10, height: 10, borderRadius: "50%",
          border: "2px solid rgba(255,165,2,0.3)",
          borderTop: "2px solid var(--color-warning)",
          animation: "ide-spin 0.8s linear infinite", flexShrink: 0,
        }} />
        STARTING
      </span>
    );
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)",
      padding: "3px 8px", borderRadius: "var(--radius-xs)",
      background: "rgba(255,255,255,0.04)",
      color: "var(--color-text-muted)",
      border: "1px solid var(--border2)",
      letterSpacing: "0.06em",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-text-muted)", flexShrink: 0 }} />
      STOPPED
    </span>
  );
}

function IdeCard({ svc, status, onOpen }) {
  const { label, port, accent, desc, Icon } = svc;
  const isRunning  = status === "running";
  const isStarting = status === "starting";

  return (
    <div style={{
      background: "var(--bg3)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />

      <div style={{ padding: "16px 18px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flexShrink: 0 }}><Icon /></div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
                {label}
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)", color: "var(--color-text-muted)", marginTop: 2 }}>
                :{port}
              </div>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>

        <div style={{
          fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)",
          lineHeight: 1.6, flex: 1, marginBottom: 16,
        }}>
          {desc}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isRunning && (
            <button
              onClick={onOpen}
              style={{
                padding: "7px 16px", borderRadius: "var(--radius-sm)",
                fontSize: "var(--font-size-xs)", fontFamily: "var(--font)", fontWeight: 600,
                background: accent, border: "none", color: "#fff", cursor: "pointer",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              Open →
            </button>
          )}

          {isStarting && (
            <button
              disabled
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 16px", borderRadius: "var(--radius-sm)",
                fontSize: "var(--font-size-xs)", fontFamily: "var(--font)", fontWeight: 500,
                background: "rgba(255,165,2,0.08)",
                border: "1px solid rgba(255,165,2,0.2)",
                color: "var(--color-warning)", cursor: "not-allowed", opacity: 0.7,
              }}
            >
              <span style={{
                width: 10, height: 10, borderRadius: "50%",
                border: "2px solid rgba(255,165,2,0.3)",
                borderTop: "2px solid var(--color-warning)",
                animation: "ide-spin 0.8s linear infinite", flexShrink: 0,
              }} />
              Starting...
            </button>
          )}

          {!isRunning && !isStarting && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button
                disabled
                style={{
                  padding: "7px 16px", borderRadius: "var(--radius-sm)",
                  fontSize: "var(--font-size-xs)", fontFamily: "var(--font)", fontWeight: 500,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--border2)",
                  color: "var(--color-text-muted)", cursor: "not-allowed", opacity: 0.5,
                }}
              >
                Stopped — start from Services
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IdeServices() {
  const [statuses, setStatuses] = useState(() =>
    Object.fromEntries(IDE_SERVICES.map(s => [s.tool, "unknown"]))
  );

  const fetchStatus = useCallback(async (tool) => {
    try {
      const res = await fetch(launcherUrl(`/api/launcher/status/${tool}/`), {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) { setStatuses(s => ({ ...s, [tool]: "stopped" })); return; }
      const data = await res.json();
      const raw = (data?.status || "stopped").toLowerCase();
      const mapped = raw === "running" ? "running" : raw === "starting" ? "starting" : "stopped";
      setStatuses(s => ({ ...s, [tool]: mapped }));
    } catch (_) {
      setStatuses(s => ({ ...s, [tool]: "stopped" }));
    }
  }, []);

  const pollAll = useCallback(() => {
    IDE_SERVICES.forEach(s => fetchStatus(s.tool));
  }, [fetchStatus]);

  useEffect(() => {
    pollAll();
    const id = setInterval(pollAll, 5000);
    return () => clearInterval(id);
  }, [pollAll]);

  const handleOpen = (port) => {
    window.open(`http://${getHostIp()}:${port}`, "_blank");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`@keyframes ide-spin { 100% { transform: rotate(360deg); } }`}</style>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", marginBottom: 3 }}>
            IDE Services
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", fontFamily: "var(--mono)" }}>
            browser-based development environments — managed via launcher :5190
          </div>
        </div>
        <button
          onClick={pollAll}
          style={{
            padding: "5px 12px", borderRadius: 5, fontSize: "var(--font-size-xs)",
            fontFamily: "var(--mono)", background: "var(--bg3)",
            border: "1px solid var(--border2)", color: "var(--color-text-muted)", cursor: "pointer",
          }}
        >
          ↻ Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {IDE_SERVICES.map(svc => (
          <IdeCard
            key={svc.tool}
            svc={svc}
            status={statuses[svc.tool]}
            onOpen={() => handleOpen(svc.port)}
          />
        ))}
      </div>
    </div>
  );
}
