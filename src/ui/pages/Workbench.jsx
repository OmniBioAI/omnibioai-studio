import React, { useState, useEffect } from "react";

const WORKBENCH_URL = "http://localhost:8000";
const WORKBENCH_LOGIN = "http://localhost:8000/accounts/login/";

export default function Workbench() {
  const [online,   setOnline]   = useState(false);
  const [checking, setChecking] = useState(true);

  const check = async () => {
    setChecking(true);
    try {
      await fetch(WORKBENCH_URL, { mode:"no-cors", cache:"no-cache" });
      setOnline(true);
    } catch (_) {
      setOnline(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, []);

  const open = (url) => window.open(url, "_blank");

  const launch = () => {
    if (window.api?.openWorkbench) window.api.openWorkbench();
    else open(WORKBENCH_LOGIN);
  };

  const QUICK_LINKS = [
    {
      label:   "OnboardAI",
      desc:    "AI-powered developer tools",
      url:     `${WORKBENCH_URL}/plugins/onboardai/`,
      icon:    "🤖",
      color:   "var(--accent)",
    },
    {
      label:   "Control Center",
      desc:    "System orchestration",
      url:     "http://localhost:7070",
      icon:    "🎛",
      color:   "var(--accent2)",
    },
    {
      label:   "LIMS",
      desc:    "Lab information system",
      url:     "http://localhost:7000",
      icon:    "🧪",
      color:   "var(--accent3)",
    },
    {
      label:   "Tutorials",
      desc:    "Coming soon",
      url:     null,
      icon:    "📚",
      color:   "var(--muted)",
    },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Header */}
      <div>
        <div style={{ fontSize:20, fontWeight:700, color:"#fff", letterSpacing:"-0.01em", marginBottom:3 }}>
          Workbench
        </div>
        <div style={{ fontSize:12, color:"var(--muted)", fontFamily:"var(--mono)" }}>
          OmniBioAI workflow and analysis platform
        </div>
      </div>

      {/* Main launch card */}
      <div style={{
        background:"var(--bg3)", border:"1px solid var(--border)",
        borderRadius:12, padding:32,
        display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        gap:20, minHeight:280,
      }}>
        {/* Hex logo */}
        <div style={{
          width:72, height:72,
          background:"linear-gradient(135deg, #00e5a0, #0094ff)",
          clipPath:"polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
        }} />

        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:18, fontWeight:700, color:"#fff", marginBottom:6 }}>
            OmniBioAI Workbench
          </div>
          <div style={{ fontSize:12, fontFamily:"var(--mono)", color:"var(--muted)", marginBottom:8 }}>
            {WORKBENCH_URL}
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <div style={{
              width:7, height:7, borderRadius:"50%",
              background: checking ? "var(--warn)" : online ? "var(--accent)" : "var(--danger)",
              animation: (checking || online) ? "pulse 2s infinite" : "none",
            }} />
            <span style={{
              fontSize:11, fontFamily:"var(--mono)",
              color: checking ? "var(--warn)" : online ? "var(--accent)" : "var(--danger)",
            }}>
              {checking ? "Checking..." : online ? "Online — ready to launch" : "Offline — start the stack first"}
            </span>
          </div>
        </div>

        <button
          onClick={launch}
          disabled={!online}
          style={{
            padding:"14px 48px", borderRadius:8, fontSize:14,
            fontFamily:"var(--font)", fontWeight:600,
            cursor: online ? "pointer" : "not-allowed",
            opacity: online ? 1 : 0.4,
            background: online ? "var(--accent)" : "var(--bg2)",
            border: online ? "none" : "1px solid var(--border2)",
            color: online ? "#000" : "var(--muted)",
            transition:"all 0.2s", letterSpacing:"0.02em",
          }}
        >
          {online ? "↗ Launch Workbench" : "Workbench Offline"}
        </button>

        {!online && (
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={check} style={{
              padding:"7px 16px", borderRadius:6, fontSize:11,
              fontFamily:"var(--mono)", background:"var(--bg2)",
              border:"1px solid var(--border2)", color:"var(--muted)", cursor:"pointer",
            }}>↻ Check again</button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("navigate", { detail:4 }))}
              style={{
                padding:"7px 16px", borderRadius:6, fontSize:11,
                fontFamily:"var(--mono)", background:"rgba(0,229,160,0.08)",
                border:"1px solid rgba(0,229,160,0.2)",
                color:"var(--accent)", cursor:"pointer",
              }}>Go to Launch →</button>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
        {QUICK_LINKS.map(({ label, desc, url, icon, color }) => {
          const disabled = !online || !url;
          return (
            <button
              key={label}
              onClick={() => url && open(url)}
              disabled={disabled}
              style={{
                padding:"18px 10px", borderRadius:8,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.4 : 1,
                background:"var(--bg3)",
                border:"1px solid var(--border)",
                transition:"all 0.15s",
                display:"flex", flexDirection:"column",
                alignItems:"center", gap:8,
              }}
              onMouseEnter={e => {
                if (!disabled) {
                  e.currentTarget.style.borderColor = color;
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.background = "var(--bg3)";
              }}
            >
              <span style={{ fontSize:24 }}>{icon}</span>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:12, fontWeight:500, color: disabled ? "var(--muted)" : color, marginBottom:2 }}>
                  {label}
                </div>
                <div style={{ fontSize:10, fontFamily:"var(--mono)", color:"var(--muted)" }}>
                  {desc}
                </div>
              </div>
              {!url && (
                <span style={{
                  fontSize:9, fontFamily:"var(--mono)",
                  padding:"2px 6px", borderRadius:3,
                  background:"rgba(255,255,255,0.06)",
                  color:"var(--muted)",
                }}>COMING SOON</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
