import React, { useState, useEffect, useMemo } from "react";

function getInitialHost() {
  return (
    window.__OMNIBIOAI_SERVER__ ||
    import.meta.env.VITE_HOST ||
    "app.omnibioai.org"
  );
}

function buildCategories(BASE) {
  return [
    {
      name: "Platform Services",
      color: "var(--color-text-muted)",
      links: [
        { label:"Getting Started",  url:"/_svc/videos/guide.html",   icon:"📖", desc:"Setup · Cloud · HPC · LLM guide" },
        { label:"Video Tutorials",  url:"/_svc/videos",              icon:"🎬", desc:"Tutorial videos · Walkthroughs"   },
        { label:"Workbench",        url:"/_svc/workbench/",          icon:"🏠", desc:"Dashboard"                        },
        { label:"Control Center",   url:"/_svc/control",             icon:"🖥️", desc:"Health + Docker imgs"             },
        { label:"LIMS",             url:"/_svc/lims/",               icon:"🧪", desc:"Lab data management"              },
        { label:"Model Registry",   url:"/_svc/modelregistry",       icon:"🧬", desc:"ML model versioning"              },
        { label:"RAG / Lit AI",     url:"/_svc/rag",                 icon:"📚", desc:"PubMed RAG + DeepSeek"            },
        { label:"TES / Jobs",       url:"/_svc/tes",                 icon:"🚀", desc:"Slurm/AWS/Azure/GCP"              },
        { label:"Tool Images",      url:"/_svc/toolimages",          icon:"🐳", desc:"ARM64 SIF dashboard"              },
        { label:"SDK Launcher",     url:"/_svc/sdk",                 icon:"🔬", desc:"Analysis · SDK tools"             },
        { label:"Workflows",        url:"/_svc/workflows",           icon:"⚡", desc:"WDL/NF/Snake/CWL"                },
        { label:"Dev Hub",          url:"/_svc/devhub",              icon:"🛠️", desc:"Knowledge graph · RAG search"    },
        { label:"Prometheus",       url:"/_svc/prometheus/",           icon:"📊", desc:"Metrics scraper"                  },
        { label:"Grafana",          url:"/_svc/monitor/",               icon:"📈", desc:"Metrics dashboards"               },
      ]
    },
    {
      name: "Security Control Plane",
      color: "#f87171",
      links: [
        { label:"API Gateway",      url:"/_svc/gateway/docs",        icon:"🔐", desc:"Entry point · JWT enforcement"    },
        { label:"Auth Service",     url:"/_svc/auth/docs",           icon:"🪪", desc:"JWT · Login · Register"           },
        { label:"Policy Engine",    url:"/_svc/policy/docs",         icon:"📋", desc:"RBAC · ABAC decisions"            },
        { label:"HPC Policy",       url:"/_svc/hpc/",                icon:"⚡", desc:"GPU/CPU quota governance"         },
        { label:"Security Audit",   url:"/_svc/audit/docs",          icon:"📝", desc:"Redis Streams audit log"          },
        { label:"OPA",              url:"/_svc/opa",                 icon:"🛡️", desc:"Open Policy Agent"               },
      ]
    },
    {
      name: "Core Platform",
      color: "var(--accent)",
      links: [
        { label:"Home",             url:"/_svc/workbench/",                                    icon:"🏠", desc:"Dashboard"              },
        { label:"OnboardAI",        url:"/_svc/workbench/plugins/onboardai/",                  icon:"🤖", desc:"AI developer tools"     },
        { label:"Omni Assistant",   url:"/_svc/workbench/plugins/omni_assistant/",             icon:"💬", desc:"AI assistant"           },
        { label:"Job Monitor",      url:"/_svc/workbench/plugins/job_monitor/",                icon:"📊", desc:"Monitor jobs"           },
        { label:"Plugin Manager",   url:"/_svc/workbench/plugins/plugin_manager/",             icon:"🔌", desc:"Manage plugins"         },
        { label:"Admin",            url:"/_svc/workbench/admin/",                              icon:"⚙️", desc:"Django admin"           },
      ]
    },
    {
      name: "Workflows",
      color: "var(--accent2)",
      links: [
        { label:"Workflow Runner",  url:"/_svc/workbench/plugins/workflow_runner/",            icon:"⚡", desc:"Run workflows"          },
        { label:"Workflow Builder", url:"/_svc/workbench/plugins/workflow_builder/",           icon:"🔧", desc:"Build workflows"        },
        { label:"Agent Studio",     url:"/_svc/workbench/plugins/agent-workflows/",            icon:"🤝", desc:"Multi-agent workflows"  },
        { label:"Pipeline",         url:"/_svc/workbench/pipeline-dashboard/",                 icon:"🔄", desc:"Pipeline dashboard"     },
        { label:"Multi-Agent Orchestrator", url:"/_svc/workbench/plugins/multi_agent_bio_orchestrator/", icon:"🤖", desc:"Multi-agent biological workflows" },
        { label:"Workflow Compiler", url:"/_svc/workbench/plugins/workflow_compiler/",         icon:"⚙️", desc:"Compile and optimize workflows" },
      ]
    },
    {
      name: "Omics Analysis",
      color: "var(--accent3)",
      links: [
        { label:"RNA-Seq",          url:"/_svc/workbench/plugins/rnaseq_analysis/",            icon:"🧬", desc:"RNA-Seq analysis"       },
        { label:"Single Cell",      url:"/_svc/workbench/plugins/single_cell_analysis/",       icon:"🔬", desc:"scRNA-Seq"              },
        { label:"Exome Analysis",   url:"/_svc/workbench/plugins/exome_analysis/",             icon:"🧫", desc:"Exome sequencing"       },
        { label:"FASTQ QC",         url:"/_svc/workbench/plugins/fastq_qc/",                   icon:"✅", desc:"Quality control"        },
        { label:"Proteomics",       url:"/_svc/workbench/plugins/proteomics/",                 icon:"⚗️", desc:"Proteomics analysis"    },
        { label:"Metabolomics",     url:"/_svc/workbench/plugins/metabolomics_analysis/",      icon:"🔭", desc:"Metabolomics"           },
      ]
    },
    {
      name: "AI & Intelligence",
      color: "#a78bfa",
      links: [
        { label:"Drug Target AI",   url:"/_svc/workbench/plugins/drug_target_intelligence/",   icon:"💊", desc:"Drug target analysis"  },
        { label:"Literature AI",    url:"/_svc/rag",                                            icon:"📚", desc:"PubMed RAG + DeepSeek" },
        { label:"Pathway Enrichment",url:"/_svc/workbench/plugins/pathway_enrichment/",        icon:"🔗", desc:"Pathway analysis"      },
        { label:"Bio Hypothesis",   url:"/_svc/workbench/plugins/bio_hypothesis_ai/",          icon:"🧠", desc:"Hypothesis generation" },
        { label:"Literature Summarizer", url:"/_svc/workbench/plugins/literature_summarizer/", icon:"📄", desc:"AI-powered paper summarization" },
        { label:"Bio Narrator AI",  url:"/_svc/workbench/plugins/bio_narrator_ai/",            icon:"🧠", desc:"Biological narrative generation" },
      ]
    }
  ];
}

