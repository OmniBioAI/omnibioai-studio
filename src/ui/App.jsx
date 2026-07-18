import React, { useState, useEffect } from "react";
import LicenseGate  from "./components/LicenseGate";
import BugReport    from "./components/BugReport";
import Sidebar      from "./components/Sidebar";
import UpdateBanner from "./components/UpdateBanner";
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
import ServiceViewer from "./pages/ServiceViewer";
import Videos        from "./pages/Videos";
import IdeServices   from "./pages/IdeServices";
import RoleManagement from "./pages/RoleManagement";
import OAuthLinkConfirm from "./components/OAuthLinkConfirm";
import { GrafanaViewer } from "./components/GrafanaViewer";
import { getCurrentUser, onSessionChange, consumeOAuthRedirectParams } from "./lib/session";

const BASE_NAV = [
  { section: "Setup",   items: [
    { name:"Mode",      idx:0 },
    { name:"LLM",       idx:1 },
    { name:"Cloud",     idx:2 },
    { name:"HPC",       idx:3 },
  ]},
  { section: "Runtime", items: [
    { name:"Launch",       idx:4  },
    { name:"Services",     idx:5  },
    { name:"IDE Services", idx:10 },
    { name:"Logs",         idx:6  },
    { name:"Workbench",    idx:7  },
    { name:"Jobs",         idx:9  },
  ]},
  { section: "System",  items: [
    { name:"Settings",  idx:8 },
  ]},
];

// "Roles" nav item is inserted only for users holding manage_roles — non-admins
// never see it, per the Role Management definition of done.
function buildNav(canManageRoles) {
  if (!canManageRoles) return BASE_NAV;
  return [
    BASE_NAV[0],
    BASE_NAV[1],
    { section: "Security", items: [{ name: "Roles", idx: 11 }] },
    BASE_NAV[2],
  ];
}

const WIZARD_STEPS = ["Mode","LLM","Cloud","HPC","Launch"];
const WIZARD_MAX   = 4;

const PAGE_NAMES = [
  "mode","llm","cloud","hpc","launch",
  "services","logs","workbench","settings","jobs","ide-services","roles"
];

