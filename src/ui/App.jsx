import React, { useState, useEffect } from "react";
import Sidebar   from "./components/Sidebar";
import Mode      from "./pages/Mode";
import LLM       from "./pages/LLM";
import Cloud     from "./pages/Cloud";
import HPC       from "./pages/HPC";
import Launch    from "./pages/Launch";
import Services  from "./pages/Services";
import Logs      from "./pages/Logs";
import Settings  from "./pages/Settings";
import Workbench from "./pages/Workbench";
import Jobs      from "./pages/Jobs";

const NAV = [
  { section: "Setup",   items: [
    { name:"Mode",      idx:0 },
    { name:"LLM",       idx:1 },
    { name:"Cloud",     idx:2 },
    { name:"HPC",       idx:3 },
  ]},
  { section: "Runtime", items: [
    { name:"Launch",    idx:4 },
    { name:"Services",  idx:5 },
    { name:"Logs",      idx:6 },
    { name:"Workbench", idx:7 },
    { name:"Jobs",      idx:9 },
  ]},
  { section: "System",  items: [
    { name:"Settings",  idx:8 },
  ]},
];

const WIZARD_STEPS = ["Mode","LLM","Cloud","HPC","Launch"];
const WIZARD_MAX   = 4;

const PAGE_NAMES = [
  "mode","llm","cloud","hpc","launch",
  "services","logs","workbench","settings","jobs"
];