export default function Workbench() {
  const [host,     setHost]     = useState(getInitialHost);
  const [online,   setOnline]   = useState(false);
  const [checking, setChecking] = useState(true);

  const BASE       = "/_svc/workbench";
  const CATEGORIES = useMemo(() => buildCategories(BASE), [BASE]);

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

      {/* Skip to content — visually hidden until focused */}
      <a
        href="#main-content"
        className="skip-to-content"
      >
        Skip to content
      </a>

      {/* Header */}
      <div className="workbench-header">
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:"#fff", letterSpacing:"-0.01em", marginBottom:3 }}>
            Workbench
          </div>
          <div style={{ fontSize:'var(--font-size-sm)', color:"var(--color-text-muted)", fontFamily:"var(--mono)" }}>
            OmniBioAI bioinformatics platform — quick access to key modules
          </div>
        </div>

        <div className="workbench-header-actions">
          <div role="status" aria-live="polite" style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div
              aria-hidden="true"
              style={{
                width:7, height:7, borderRadius:"50%",
                background: checking ? "var(--warn)" : online ? "var(--accent)" : "var(--danger)",
                animation: (checking || online) ? "pulse 2s infinite" : "none",
              }}
            />
            <span style={{ fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)",
              color: checking ? "var(--warn)" : online ? "var(--accent)" : "var(--danger)",
            }}>
              {checking ? "Checking..." : online ? "Online" : "Offline"}
            </span>
          </div>

          <span style={{ fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)" }}>
            {host}
          </span>

          <button
            onClick={check}
            aria-label="Refresh connection status"
            style={{
              padding:"6px 10px", borderRadius:'var(--radius-sm)', fontSize:'var(--font-size-xs)',
              fontFamily:"var(--mono)", background:"var(--bg3)",
              border:"1px solid var(--border2)", color:"var(--color-text-muted)", cursor:"pointer",
            }}
          >↻</button>

          <button
            onClick={() => open(`${BASE}/plugins/catalog/`)}
            aria-disabled={!online}
            aria-label="Open plugin catalog"
            style={{
              padding:"8px 16px", borderRadius:'var(--radius-sm)', fontSize:'var(--font-size-sm)',
              fontFamily:"var(--font)", fontWeight:500,
              cursor: online ? "pointer" : "not-allowed",
              opacity: online ? 1 : 0.4,
              background:"rgba(0,148,255,0.12)",
              border:"1px solid rgba(0,148,255,0.25)",
              color:"var(--accent2)",
            }}
          >
            <span aria-hidden="true">📦</span> Catalog
          </button>

          <button
            onClick={() => online && open(`${BASE}/`)}
            aria-disabled={!online}
            aria-label="Launch workbench dashboard"
            style={{
              padding:"8px 20px", borderRadius:'var(--radius-sm)', fontSize:'var(--font-size-sm)',
              fontFamily:"var(--font)", fontWeight:600,
              cursor: online ? "pointer" : "not-allowed",
              opacity: online ? 1 : 0.4,
              background: online ? "var(--accent)" : "var(--bg2)",
              border: online ? "none" : "1px solid var(--border2)",
              color: online ? "#000" : "var(--color-text-muted)",
            }}
          >↗ Launch Workbench</button>
        </div>
      </div>

      {/* Offline banner */}
      {!online && !checking && (
        <div style={{
          padding:"12px 16px", borderRadius:'var(--radius)',
          background:"rgba(255,71,87,0.06)",
          border:"1px solid rgba(255,71,87,0.15)",
          display:"flex", alignItems:"center", justifyContent:"space-between",
        }}>
          <span style={{ fontSize:'var(--font-size-sm)', fontFamily:"var(--mono)", color:"var(--danger)" }}>
            Workbench offline — start the stack first
          </span>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("navigate",{detail:4}))}
            style={{
              padding:"5px 12px", borderRadius:5, fontSize:'var(--font-size-xs)',
              fontFamily:"var(--mono)", background:"rgba(0,229,160,0.08)",
              border:"1px solid rgba(0,229,160,0.2)", color:"var(--accent)", cursor:"pointer",
            }}
          >Go to Launch →</button>
        </div>
      )}

      {/* Categories */}
      <div id="main-content">
        {CATEGORIES.map(({ name, color, links }) => (
          <div key={name} style={{
            background:"var(--bg3)", border:"1px solid var(--border)",
            borderRadius:'var(--radius-lg)', overflow:"hidden",
            marginBottom: 8,
          }}>
            <div style={{
              padding:"10px 16px", borderBottom:"1px solid var(--border)",
              display:"flex", alignItems:"center", gap:8,
            }}>
              <div aria-hidden="true" style={{ width:3, height:14, borderRadius:'var(--radius-xs)', background:color, flexShrink:0 }} />
              <span style={{
                fontSize:'var(--font-size-xs)', fontWeight:500, letterSpacing:"0.06em",
                textTransform:"uppercase", color:"var(--text)",
              }}>{name}</span>
              <span style={{ fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)", marginLeft:4 }}>
                {links.length} modules
              </span>
            </div>

            <div className="app-grid">
              {links.map(({ label, url, icon, desc }) => {
                const isLocal = !url.startsWith(BASE);
                const clickable = isLocal || online;
                return (
                  <button
                    key={label}
                    onClick={() => clickable && open(url)}
                    aria-label={`${label} — ${desc}`}
                    aria-disabled={!clickable}
                    title={desc}
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
                    <span aria-hidden="true" style={{ fontSize:20 }}>{icon}</span>
                    <div style={{ fontSize:'var(--font-size-xs)', fontWeight:500, color, lineHeight:1.3 }}>{label}</div>
                    <div style={{ fontSize:'var(--font-size-xs)', fontFamily:"var(--font-mono)", color:"var(--color-text-muted)" }}>{desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Explore more banner */}
      <div style={{
        padding:"16px 20px", borderRadius:'var(--radius-lg)',
        background:"linear-gradient(135deg, rgba(0,229,160,0.06), rgba(0,148,255,0.06))",
        border:"1px solid rgba(0,229,160,0.15)",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        flexWrap:"wrap", gap:12,
      }}>
        <div>
          <div style={{ fontSize:'var(--font-size-base)', fontWeight:600, color:"#fff", marginBottom:4 }}>
            <span aria-hidden="true">🚀</span> Explore all plugins, tools and pipelines
          </div>
          <div style={{ fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)" }}>
            OmniBioAI has 80+ bioinformatics modules — browse the full catalog inside the workbench
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexShrink:0 }}>
          <button
            onClick={() => online && open(`${BASE}/plugins/catalog/`)}
            aria-disabled={!online}
            aria-label="Open plugin catalog"
            style={{
              padding:"9px 18px", borderRadius:'var(--radius-sm)', fontSize:'var(--font-size-sm)',
              fontFamily:"var(--font)", fontWeight:500,
              cursor: online ? "pointer" : "not-allowed",
              opacity: online ? 1 : 0.4,
              background:"rgba(0,148,255,0.12)",
              border:"1px solid rgba(0,148,255,0.25)",
              color:"var(--accent2)",
            }}
          >
            <span aria-hidden="true">📦</span> Open Catalog
          </button>
          <button
            onClick={() => online && open(`${BASE}/`)}
            aria-disabled={!online}
            aria-label="Launch workbench dashboard"
            style={{
              padding:"9px 18px", borderRadius:'var(--radius-sm)', fontSize:'var(--font-size-sm)',
              fontFamily:"var(--font)", fontWeight:600,
              cursor: online ? "pointer" : "not-allowed",
              opacity: online ? 1 : 0.4,
              background: online ? "var(--accent)" : "var(--bg2)",
              border:"none", color: online ? "#000" : "var(--color-text-muted)",
            }}
          >↗ Launch Workbench</button>
        </div>
      </div>

    </div>
  );
}
