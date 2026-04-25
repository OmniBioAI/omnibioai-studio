import React, { useState } from "react";
import Sidebar   from "./components/Sidebar";
import Mode      from "./pages/Mode";
import LLM       from "./pages/LLM";
import Cloud     from "./pages/Cloud";
import HPC       from "./pages/HPC";
import Launch    from "./pages/Launch";
import Services  from "./pages/Services";
import Logs      from "./pages/Logs";
import Settings  from "./pages/Settings";

const NAV = [
  { section: "Setup",   items: [
    { name:"Mode",     idx:0 },
    { name:"LLM",      idx:1 },
    { name:"Cloud",    idx:2 },
    { name:"HPC",      idx:3 },
  ]},
  { section: "Runtime", items: [
    { name:"Launch",   idx:4 },
    { name:"Services", idx:5 },
    { name:"Logs",     idx:6 },
  ]},
  { section: "System",  items: [
    { name:"Settings", idx:7 },
  ]},
];

const WIZARD_STEPS = ["Mode","LLM","Cloud","HPC","Launch"];
const WIZARD_MAX   = 4; // Launch is step 4

export default function App() {
  const [step,         setStep]         = useState(0);
  const [systemStatus, setSystemStatus] = useState("idle");
  const [config,       setConfig]       = useState({
    mode: "local", llm: {}, cloud: {}, hpc: {},
  });

  const pages = [
    <Mode     config={config} setConfig={setConfig} />,
    <LLM      config={config} setConfig={setConfig} />,
    <Cloud    config={config} setConfig={setConfig} />,
    <HPC      config={config} setConfig={setConfig} />,
    <Launch   config={config} onStatusChange={setSystemStatus} />,
    <Services />,
    <Logs />,
    <Settings />,
  ];

  const currentName = [
    "mode","llm","cloud","hpc","launch","services","logs","settings"
  ][step] || "—";

  const isWizardPage = step <= WIZARD_MAX;

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
          display:"flex", alignItems:"center", padding:"0 20px", gap:12, flexShrink:0,
        }}>
          <div style={{
            fontSize:11, fontFamily:"var(--mono)", color:"var(--muted)",
            display:"flex", alignItems:"center", gap:6,
          }}>
            studio / <span style={{ color:"var(--text)" }}>{currentName}</span>
          </div>

          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
            {/* System status badge */}
            <span style={{
              fontFamily:"var(--mono)", fontSize:9, padding:"3px 8px", borderRadius:4,
              letterSpacing:"0.08em",
              background: systemStatus === "running" ? "rgba(0,229,160,0.12)"
                        : systemStatus === "starting" ? "rgba(255,165,2,0.12)"
                        : systemStatus === "error"    ? "rgba(255,71,87,0.12)"
                        : "rgba(255,255,255,0.06)",
              color: systemStatus === "running" ? "var(--accent)"
                   : systemStatus === "starting" ? "var(--warn)"
                   : systemStatus === "error"    ? "var(--danger)"
                   : "var(--muted)",
              border: `1px solid ${
                systemStatus === "running" ? "rgba(0,229,160,0.2)"
                : systemStatus === "starting" ? "rgba(255,165,2,0.2)"
                : systemStatus === "error"    ? "rgba(255,71,87,0.2)"
                : "rgba(255,255,255,0.08)"
              }`,
            }}>
              {systemStatus.toUpperCase()}
            </span>

            <span style={{
              fontFamily:"var(--mono)", fontSize:9, padding:"3px 8px", borderRadius:4,
              letterSpacing:"0.08em",
              background:"rgba(0,148,255,0.12)", color:"var(--accent2)",
              border:"1px solid rgba(0,148,255,0.2)",
            }}>v0.1.0</span>

            <span style={{
              fontFamily:"var(--mono)", fontSize:9, padding:"3px 8px", borderRadius:4,
              letterSpacing:"0.08em",
              background:"rgba(255,107,53,0.12)", color:"var(--accent3)",
              border:"1px solid rgba(255,107,53,0.2)",
            }}>BETA</span>
          </div>
        </div>

        {/* Page Content */}
        <div style={{
          flex:1, overflowY:"auto", padding:20,
          scrollbarWidth:"thin", scrollbarColor:"var(--border2) transparent",
        }}>
          {pages[step]}
        </div>

        {/* Wizard Nav — only show for setup steps */}
        {isWizardPage && (
          <div style={{
            height:52, background:"var(--bg2)",
            borderTop:"1px solid var(--border)",
            display:"flex", alignItems:"center", padding:"0 20px", gap:10, flexShrink:0,
          }}>
            {/* Step pips */}
            <div style={{ display:"flex", alignItems:"center", gap:5, flex:1 }}>
              {WIZARD_STEPS.map((name, i) => (
                <div
                  key={i}
                  onClick={() => setStep(i)}
                  title={name}
                  style={{
                    width:28, height:3, borderRadius:2, cursor:"pointer",
                    background: i < step  ? "var(--accent)"
                              : i === step ? "var(--accent2)"
                              : "var(--border2)",
                    transition:"background 0.2s",
                  }}
                />
              ))}
              <span style={{
                fontSize:10, fontFamily:"var(--mono)", color:"var(--muted)", marginLeft:8,
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
                background:"transparent", border:"1px solid var(--border2)",
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
                background:"var(--accent)", border:"none", color:"#000",
                transition:"all 0.15s",
              }}
            >Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}