export default function App() {
  const [step,         setStep]         = useState(0);
  const [systemStatus, setSystemStatus] = useState("idle");
  const [ready,        setReady]        = useState(false);
  const [config,       setConfig]       = useState({
    mode: "local", llm: {}, cloud: {}, hpc: {}, settings: {},
  });

  // ─── Load saved config + first-run detection ───────────
  useEffect(() => {
    const init = async () => {
      try {
        if (window.api?.loadConfig) {
          const saved = await window.api.loadConfig();
          if (saved) {
            setConfig(prev => ({ ...prev, ...saved }));
            // First run — no data_dir set → go to Settings
            if (!saved?.settings?.data_dir) {
              setStep(8);
            }
          } else {
            // No config at all → first run → Settings
            setStep(8);
          }
        }
      } catch (_) {
        // Dev mode — no Electron API, stay on Mode page
      } finally {
        setReady(true);
      }
    };
    init();
  }, []);

  // ─── Listen for navigate events (from Workbench page) ──
  useEffect(() => {
    const handler = (e) => setStep(e.detail);
    window.addEventListener("navigate", handler);
    return () => window.removeEventListener("navigate", handler);
  }, []);

  const pages = [
    <Mode      config={config} setConfig={setConfig} />,
    <LLM       config={config} setConfig={setConfig} />,
    <Cloud     config={config} setConfig={setConfig} />,
    <HPC       config={config} setConfig={setConfig} />,
    <Launch    config={config} onStatusChange={setSystemStatus} />,
    <Services  />,
    <Logs      />,
    <Workbench />,
    <Settings  config={config} setConfig={setConfig} />,
    <Jobs      />,
  ];

  const currentName = PAGE_NAMES[step] || "—";
  const isWizardPage = step <= WIZARD_MAX;

  // ─── Don't render until config is loaded ───────────────
  if (!ready) {
    return (
      <div style={{
        display:"flex", height:"100vh",
        alignItems:"center", justifyContent:"center",
        background:"var(--bg)", flexDirection:"column", gap:12,
      }}>
        <div style={{
          width:32, height:32, borderRadius:"50%",
          border:"3px solid rgba(255,255,255,0.1)",
          borderTop:"3px solid var(--accent)",
          animation:"spin 1s linear infinite",
        }} />
        <div style={{ fontSize:11, fontFamily:"var(--mono)", color:"var(--muted)" }}>
          Loading configuration...
        </div>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      display:"flex", height:"100vh",
      background:"var(--bg)", color:"var(--text)",
      fontFamily:"var(--font)", overflow:"hidden",
    }}>
      {/* Sidebar */}
      <Sidebar nav={NAV} step={step} setStep={setStep} systemStatus={systemStatus} />

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Topbar */}
        <div style={{
          height:48, background:"var(--bg2)",
          borderBottom:"1px solid var(--border)",
          display:"flex", alignItems:"center",
          padding:"0 20px", gap:12, flexShrink:0,
        }}>
          <div style={{
            fontSize:11, fontFamily:"var(--mono)", color:"var(--muted)",
            display:"flex", alignItems:"center", gap:6,
          }}>
            studio / <span style={{ color:"var(--text)" }}>{currentName}</span>
          </div>

          {/* First run warning */}
          {!config?.settings?.data_dir && (
            <div style={{
              fontSize:10, fontFamily:"var(--mono)",
              color:"var(--warn)",
              background:"rgba(255,165,2,0.08)",
              border:"1px solid rgba(255,165,2,0.2)",
              padding:"3px 10px", borderRadius:4,
              cursor:"pointer",
            }} onClick={() => setStep(8)}>
              ⚠ Setup required — configure data directory
            </div>
          )}

          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
            {/* System status */}
            <span style={{
              fontFamily:"var(--mono)", fontSize:9,
              padding:"3px 8px", borderRadius:4, letterSpacing:"0.08em",
              background: systemStatus === "running"  ? "rgba(0,229,160,0.12)"
                        : systemStatus === "starting" ? "rgba(255,165,2,0.12)"
                        : systemStatus === "error"    ? "rgba(255,71,87,0.12)"
                        : "rgba(255,255,255,0.06)",
              color: systemStatus === "running"  ? "var(--accent)"
                   : systemStatus === "starting" ? "var(--warn)"
                   : systemStatus === "error"    ? "var(--danger)"
                   : "var(--muted)",
              border: `1px solid ${
                systemStatus === "running"  ? "rgba(0,229,160,0.2)"
                : systemStatus === "starting" ? "rgba(255,165,2,0.2)"
                : systemStatus === "error"    ? "rgba(255,71,87,0.2)"
                : "rgba(255,255,255,0.08)"
              }`,
            }}>
              {systemStatus.toUpperCase()}
            </span>

            <span style={{
              fontFamily:"var(--mono)", fontSize:9, padding:"3px 8px",
              borderRadius:4, letterSpacing:"0.08em",
              background:"rgba(0,148,255,0.12)", color:"var(--accent2)",
              border:"1px solid rgba(0,148,255,0.2)",
            }}>v0.1.0</span>

            <span style={{
              fontFamily:"var(--mono)", fontSize:9, padding:"3px 8px",
              borderRadius:4, letterSpacing:"0.08em",
              background:"rgba(255,107,53,0.12)", color:"var(--accent3)",
              border:"1px solid rgba(255,107,53,0.2)",
            }}>BETA</span>
          </div>
        </div>

        {/* Page Content */}
        <div style={{
          flex:1, overflowY:"auto", padding:20,
          scrollbarWidth:"thin",
          scrollbarColor:"var(--border2) transparent",
        }}>
          {pages[step]}
        </div>

        {/* Wizard Nav — only for setup pages */}
        {isWizardPage && (
          <div style={{
            height:52, background:"var(--bg2)",
            borderTop:"1px solid var(--border)",
            display:"flex", alignItems:"center",
            padding:"0 20px", gap:10, flexShrink:0,
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, flex:1 }}>
              {WIZARD_STEPS.map((name, i) => (
                <div
                  key={i}
                  onClick={() => setStep(i)}
                  title={name}
                  style={{
                    width:28, height:3, borderRadius:2, cursor:"pointer",
                    background: i < step   ? "var(--accent)"
                              : i === step ? "var(--accent2)"
                              : "var(--border2)",
                    transition:"background 0.2s",
                  }}
                />
              ))}
              <span style={{
                fontSize:10, fontFamily:"var(--mono)",
                color:"var(--muted)", marginLeft:8,
              }}>
                Step {step + 1} of {WIZARD_STEPS.length} — {WIZARD_STEPS[step]}
              </span>
            </div>

            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              style={{
                padding:"7px 16px", borderRadius:6, fontSize:11,
                fontFamily:"var(--font)", fontWeight:500,
                cursor: step === 0 ? "not-allowed" : "pointer",
                opacity: step === 0 ? 0.4 : 1,
                background:"transparent",
                border:"1px solid var(--border2)",
                color:"var(--muted)", transition:"all 0.15s",
              }}
            >Back</button>

            <button
              onClick={() => setStep(s => Math.min(WIZARD_MAX, s + 1))}
              disabled={step === WIZARD_MAX}
              style={{
                padding:"7px 16px", borderRadius:6, fontSize:11,
                fontFamily:"var(--font)", fontWeight:500,
                cursor: step === WIZARD_MAX ? "not-allowed" : "pointer",
                opacity: step === WIZARD_MAX ? 0.4 : 1,
                background:"var(--accent)", border:"none",
                color:"#000", transition:"all 0.15s",
              }}
            >Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
