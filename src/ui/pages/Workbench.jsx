import React, { useState, useEffect, useMemo } from "react";

function getInitialHost() {
  return (
    window.__OMNIBIOAI_SERVER__ ||
    import.meta.env.VITE_HOST ||
    "192.168.86.234"
  );
}

function buildCategories(HOST, BASE) {
  return [
    {
      name: "Platform Services",
      color: "var(--muted)",
      links: [
        { label:"Getting Started",  url:`http://${HOST}:8086/guide.html`,   icon:"📖", desc:"Setup · Cloud · HPC · LLM guide" },
        { label:"Video Tutorials",  url:`http://${HOST}:8086`,              icon:"🎬", desc:"Tutorial videos · Walkthroughs"   },
        { label:"Workbench",        url:`${BASE}/`,                         icon:"🏠", desc:"Dashboard"                        },
        { label:"Control Center",   url:`http://${HOST}:7070`,              icon:"🖥️", desc:"Health + Docker imgs"             },
        { label:"LIMS",             url:`http://${HOST}:7000`,              icon:"🧪", desc:"Lab data management"              },
        { label:"Model Registry",   url:`http://${HOST}:5176`,              icon:"🧬", desc:"ML model versioning"              },
        { label:"RAG / Lit AI",     url:`http://${HOST}:5175`,              icon:"📚", desc:"PubMed RAG + DeepSeek"            },
        { label:"TES / Jobs",       url:`http://${HOST}:5177`,              icon:"🚀", desc:"Slurm/AWS/Azure/GCP"              },
        { label:"Tool Images",      url:`http://${HOST}:5179`,              icon:"🐳", desc:"ARM64 SIF dashboard"              },
        { label:"SDK Launcher",     url:`http://${HOST}:5190`,              icon:"🔬", desc:"Analysis · SDK tools"             },
        { label:"Workflows",        url:`http://${HOST}:5178`,              icon:"⚡", desc:"WDL/NF/Snake/CWL"                },
        { label:"Dev Hub",          url:`http://${HOST}:5173`,              icon:"🛠️", desc:"Knowledge graph · RAG search"    },
      ]
    },
    {
      name: "Security Control Plane",
      color: "#f87171",
      links: [
        { label:"API Gateway",      url:`http://${HOST}:8080/docs`,         icon:"🔐", desc:"Entry point · JWT enforcement"    },
        { label:"Auth Service",     url:`http://${HOST}:8001/docs`,         icon:"🪪", desc:"JWT · Login · Register"           },
        { label:"Policy Engine",    url:`http://${HOST}:8002/docs`,         icon:"📋", desc:"RBAC · ABAC decisions"            },
        { label:"HPC Policy",       url:`http://${HOST}:8003/`,         icon:"⚡", desc:"GPU/CPU quota governance"         },
        { label:"Security Audit",   url:`http://${HOST}:8004/docs`,         icon:"📝", desc:"Redis Streams audit log"          },
        { label:"OPA",              url:`http://${HOST}:8181`,              icon:"🛡️", desc:"Open Policy Agent"               },
      ]
    },
    {
      name: "Core Platform",
      color: "var(--accent)",
      links: [
        { label:"Home",             url:`${BASE}/`,                                    icon:"🏠", desc:"Dashboard"              },
        { label:"OnboardAI",        url:`${BASE}/plugins/onboardai/`,                  icon:"🤖", desc:"AI developer tools"     },
        { label:"Omni Assistant",   url:`${BASE}/plugins/omni_assistant/`,             icon:"💬", desc:"AI assistant"           },
        { label:"Job Monitor",      url:`${BASE}/plugins/job_monitor/`,                icon:"📊", desc:"Monitor jobs"           },
        { label:"Plugin Manager",   url:`${BASE}/plugins/plugin_manager/`,             icon:"🔌", desc:"Manage plugins"         },
        { label:"Admin",            url:`${BASE}/admin/`,                              icon:"⚙️", desc:"Django admin"           },
      ]
    },
    {
      name: "Workflows",
      color: "var(--accent2)",
      links: [
        { label:"Workflow Runner",  url:`${BASE}/plugins/workflow_runner/`,            icon:"⚡", desc:"Run workflows"          },
        { label:"Workflow Builder", url:`${BASE}/plugins/workflow_builder/`,           icon:"🔧", desc:"Build workflows"        },
        { label:"Agent Studio",     url:`${BASE}/plugins/agent-workflows/`,            icon:"🤝", desc:"Multi-agent workflows"  },
        { label:"Pipeline",         url:`${BASE}/pipeline-dashboard/`,                 icon:"🔄", desc:"Pipeline dashboard"     },
        { label:"Multi-Agent Orchestrator", url:`${BASE}/plugins/multi_agent_bio_orchestrator/`, icon:"🤖", desc:"Multi-agent biological workflows" },
        { label:"Workflow Compiler", url:`${BASE}/plugins/workflow_compiler/`,         icon:"⚙️", desc:"Compile and optimize workflows" },
      ]
    },
    {
      name: "Omics Analysis",
      color: "var(--accent3)",
      links: [
        { label:"RNA-Seq",          url:`${BASE}/plugins/rnaseq_analysis/`,            icon:"🧬", desc:"RNA-Seq analysis"       },
        { label:"Single Cell",      url:`${BASE}/plugins/single_cell_analysis/`,       icon:"🔬", desc:"scRNA-Seq"              },
        { label:"Exome Analysis",   url:`${BASE}/plugins/exome_analysis/`,             icon:"🧫", desc:"Exome sequencing"       },
        { label:"FASTQ QC",         url:`${BASE}/plugins/fastq_qc/`,                   icon:"✅", desc:"Quality control"        },
        { label:"Proteomics",       url:`${BASE}/plugins/proteomics/`,                 icon:"⚗️", desc:"Proteomics analysis"    },
        { label:"Metabolomics",     url:`${BASE}/plugins/metabolomics_analysis/`,      icon:"🔭", desc:"Metabolomics"           },
      ]
    },
    {
      name: "AI & Intelligence",
      color: "#a78bfa",
      links: [
        { label:"Drug Target AI",   url:`${BASE}/plugins/drug_target_intelligence/`,   icon:"💊", desc:"Drug target analysis"  },
        { label:"Literature AI",    url:`http://${HOST}:5175`,                                  icon:"📚", desc:"PubMed RAG + DeepSeek" },
        { label:"Pathway Enrichment",url:`${BASE}/plugins/pathway_enrichment/`,        icon:"🔗", desc:"Pathway analysis"      },
        { label:"Bio Hypothesis",   url:`${BASE}/plugins/bio_hypothesis_ai/`,          icon:"🧠", desc:"Hypothesis generation" },
        { label:"Literature Summarizer", url:`${BASE}/plugins/literature_summarizer/`, icon:"📄", desc:"AI-powered paper summarization" },
        { label:"Bio Narrator AI",  url:`${BASE}/plugins/bio_narrator_ai/`,            icon:"🧠", desc:"Biological narrative generation" },
      ]
    }
  ];
}

