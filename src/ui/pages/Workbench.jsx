import React, { useState, useEffect, useRef } from "react";

const WORKBENCH_URL = "http://localhost:8000";

export default function Workbench() {
  const [status, setStatus]   = useState("checking"); // checking | ready | offline
  const [reload,  setReload]  = useState(0);
  const iframeRef = useRef(null);

  // Check if workbench is reachable
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(WORKBENCH_URL, {
          method: "GET", mode: "no-cors", cache: "no-cache",
        });
        setStatus("ready");
      } catch (_) {
        setStatus("offline");
      }
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, [reload]);

  const openExternal = () => {
    if (window.api?.openWorkbench) {
      window.api.openWorkbench();
    } else {
      window.open(WORKBENCH_URL, "_blank");
    }
  };

  return (
    <div style={{
      display:"flex", flexDirection:"column",
      height:"100%", gap:0, margin:-20,
    }}>

      {/* Workbench toolbar */}
      <div style={{
        height:40, background:"var(--bg2)",
        borderBottom:"1px solid var(--border)",
        display:"flex", alignItems:"center",
        padding:"0 16px", gap:10, flexShrink:0,
      }}>
        {/* Status indicator */}
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{
            width:7, height:7, borderRadius:"50%",
            background: status === "ready"    ? "var(--accent)"
                      : status === "offline"  ? "var(--danger)"
                      : "var(--warn)",
            animation: status === "checking" ? "pulse 1.5s infinite" : "none",
          }} />
          <span style={{ fontSize:11, fontFamily:"var(--mono)", color:"var(--muted)" }}>
            {status === "ready"   ? "Workbench connected"
           : status === "offline" ? "Workbench offline — start the stack first"
           : "Connecting..."}
          </span>
        </div>

        {/* URL bar */}
        <div style={{
          flex:1, background:"var(--bg3)",
          border:"1px solid var(--border)",
          borderRadius:5, padding:"4px 10px",
          fontSize:11, fontFamily:"var(--mono)",
          color:"var(--muted)",
        }}>
          {WORKBENCH_URL}
        </div>

        {/* Actions */}
        <div style={{ display:"flex", gap:6 }}>
          <button
            onClick={() => { setStatus("checking"); setReload(r => r+1); }}
            title="Reload"
            style={{
              padding:"4px 10px", borderRadius:5, fontSize:11,
              fontFamily:"var(--mono)", background:"var(--bg3)",
              border:"1px solid var(--border2)", color:"var(--muted)",
              cursor:"pointer",
            }}
          >↻ Reload</button>

          <button
            onClick={openExternal}
            title="Open in browser"
            style={{
              padding:"4px 10px", borderRadius:5, fontSize:11,
              fontFamily:"var(--mono)", background:"var(--bg3)",
              border:"1px solid var(--border2)", color:"var(--muted)",
              cursor:"pointer",
            }}
          >↗ Browser</button>
        </div>
      </div>

      {/* Iframe or offline state */}
      {status === "offline" ? (
        <div style={{
          flex:1, display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          background:"var(--bg)", gap:16,
        }}>
          <div style={{
            width:60, height:60,
            background:"rgba(255,71,87,0.1)",
            border:"1px solid rgba(255,71,87,0.2)",
            borderRadius:16,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:28,
          }}>⚠</div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:16, fontWeight:600, color:"#fff", marginBottom:6 }}>
              Workbench Offline
            </div>
            <div style={{ fontSize:12, fontFamily:"var(--mono)", color:"var(--muted)", marginBottom:20 }}>
              The workbench service is not running at {WORKBENCH_URL}
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
              <button
                onClick={() => { setStatus("checking"); setReload(r => r+1); }}
                style={{
                  padding:"8px 18px", borderRadius:6, fontSize:12,
                  fontFamily:"var(--font)", fontWeight:500,
                  background:"var(--bg3)", border:"1px solid var(--border2)",
                  color:"var(--muted)", cursor:"pointer",
                }}
              >↻ Retry</button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("navigate", { detail: 4 }))}
                style={{
                  padding:"8px 18px", borderRadius:6, fontSize:12,
                  fontFamily:"var(--font)", fontWeight:500,
                  background:"var(--accent)", border:"none",
                  color:"#000", cursor:"pointer",
                }}
              >Go to Launch →</button>
            </div>
          </div>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          key={reload}
          src={WORKBENCH_URL}
          style={{
            flex:1, border:"none", width:"100%",
            background:"var(--bg)",
            opacity: status === "ready" ? 1 : 0.3,
            transition:"opacity 0.3s",
          }}
          title="OmniBioAI Workbench"
          allow="clipboard-read; clipboard-write"
        />
      )}
    </div>
  );
}