export default function App() {
  const [step,         setStep]         = useState(0);
  const [systemStatus, setSystemStatus] = useState("idle");
  const [ready,        setReady]        = useState(false);
  const [config,       setConfig]       = useState({
    mode: "beta", llm: {}, cloud: {}, hpc: {}, settings: {},
  });
  const [service,      setService]      = useState(null); // { url, label } when viewing a service
  const [currentUser,  setCurrentUser]  = useState(null); // decoded JWT claims, or null if signed out
  const [oauthNotice,  setOauthNotice]  = useState(null); // result of an OAuth redirect: link_required | error

  // ─── Load saved config + first-run detection ───────────
  useEffect(() => {
    const init = async () => {
      try {
        if (window.api?.loadConfig) {
          const saved = await window.api.loadConfig();
          if (saved) {
            setConfig(prev => ({ ...prev, ...saved, mode: saved.mode || "beta" }));
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

  // ─── Listen for service open events (from Workbench tiles) ──
  useEffect(() => {
    const handler = (e) => setService(e.detail);
    window.addEventListener("open-service", handler);
    return () => window.removeEventListener("open-service", handler);
  }, []);

  // ─── Track the signed-in user (drives the Roles nav item + page gate) ──
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

  // ─── Consume an OAuth provider redirect back into the app, once ──
  // A successful redirect already called setSession() internally (see
  // consumeOAuthRedirectParams), which the listener above picks up; this only
  // needs to handle what setSession alone can't: prompting for account-link
  // confirmation, or surfacing a failed-sign-in message.
  useEffect(() => {
    const result = consumeOAuthRedirectParams();
    if (result && result.type !== "success") setOauthNotice(result);
  }, []);

  // Keep the nav item visible while signed out (or still loading) so there's
  // an entry point to sign in — only hide it once we positively know the
  // signed-in user lacks manage_roles.
  const showRolesNav = currentUser === null || currentUser.permissions?.includes("manage_roles");
  const nav = buildNav(showRolesNav);

  const pages = [
    <Mode      config={config} setConfig={setConfig} />,
    <LLM       config={config} setConfig={setConfig} />,
    <Cloud     config={config} setConfig={setConfig} />,
    <HPC       config={config} setConfig={setConfig} />,
    <Launch    config={config} onStatusChange={setSystemStatus} />,
    <Services  config={config} />,
    <Logs      />,
    <Workbench />,
    <Settings  config={config} setConfig={setConfig} />,
    <Jobs         />,
    <IdeServices  />,
    <RoleManagement currentUser={currentUser} />,
  ];

  const currentName = service ? service.label : (PAGE_NAMES[step] || "—");
  const isWizardPage = !service && step <= WIZARD_MAX;

  function handleStudioClick() {
    setService(null);
    setStep(7); // return to Workbench
  }

  // Electron webview bypasses Vite proxy for relative URLs; prefix /_svc/*
  // with the Vite dev server so the proxy routes them correctly.
  const resolveServiceUrl = (url) => {
    if (url && url.startsWith('/_svc/') && import.meta.env.DEV) {
      return `http://localhost:5174${url}`;
    }
    return url;
  };

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
        <div style={{ fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)" }}>
          Loading configuration...
        </div>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <LicenseGate>
    <div style={{
      display:"flex", height:"100vh",
      background:"var(--bg)", color:"var(--text)",
      fontFamily:"var(--font)", overflow:"hidden",
    }}>
      {/* Sidebar — auto-hides when inside a service/app view */}
      <div style={{
        width: service ? 0 : 200,
        overflow: "hidden",
        transition: "width 0.2s ease",
        flexShrink: 0,
      }}>
        <Sidebar
          nav={nav} step={step} setStep={setStep} systemStatus={systemStatus}
          isServiceView={!!service} onStudioClick={handleStudioClick}
        />
      </div>

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Update banner — shown at top when an update is available */}
        <UpdateBanner />

        {/* Topbar */}
        <div style={{
          height:48, background:"var(--bg2)",
          borderBottom:"1px solid var(--border)",
          display:"flex", alignItems:"center",
          padding:"0 20px", gap:12, flexShrink:0,
        }}>
          <div style={{
            fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)",
            display:"flex", alignItems:"center", gap:6,
          }}>
            <span
              onClick={handleStudioClick}
              style={{ cursor:"pointer" }}
              title="Back to Workbench"
            >studio</span>
            {" / "}
            <span style={{ color:"var(--text)" }}>{currentName}</span>
          </div>

          {/* First run warning */}
          {!config?.settings?.data_dir && (
            <div style={{
              fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)",
              color:"var(--warn)",
              background:"rgba(255,165,2,0.08)",
              border:"1px solid rgba(255,165,2,0.2)",
              padding:"3px 10px", borderRadius:'var(--radius-xs)',
              cursor:"pointer",
            }} onClick={() => setStep(8)}>
              ⚠ Setup required — configure data directory
            </div>
          )}

          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
            {/* System status */}
            <span style={{
              fontFamily:"var(--mono)", fontSize:'var(--font-size-xs)',
              padding:"3px 8px", borderRadius:'var(--radius-xs)', letterSpacing:"0.08em",
              background: systemStatus === "running"  ? "rgba(0,229,160,0.12)"
                        : systemStatus === "starting" ? "rgba(255,165,2,0.12)"
                        : systemStatus === "error"    ? "rgba(255,71,87,0.12)"
                        : "rgba(255,255,255,0.06)",
              color: systemStatus === "running"  ? "var(--accent)"
                   : systemStatus === "starting" ? "var(--warn)"
                   : systemStatus === "error"    ? "var(--danger)"
                   : "var(--color-text-muted)",
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
              fontFamily:"var(--mono)", fontSize:'var(--font-size-xs)', padding:"3px 8px",
              borderRadius:'var(--radius-xs)', letterSpacing:"0.08em",
              background:"rgba(0,148,255,0.12)", color:"var(--accent2)",
              border:"1px solid rgba(0,148,255,0.2)",
            }}>v0.5.0</span>

            <span style={{
              fontFamily:"var(--mono)", fontSize:'var(--font-size-xs)', padding:"3px 8px",
              borderRadius:'var(--radius-xs)', letterSpacing:"0.08em",
              background:"rgba(255,107,53,0.12)", color:"var(--accent3)",
              border:"1px solid rgba(255,107,53,0.2)",
            }}>BETA</span>
          </div>
        </div>

        {/* Page Content */}
        <div style={{
          flex:1, overflow:"hidden", display:"flex", flexDirection:"column",
          ...(service ? {} : { overflowY:"auto", padding:20 }),
          scrollbarWidth:"thin",
          scrollbarColor:"var(--border2) transparent",
        }}>
          {service
            ? service.url.includes("/_svc/videos")
              ? <Videos onBack={() => setService(null)} />
              : (service.url.includes("/_svc/monitor") || service.url.includes("localhost:3000"))
                ? <GrafanaViewer label={service.label} onBack={() => setService(null)} />
                : <ServiceViewer url={resolveServiceUrl(service.url)} label={service.label} onBack={() => setService(null)} />
            : <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>{pages[step]}</div>
          }
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
                    width:28, height:3, borderRadius:'var(--radius-xs)', cursor:"pointer",
                    background: i < step   ? "var(--accent)"
                              : i === step ? "var(--accent2)"
                              : "var(--border2)",
                    transition:"background 0.2s",
                  }}
                />
              ))}
              <span style={{
                fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)",
                color:"var(--color-text-muted)", marginLeft:8,
              }}>
                Step {step + 1} of {WIZARD_STEPS.length} — {WIZARD_STEPS[step]}
              </span>
            </div>

            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              style={{
                padding:"7px 16px", borderRadius:'var(--radius-sm)', fontSize:'var(--font-size-xs)',
                fontFamily:"var(--font)", fontWeight:500,
                cursor: step === 0 ? "not-allowed" : "pointer",
                opacity: step === 0 ? 0.4 : 1,
                background:"transparent",
                border:"1px solid var(--border2)",
                color:"var(--color-text-muted)", transition:"all 0.15s",
              }}
            >Back</button>

            <button
              onClick={() => setStep(s => Math.min(WIZARD_MAX, s + 1))}
              disabled={step === WIZARD_MAX}
              style={{
                padding:"7px 16px", borderRadius:'var(--radius-sm)', fontSize:'var(--font-size-xs)',
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

      {oauthNotice?.type === "link_required" && (
        <OAuthLinkConfirm
          linkToken={oauthNotice.linkToken}
          provider={oauthNotice.provider}
          email={oauthNotice.email}
          onDone={() => setOauthNotice(null)}
          onCancel={() => setOauthNotice(null)}
        />
      )}

      {oauthNotice?.type === "error" && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 1000,
          maxWidth: 360, padding: "10px 14px",
          background: "rgba(255,71,87,0.12)", border: "1px solid rgba(255,71,87,0.3)",
          borderRadius: "var(--radius-sm)", color: "var(--danger)",
          fontFamily: "var(--mono)", fontSize: "var(--font-size-xs)",
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <div style={{ flex: 1 }}>Sign-in failed: {oauthNotice.message}</div>
          <div style={{ cursor: "pointer" }} onClick={() => setOauthNotice(null)}>✕</div>
        </div>
      )}

      <BugReport />
    </LicenseGate>
  );
}