export default function Workbench() {
  const [host,     setHost]     = useState(getInitialHost);
  const [online,   setOnline]   = useState(false);
  const [checking, setChecking] = useState(true);

  const BASE       = `http://${host}:8000`;
  const CATEGORIES = useMemo(() => buildCategories(host, BASE), [host, BASE]);

  // Load saved server IP from config on mount
  useEffect(() => {
    const loadHost = async () => {
      if (window.api?.loadConfig) {
        const cfg = await window.api.loadConfig();
        const savedHost = cfg?.server?.host_ip;
        if (savedHost) setHost(savedHost);
      }
    };
    loadHost();
  }, []);

  const check = async () => {
    setChecking(true);
    try {
      const sig = AbortSignal.timeout(5000);
      if (import.meta.env.DEV) {
        const res = await fetch("/_health", { signal: sig });
        setOnline(res.ok);
      } else {
        await fetch(`${BASE}/health/`, { mode: "no-cors", signal: sig });
        setOnline(true);
      }
    } catch (_) { setOnline(false); }
    finally { setChecking(false); }
  };

  useEffect(() => {
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, [BASE]);

  const open = (url) => {
    if (window.api?.openExternal) {
      window.api.openExternal(url);
    } else {
      window.open(url, "_blank");
    }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:"#fff", letterSpacing:"-0.01em", marginBottom:3 }}>
            Workbench
          </div>
          <div style={{ fontSize:12, color:"var(--muted)", fontFamily:"var(--mono)" }}>
            OmniBioAI bioinformatics platform — quick access to key modules
          </div>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{
              width:7, height:7, borderRadius:"50%",
              background: checking ? "var(--warn)" : online ? "var(--accent)" : "var(--danger)",
              animation: (checking || online) ? "pulse 2s infinite" : "none",
            }} />
            <span style={{ fontSize:11, fontFamily:"var(--mono)",
              color: checking ? "var(--warn)" : online ? "var(--accent)" : "var(--danger)",
            }}>
              {checking ? "Checking..." : online ? "Online" : "Offline"}
            </span>
          </div>

          <span style={{ fontSize:10, fontFamily:"var(--mono)", color:"var(--muted)" }}>
            {host}
          </span>

          <button onClick={check} style={{
            padding:"6px 10px", borderRadius:6, fontSize:11,
            fontFamily:"var(--mono)", background:"var(--bg3)",
            border:"1px solid var(--border2)", color:"var(--muted)", cursor:"pointer",
          }}>↻</button>

          <button onClick={() => open(`${BASE}/plugins/catalog/`)} disabled={!online} style={{
            padding:"8px 16px", borderRadius:6, fontSize:12,
            fontFamily:"var(--font)", fontWeight:500,
            cursor: online ? "pointer" : "not-allowed",
            opacity: online ? 1 : 0.4,
            background:"rgba(0,148,255,0.12)",
            border:"1px solid rgba(0,148,255,0.25)",
            color:"var(--accent2)",
          }}>📦 Catalog</button>

          <button onClick={() => open(`${BASE}/`)} disabled={!online} style={{
            padding:"8px 20px", borderRadius:6, fontSize:12,
            fontFamily:"var(--font)", fontWeight:600,
            cursor: online ? "pointer" : "not-allowed",
            opacity: online ? 1 : 0.4,
            background: online ? "var(--accent)" : "var(--bg2)",
            border: online ? "none" : "1px solid var(--border2)",
            color: online ? "#000" : "var(--muted)",
          }}>↗ Launch Workbench</button>
        </div>
      </div>

      {/* Offline banner */}
      {!online && !checking && (
        <div style={{
          padding:"12px 16px", borderRadius:8,
          background:"rgba(255,71,87,0.06)",
          border:"1px solid rgba(255,71,87,0.15)",
          display:"flex", alignItems:"center", justifyContent:"space-between",
        }}>
          <span style={{ fontSize:12, fontFamily:"var(--mono)", color:"var(--danger)" }}>
            Workbench offline — start the stack first
          </span>
          <button onClick={() => window.dispatchEvent(new CustomEvent("navigate",{detail:4}))} style={{
            padding:"5px 12px", borderRadius:5, fontSize:11,
            fontFamily:"var(--mono)", background:"rgba(0,229,160,0.08)",
            border:"1px solid rgba(0,229,160,0.2)", color:"var(--accent)", cursor:"pointer",
          }}>Go to Launch →</button>
        </div>
      )}

      {/* Categories */}
      {CATEGORIES.map(({ name, color, links }) => (
        <div key={name} style={{
          background:"var(--bg3)", border:"1px solid var(--border)",
          borderRadius:10, overflow:"hidden",
        }}>
          <div style={{
            padding:"10px 16px", borderBottom:"1px solid var(--border)",
            display:"flex", alignItems:"center", gap:8,
          }}>
            <div style={{ width:3, height:14, borderRadius:2, background:color, flexShrink:0 }} />
            <span style={{
              fontSize:11, fontWeight:500, letterSpacing:"0.06em",
              textTransform:"uppercase", color:"var(--text)",
            }}>{name}</span>
            <span style={{ fontSize:9, fontFamily:"var(--mono)", color:"var(--muted)", marginLeft:4 }}>
              {links.length} modules
            </span>
          </div>

          <div style={{
            display:"grid", gridTemplateColumns:"repeat(6, 1fr)",
            gap:1, background:"var(--border)",
          }}>
            {links.map(({ label, url, icon, desc }) => {
              const isLocal = !url.startsWith(BASE);
              const clickable = isLocal || online;
              return (
                <button
                  key={label}
                  onClick={() => clickable && open(url)}
                  disabled={!clickable}
                  style={{
                    padding:"12px 8px", background:"var(--bg3)",
                    cursor: clickable ? "pointer" : "not-allowed",
                    opacity: clickable ? 1 : 0.5,
                    border:"none", transition:"background 0.15s",
                    display:"flex", flexDirection:"column",
                    alignItems:"center", gap:5, textAlign:"center",
                  }}
                  onMouseEnter={e => { if(clickable) e.currentTarget.style.background="rgba(255,255,255,0.03)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background="var(--bg3)"; }}
                >
                  <span style={{ fontSize:20 }}>{icon}</span>
                  <div style={{ fontSize:10, fontWeight:500, color, lineHeight:1.3 }}>{label}</div>
                  <div style={{ fontSize:9, fontFamily:"var(--mono)", color:"var(--muted)" }}>{desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Explore more banner */}
      <div style={{
        padding:"16px 20px", borderRadius:10,
        background:"linear-gradient(135deg, rgba(0,229,160,0.06), rgba(0,148,255,0.06))",
        border:"1px solid rgba(0,229,160,0.15)",
        display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:"#fff", marginBottom:4 }}>
            🚀 Explore all plugins, tools and pipelines
          </div>
          <div style={{ fontSize:11, fontFamily:"var(--mono)", color:"var(--muted)" }}>
            OmniBioAI has 80+ bioinformatics modules — browse the full catalog inside the workbench
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexShrink:0 }}>
          <button onClick={() => online && open(`${BASE}/plugins/catalog/`)} disabled={!online} style={{
            padding:"9px 18px", borderRadius:6, fontSize:12,
            fontFamily:"var(--font)", fontWeight:500,
            cursor: online ? "pointer" : "not-allowed",
            opacity: online ? 1 : 0.4,
            background:"rgba(0,148,255,0.12)",
            border:"1px solid rgba(0,148,255,0.25)",
            color:"var(--accent2)",
          }}>📦 Open Catalog</button>
          <button onClick={() => online && open(`${BASE}/`)} disabled={!online} style={{
            padding:"9px 18px", borderRadius:6, fontSize:12,
            fontFamily:"var(--font)", fontWeight:600,
            cursor: online ? "pointer" : "not-allowed",
            opacity: online ? 1 : 0.4,
            background: online ? "var(--accent)" : "var(--bg2)",
            border:"none", color: online ? "#000" : "var(--muted)",
          }}>↗ Launch Workbench</button>
        </div>
      </div>

    </div>
  );
}