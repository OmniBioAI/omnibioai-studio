import React, { useState, useEffect, useMemo } from "react";
import { isElectron, getCurrentUserSync, getCurrentUser, onSessionChange } from "../lib/session";

// Permission gate for the Admin Console tile — reuses the same permission
// string control-center's own backend gates its core admin routes on
// (services/summary/health/config/docker routers, main.py:
// `Depends(require_permission("platform.manage_infra"))`), rather than
// inventing a separate frontend-only notion of "admin". A user without it
// would just hit 403s once inside admin.omnibioai.org anyway — same
// reasoning as the existing "Roles" nav item in App.jsx, which gates on
// manage_roles for the same reason (don't show every signed-in researcher
// an entry point to a surface most of them can't use).
const ADMIN_CONSOLE_PERMISSION = "platform.manage_infra";

function getInitialHost() {
  return (
    window.__OMNIBIOAI_SERVER__ ||
    import.meta.env.VITE_HOST ||
    "webstudio.omnibioai.org"
  );
}

function buildCategories(BASE) {
  return [
    {
      name: "Platform Services",
      color: "var(--color-text-muted)",
      links: [
        // omnibioai-docs (Docusaurus) can't be proxied under a /_svc/
        // prefix the way the rest of these are — its build has baseUrl:
        // '/' (site/docusaurus.config.js), so every asset and nav link in
        // the rendered HTML is an absolute root path with no idea it might
        // be served under a prefix. nginx-router.conf's /_svc/docs redirects
        // into the already-correct docs.omnibioai.org host instead of
        // re-proxying those same broken-by-construction paths under a
        // second prefix — see that location's own comment. Was
        // /docs/guides/getting-started.html, a path that hasn't existed
        // since the docs site moved to its current dist/user/... layout.
        { label:"Getting Started",  url:"/_svc/docs/user/getting-started/", icon:"📖", desc:"Setup · Cloud · HPC · LLM guide" },
        { label:"Video Tutorials",  url:"/_svc/videos",              icon:"🎬", desc:"Tutorial videos · Walkthroughs"   },
        { label:"Workbench",        url:"/_svc/workbench/",          icon:"🏠", desc:"Dashboard"                        },
        { label:"Control Center",   url:"/_svc/control/",            icon:"🖥️", desc:"Health + Docker imgs"             },
        // Admin Console (control-center-web's AdminApp build, dist-admin) —
        // reached directly at admin.omnibioai.org, not through nginx-router
        // at all: cloudflared points both admin.omnibioai.org and
        // control.omnibioai.org straight at control-center-web:5174, whose
        // own nginx (control-center.conf) does the host-based dist-control/
        // dist-admin split and proxies to control-center's backend, gated
        // there by the same require_permission("platform.manage_infra") IAM
        // check this tile itself gates on below — a later, deliberate
        // architecture (PR14.7B/C) that superseded nginx-router.conf's own
        // now-inert /_svc/control auth_request block. Absolute cross-origin
        // URL, same reason as Getting Started above: AdminApp's own Vite
        // build has no `base` set either, so it's root-absolute-path and
        // can't be proxied under a /_svc/ prefix without breaking assets.
        { label:"Admin Console",    url:"https://admin.omnibioai.org/", icon:"🛡️", desc:"Org/user/IAM · Billing · Compliance", requiresPermission: ADMIN_CONSOLE_PERMISSION },
        // Neo4j Browser — a full read/write Cypher console over the
        // knowledge graph, so it is permission-gated on the same
        // platform.manage_infra check as Admin Console / Control Center
        // rather than shown to every signed-in researcher. Reached via a
        // dedicated cloudflared ingress (neo4j.omnibioai.org ->
        // localhost:7474) behind Cloudflare Access; the container's 7474/
        // 7687 ports are otherwise loopback-only (docker-compose.yml).
        // Absolute cross-origin URL, same handling as Admin Console above.
        { label:"Neo4j Browser",    url:"https://neo4j.omnibioai.org/", icon:"🕸️", desc:"Knowledge-graph Cypher console", requiresPermission: ADMIN_CONSOLE_PERMISSION },
        // Internal Studio page (src/ui/pages/Billing.jsx, App.jsx step 12),
        // not an nginx-proxied service view like the tiles around it —
        // billing-service exposes only a JSON API, no UI of its own — so
        // this fires the same in-app "navigate" event the offline banner
        // uses rather than open()-ing a URL in a webview. url:"" keeps the
        // tile's isLocal/clickable check (which calls url.startsWith) happy.
        // TODO: gate this behind an appropriate permission before wider
        // rollout — currently ungated for testing, unlike Admin Console/
        // Control Center/Neo4j which use platform.manage_infra. Billing
        // data (usage/limits/costs) may reasonably be visible to regular
        // org members, so revisit the right permission level (possibly
        // org membership itself, not platform.manage_infra). See #79.
        { label:"Billing",          url:"",                          icon:"💳", desc:"Plan · usage · status", action: () => window.dispatchEvent(new CustomEvent("navigate", { detail: 12 })) },
        { label:"LIMS",             url:"/_svc/lims/",               icon:"🧪", desc:"Lab data management"              },
        { label:"Model Registry",   url:"/_svc/modelregistry",       icon:"🧬", desc:"ML model versioning"              },
        { label:"RAG / Lit AI",     url:"/_svc/rag/",                icon:"📚", desc:"PubMed RAG + DeepSeek"            },
        { label:"TES / Jobs",       url:"/_svc/tes",                 icon:"🚀", desc:"Slurm/AWS/Azure/GCP"              },
        { label:"Tool Images",      url:"/_svc/toolimages",          icon:"🐳", desc:"ARM64 SIF dashboard"              },
        { label:"Launcher",          url:"/_svc/sdk",                 icon:"🔬", desc:"Jupyter · RStudio · VS Code"      },
        { label:"Workflows",        url:"/_svc/workflows",           icon:"⚡", desc:"WDL/NF/Snake/CWL"                },
        { label:"Dev Hub",          url:"/_svc/devhub",              icon:"🛠️", desc:"Knowledge graph · RAG search"    },
        { label:"Metrics",           url:"/_svc/monitor",              icon:"📊", desc:"Grafana dashboard"               },
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
        { label:"OmniBioAgent",     url:"/_svc/workbench/plugins/bio_agent/",                  icon:"💬", desc:"AI assistant"           },
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
        { label:"Literature AI",    url:"/_svc/rag/",                                           icon:"📚", desc:"PubMed RAG + DeepSeek" },
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
  // Cached synchronously (App.jsx's own mount-time getCurrentUser() call has
  // usually already populated it by the time anyone reaches this page) so
  // permission-gated tiles like Admin Console don't flash visible-then-
  // hidden on first paint; re-subscribed below in case a user signs in/out
  // while sitting on this page.
  const [currentUser, setCurrentUser] = useState(getCurrentUserSync);

  const BASE       = "/_svc/workbench";
  const CATEGORIES = useMemo(() => buildCategories(BASE), [BASE]);

  useEffect(() => {
    let mounted = true;
    const refreshUser = async () => {
      const user = await getCurrentUser();
      if (mounted) setCurrentUser(user);
    };
    refreshUser();
    const unsubscribe = onSessionChange(refreshUser);
    return () => { mounted = false; unsubscribe(); };
  }, []);

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
      await fetch(`${BASE}/health/`, { mode: "no-cors", signal: sig });
      setOnline(true);
    } catch (_) { setOnline(false); }
    finally { setChecking(false); }
  };

  useEffect(() => {
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, [BASE]);

  // Electron's <webview> needs a fully-qualified src (it isn't part of the
  // host page's browsing context, so relative URLs won't resolve). In a
  // browser tab — web/beta mode — relative /_svc/* URLs must stay relative:
  // nginx-router already proxies them on the same origin, and prefixing
  // them with http://localhost causes mixed-content blocks on HTTPS and
  // resolves to the visitor's own machine instead of the server.
  const open = (url, label) => {
    let absolute;
    if (url.startsWith('/') && isElectron()) {
      const devHost = url.startsWith('/_svc/') && import.meta.env.DEV
        ? 'http://localhost:5174'
        : 'http://localhost';
      absolute = `${devHost}${url}`;
    } else {
      absolute = url;
    }
    window.dispatchEvent(new CustomEvent("open-service", { detail: { url: absolute, label: label || url } }));
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
            onClick={() => open(`${BASE}/plugins/catalog/`, "Plugin Catalog")}
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
            onClick={() => online && open(`${BASE}/`, "Workbench Dashboard")}
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
        {CATEGORIES.map(({ name, color, links: allLinks }) => {
          // Hide tiles like Admin Console whose target is gated on a
          // permission (platform.manage_infra) the signed-in user's JWT
          // doesn't carry — same reasoning as App.jsx's showRolesNav: don't
          // advertise an entry point most researchers would just get a 403
          // from. currentUser === null (still loading, or Electron with no
          // web session concept) fails open, same as showRolesNav, rather
          // than hiding gated tiles for everyone during that window.
          const links = allLinks.filter(({ requiresPermission }) =>
            !requiresPermission || currentUser === null || currentUser.permissions?.includes(requiresPermission)
          );
          if (links.length === 0) return null;
          return (
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
              {links.map(({ label, url, icon, desc, action }) => {
                const isLocal = !url.startsWith(BASE);
                const clickable = isLocal || online;
                return (
                  <button
                    key={label}
                    onClick={() => clickable && (action ? action() : open(url, label))}
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
          );
        })}
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
            onClick={() => online && open(`${BASE}/plugins/catalog/`, "Plugin Catalog")}
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
            onClick={() => online && open(`${BASE}/`, "Workbench Dashboard")}
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
