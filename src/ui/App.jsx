import React, { useState, useEffect } from "react";
import LicenseGate  from "./components/LicenseGate";
import BugReport    from "./components/BugReport";
import Sidebar      from "./components/Sidebar";
import MobileNav    from "./components/MobileNav";
import UpdateBanner from "./components/UpdateBanner";
import Mode      from "./pages/Mode";
import LLM       from "./pages/LLM";
import Cloud     from "./pages/Cloud";
import HPC       from "./pages/HPC";
import Launch    from "./pages/Launch";
import Services  from "./pages/Services";
import Logs      from "./pages/Logs";
import Settings  from "./pages/Settings";
import Studio from "./pages/Studio";
import Workbench from "./pages/Workbench";
import Jobs      from "./pages/Jobs";
import ServiceViewer from "./pages/ServiceViewer";
import PluginPage from "./pages/PluginPage";
import Videos        from "./pages/Videos";
import IdeServices   from "./pages/IdeServices";
import RoleManagement from "./pages/RoleManagement";
import Billing from "./pages/Billing";
import Developer from "./pages/Developer";
import Profile from "./pages/Profile";
import AccountSecurity from "./pages/AccountSecurity";
import AccountPreferences from "./pages/AccountPreferences";
import AccountPersonalization from "./pages/AccountPersonalization";
import OrganizationConnections from "./pages/OrganizationConnections";
import AccountAppearance from "./pages/AccountAppearance";
import AccountNotifications from "./pages/AccountNotifications";
import Projects from "./pages/Projects";
import Artifacts from "./pages/Artifacts";
import Explore from "./pages/Explore";
import PreferencesProvider from "./components/PreferencesProvider";
import AppearanceProvider from "./components/AppearanceProvider";
import AccountLayout from "./components/AccountLayout";
import WorkbenchModuleHeader from "./components/WorkbenchModuleHeader";
import OAuthLinkConfirm from "./components/OAuthLinkConfirm";
import Login from "./components/Login";
import { GrafanaViewer } from "./components/GrafanaViewer";
import { getCurrentUser, onSessionChange, consumeOAuthRedirectParams, isElectron, refresh, getRefreshToken } from "./lib/session";
import { loadConfig as loadWebConfig } from "./lib/web/webApi";

// idx values: 0-17 are real `step` pages (see `pages` below); 18/19 are the
// Code/Workflows service aliases (never a real step -- see
// EXTERNAL_NAV_SERVICES); 20-22 are the new native Projects/Artifacts/Explore
// shells; -1 is Ask OmniBioAI's placeholder, which never navigates at all
// (see the `disabled` nav-item contract below).
const ASK_NAV_IDX = -1;
const PROJECTS_PAGE = 20;
const ARTIFACTS_PAGE = 21;
const EXPLORE_PAGE = 22;

const BASE_NAV = [
  { section: null, items: [{ name:"Studio", idx:7 }] },
  // Ask OmniBioAI is intentionally unwired -- the real implementation lives in
  // the sibling Dev Hub app and Studio has no verified stable deep link to its
  // Ask page yet, so this item is visible but not an operational destination
  // (see the Sidebar/MobileNav `disabled` handling).
  { section: "AI", items: [
    { name:"Ask OmniBioAI", idx: ASK_NAV_IDX, disabled: true },
  ]},
  { section: "Work", items: [
    { name:"Projects",  idx: PROJECTS_PAGE },
    { name:"Code",      idx: 18 },
    { name:"Workflows", idx: 19 },
    { name:"Jobs",      idx: 9  },
    { name:"Artifacts", idx: ARTIFACTS_PAGE },
  ]},
  { section: "Discover", items: [
    { name:"Explore", idx: EXPLORE_PAGE },
  ]},
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
    { name:"Billing",      idx:12 },
    { name:"Developer",    idx:14 },
  ]},
  { section: "Organization", items: [{ name: "Connections", idx: 26 }] },
  { section: "System",  items: [
    { name:"Settings",  idx:8 },
  ]},
];

// "Roles" nav item is inserted only for users holding manage_roles — non-admins
// never see it, per the Role Management definition of done. Spliced in right
// after "Runtime" by section name (rather than a fixed array index) so this
// keeps working regardless of how many groups precede Runtime.
function buildNav(canManageRoles) {
  if (!canManageRoles) return BASE_NAV;
  const afterRuntime = BASE_NAV.findIndex(group => group.section === "Runtime") + 1;
  return [
    ...BASE_NAV.slice(0, afterRuntime),
    { section: "Security", items: [{ name: "Roles", idx: 11 }] },
    ...BASE_NAV.slice(afterRuntime),
  ];
}

const WIZARD_STEPS = ["Mode","LLM","Cloud","HPC","Launch"];
const WIZARD_MAX   = 4;

const PAGE_NAMES = [
  "mode","llm","cloud","hpc","launch",
  "services","logs","studio","settings","jobs","ide-services","roles","billing","workbench","developer","profile","security","preferences",
  "code","workflows", // 18/19 -- never a real `step` (see EXTERNAL_NAV_SERVICES); kept only so later indices stay aligned
  "projects","artifacts","explore","notifications","personalization","appearance","organization-connections",
];

const PAGE_LABELS = [
  "Mode", "LLM", "Cloud", "HPC", "Launch", "Services", "Logs",
  "Studio", "Settings", "Jobs", "IDE Services", "Roles", "Billing", "Workbench", "Developer", "Profile", "Security", "Preferences",
  "Code", "Workflows",
  "Projects", "Artifacts", "Explore", "Notifications", "Personalization", "Appearance", "Connections",
];

const STUDIO_PATH = "/studio";
const PROFILE_PATH = "/studio/profile";
const PROFILE_PAGE = 15;
const SECURITY_PATH = "/studio/security";
const SECURITY_PAGE = 16;
const PREFERENCES_PATH = "/studio/preferences";
const PREFERENCES_PAGE = 17;
const NOTIFICATIONS_PATH = "/studio/notifications";
const NOTIFICATIONS_PAGE = 23;
const PERSONALIZATION_PATH = "/studio/personalization";
const PERSONALIZATION_PAGE = 24;
const APPEARANCE_PATH = "/studio/appearance";
const APPEARANCE_PAGE = 25;
const CONNECTIONS_PAGE = 26;
const ACCOUNT_PAGES = { profile: PROFILE_PAGE, security: SECURITY_PAGE, preferences: PREFERENCES_PAGE, notifications: NOTIFICATIONS_PAGE, personalization: PERSONALIZATION_PAGE, appearance: APPEARANCE_PAGE };
const PROJECTS_PATH = "/studio/projects";
const ARTIFACTS_PATH = "/studio/artifacts";
const EXPLORE_PATH = "/studio/explore";
const VIDEO_STUDIO_PATH = "/studio/videos";
const LEGACY_PORTAL_PATH = "/workbench";

// Every native page with its own bookmarkable URL, in both directions --
// extends the exact mechanism the three Account pages already use (manual
// history.replaceState, no router) to the three new native shells.
const PATH_TO_PAGE = {
  "/studio/organization/connections": CONNECTIONS_PAGE,
  [PROFILE_PATH]:     PROFILE_PAGE,
  [SECURITY_PATH]:    SECURITY_PAGE,
  [PREFERENCES_PATH]: PREFERENCES_PAGE,
  [NOTIFICATIONS_PATH]: NOTIFICATIONS_PAGE,
  [PERSONALIZATION_PATH]: PERSONALIZATION_PAGE,
  [APPEARANCE_PATH]: APPEARANCE_PAGE,
  [PROJECTS_PATH]:    PROJECTS_PAGE,
  [ARTIFACTS_PATH]:   ARTIFACTS_PAGE,
  [EXPLORE_PATH]:     EXPLORE_PAGE,
};
const PAGE_TO_PATH = Object.fromEntries(Object.entries(PATH_TO_PAGE).map(([path, page]) => [page, path]));
const KNOWN_PAGE_PATHS = Object.keys(PATH_TO_PAGE);

// "Code" and "Workflows" are nav-only aliases onto the existing Launcher and
// Workflow Registry services already reachable from Studio's dashboard tiles
// -- idx 18/19 never become the `step` (handleNavClick intercepts them below
// and opens the same `service` state every dashboard tile already opens),
// so `pages[18]`/`pages[19]` are unused placeholders (see `pages` below).
const CODE_NAV_IDX = 18;
const WORKFLOWS_NAV_IDX = 19;
const EXTERNAL_NAV_SERVICES = {
  [CODE_NAV_IDX]:      { url: "/_svc/sdk",       label: "Code" },
  [WORKFLOWS_NAV_IDX]: { url: "/_svc/workflows", label: "Workflows" },
};

function getInitialService() {
  if (typeof window !== "undefined" && window.location.pathname === VIDEO_STUDIO_PATH) {
    return { url: "/_svc/videos", label: "Videos" };
  }
  return null;
}

// Same-origin relative paths only -- must start with exactly one "/",
// never "//" (browsers treat a leading "//" as protocol-relative, an open
// redirect to any host), and must not resolve to a different origin.
// Scoped to password/license login for v1 -- OAuth's redirect goes through
// a separate provider round-trip that doesn't carry return_to through its
// state token today (routes_oauth.py), so this only fires for the direct
// password/license path, same as wherever ?return_to= actually gets set.
function getSafeReturnTo() {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("return_to");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  try {
    if (new URL(raw, window.location.origin).origin !== window.location.origin) return null;
  } catch (_) {
    return null;
  }
  return raw;
}

export default function App() {
  const [step,         setStep]         = useState(() => PATH_TO_PAGE[window.location.pathname] ?? 7);
  const [systemStatus, setSystemStatus] = useState("idle");
  const [ready,        setReady]        = useState(false);
  const [config,       setConfig]       = useState({
    mode: "beta", llm: {}, cloud: {}, hpc: {}, settings: {},
  });
  const [service,      setService]      = useState(getInitialService); // { url, label } when viewing a service
  const [workbenchState, setWorkbenchState] = useState({ query: "", category: "__all__", focusSlug: null });
  const [currentUser,  setCurrentUser]  = useState(null); // decoded JWT claims, or null if signed out
  const [authChecked,  setAuthChecked]  = useState(false); // has the initial session check resolved? (web only)
  const [oauthNotice,  setOauthNotice]  = useState(null); // result of an OAuth redirect: link_required | error
  const [returnTo,     setReturnTo]     = useState(() => getSafeReturnTo()); // ?return_to= target, captured once
  const [mobileNavOpen, setMobileNavOpen] = useState(false); // MobileNav drawer — mobile only, no desktop effect

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
        } else if (!isElectron()) {
          // Web/cloud deployment (e.g. webstudio.omnibioai.org): window.api
          // (Electron's preload bridge) is never injected into a plain
          // browser tab, so the branch above never runs here and `config`
          // was silently stuck at its hardcoded initial default forever.
          // webApi.loadConfig() (src/ui/lib/web/webApi.js) is the purpose-
          // built web-mode stand-in — there's no local Docker stack or
          // data_dir to configure when connecting to an already-running
          // backend, so it always resolves with mode: "beta" rather than
          // needing a first-run redirect the way the Electron branch does.
          const saved = await loadWebConfig();
          setConfig(prev => ({ ...prev, ...saved, mode: saved.mode || "beta" }));
        }
      } catch (_) {
        // Dev mode — no Electron API, stay on Mode page
      } finally {
        setReady(true);
      }
    };
    init();
  }, []);

  // The shell historically loaded at `/`. Keep that entry point working while
  // giving the authenticated portal a stable `/studio` URL. `/workbench` is
  // retained as a bookmark-safe alias for the portal; the real Workbench
  // service remains under `/_svc/workbench/` and is never claimed here.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.pathname === "/" || url.pathname === LEGACY_PORTAL_PATH) {
      url.pathname = STUDIO_PATH;
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
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
    let requestId = 0;
    const refreshUser = async () => {
      const id = ++requestId;
      setCurrentUser(null);
      const user = await getCurrentUser();
      if (mounted && id === requestId) { setCurrentUser(user); setAuthChecked(true); }
    };
    refreshUser();
    const unsubscribe = onSessionChange(refreshUser);
    return () => { mounted = false; unsubscribe(); };
  }, []);

  // ─── Keep the access token from going stale while the app sits open ──
  // auth-service issues 15-minute access tokens (ACCESS_TOKEN_EXPIRE_MINUTES)
  // and nothing else in this app ever calls session.js's refresh() — every
  // sub-app that authenticates itself (Model Registry, RAG, etc.) reads the
  // same JWT straight out of localStorage on each request, with no 401-retry
  // of its own. Past 15 minutes on one page (Model Registry's "Failed to
  // fetch models: 401" is what surfaced this), that stale token 401s
  // everywhere at once. Refreshing well before expiry (5 min, a 3x margin)
  // keeps localStorage's token perpetually valid for every consumer of it,
  // without touching any of those other repos. No-ops (refresh() itself
  // checks) once the refresh token is gone (logged out) or itself expired.
  useEffect(() => {
    const tick = () => { if (getRefreshToken()) refresh(); };
    tick();
    const id = setInterval(tick, 5 * 60 * 1000);
    return () => clearInterval(id);
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

  // ─── Strip ?return_to= from the address bar once captured ──
  // Held in returnTo state (already captured via getSafeReturnTo's lazy
  // init above) until the redirect effect below actually uses it — this
  // just keeps it from lingering in the URL / replaying on reload.
  useEffect(() => {
    if (!returnTo) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("return_to");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);

  // ─── Redirect back to the originating service once signed in ──
  // Fires whenever both are true, whether currentUser resolved instantly
  // (already had a valid session) or only after the user just logged in —
  // both are the same "send them back now" case from here.
  useEffect(() => {
    if (returnTo && currentUser) {
      window.location.href = returnTo;
    }
  }, [returnTo, currentUser]);

  // Keep the nav item visible while signed out (or still loading) so there's
  // an entry point to sign in — only hide it once we positively know the
  // signed-in user lacks manage_roles.
  const showRolesNav = currentUser === null || currentUser.permissions?.includes("manage_roles");
  const nav = buildNav(showRolesNav);

  const pages = [
    <Mode      config={config} setConfig={setConfig} currentUser={currentUser} />,
    <LLM       config={config} setConfig={setConfig} currentUser={currentUser} />,
    <Cloud     config={config} setConfig={setConfig} currentUser={currentUser} />,
    <HPC       config={config} setConfig={setConfig} currentUser={currentUser} />,
    <Launch    config={config} onStatusChange={setSystemStatus} />,
    <Services  config={config} currentUser={currentUser} />,
    <Logs      />,
    <Studio />,
    <Settings  config={config} setConfig={setConfig} currentUser={currentUser} />,
    <Jobs         />,
    <IdeServices  currentUser={currentUser} />,
    <RoleManagement currentUser={currentUser} />,
    <Billing currentUser={currentUser} />,
    <Workbench state={workbenchState} onStateChange={setWorkbenchState}
      onOpen={(url, label, plugin) => setService({ url, label, source: "workbench", pluginSlug: plugin?.slug || null })} />,
    <Developer currentUser={currentUser} />,
    <AccountLayout activeSection="profile" onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      <Profile currentUser={currentUser} />
    </AccountLayout>,
    <AccountLayout activeSection="security" onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      <AccountSecurity key={`${currentUser?.userId ?? ""}:${currentUser?.email ?? ""}`} currentUser={currentUser} />
    </AccountLayout>,
    <AccountLayout activeSection="preferences" onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      <AccountPreferences />
    </AccountLayout>,
    null, // 18 — "Code" opens an external service directly (handleNavClick); never rendered as a page
    null, // 19 — "Workflows" opens an external service directly (handleNavClick); never rendered as a page
    <Projects />,
    <Artifacts />,
    <Explore />,
    <AccountLayout activeSection="notifications" onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      <AccountNotifications currentUser={currentUser} />
    </AccountLayout>,
    <AccountLayout activeSection="personalization" onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      <AccountPersonalization />
    </AccountLayout>,
    <AccountLayout activeSection="appearance" onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      <AccountAppearance />
    </AccountLayout>,
    <OrganizationConnections currentUser={currentUser} />,
  ];

  const currentName = service ? service.label : (PAGE_NAMES[step] || "—");
  const isWizardPage = !service && step <= WIZARD_MAX;

  function handleStudioClick() {
    const url = new URL(window.location.href);
    url.pathname = STUDIO_PATH;
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    setService(null);
    setStep(7); // return to Studio
  }

  function handleVideoBack() {
    const url = new URL(window.location.href);
    url.pathname = STUDIO_PATH;
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    setService(null);
    setStep(7);
  }

  function handleNavClick(idx) {
    const externalService = EXTERNAL_NAV_SERVICES[idx];
    if (externalService) {
      // Same Electron-vs-browser absolute URL resolution Studio.jsx's own
      // dashboard tiles already use for this exact pair of services --
      // Electron's <webview> needs a fully-qualified src, a browser tab
      // must stay same-origin relative so nginx-router still proxies it.
      let url = externalService.url;
      if (url.startsWith("/") && isElectron()) {
        const devHost = url.startsWith("/_svc/") && import.meta.env.DEV ? "http://localhost:5174" : "http://localhost";
        url = `${devHost}${url}`;
      }
      setService({ url, label: externalService.label });
      return;
    }
    if (idx === CONNECTIONS_PAGE || Object.values(ACCOUNT_PAGES).includes(idx) || service?.source === "workbench") setService(null);
    setStep(idx);
    if (idx === 7 || PAGE_TO_PATH[idx] !== undefined || KNOWN_PAGE_PATHS.includes(window.location.pathname)) {
      const url = new URL(window.location.href);
      url.pathname = PAGE_TO_PATH[idx] || STUDIO_PATH;
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  function handleModuleBack() {
    const url = new URL(window.location.href);
    url.pathname = STUDIO_PATH;
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    handleStudioClick();
  }

  // Electron webview bypasses Vite proxy for relative URLs; prefix /_svc/*
  // with the Vite dev server so the proxy routes them correctly.
  const resolveServiceUrl = (url) => {
    if (url && url.startsWith('/_svc/') && import.meta.env.DEV) {
      return `http://localhost:5174${url}`;
    }
    return url;
  };

  // ─── Don't render until config is loaded, and (web only) until we know ──
  // whether there's a valid session — Electron gates access via LicenseGate
  // instead, so it doesn't wait on authChecked.
  if (!ready || (!isElectron() && !authChecked)) {
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

  // Web only — Electron authenticates via LicenseGate's own license check.
  const showLogin = !isElectron() && !currentUser;

  return (
    <AppearanceProvider userId={currentUser?.userId}>
    <LicenseGate>
    <PreferencesProvider currentUser={currentUser}>
    {showLogin ? (
      <Login
        title="Welcome to OmniBioAI Studio"
        description="Sign in or enter your license key to access the platform"
      />
    ) : (
    <div style={{
      display:"flex", height:"100vh",
      background:"var(--bg)", color:"var(--text)",
      fontFamily:"var(--font)", overflow:"hidden",
    }}>
      {/* Sidebar — auto-hides when inside a service/app view (desktop);
          also force-collapsed below 768px via .studio-sidebar-wrap, where
          MobileNav's drawer is the nav surface instead (see index.css). */}
      <div className="studio-sidebar-wrap" style={{
        width: service ? 0 : 200,
        overflow: "hidden",
        transition: "width 0.2s ease",
        flexShrink: 0,
      }}>
        <Sidebar
          nav={nav} step={step} setStep={handleNavClick} systemStatus={systemStatus}
          isServiceView={!!service} onStudioClick={handleStudioClick}
          currentUser={currentUser} onProfileClick={() => handleNavClick(PROFILE_PAGE)}
          onSecurityClick={() => handleNavClick(SECURITY_PAGE)}
          onPreferencesClick={() => handleNavClick(PREFERENCES_PAGE)} isPreferencesActive={!service && step === PREFERENCES_PAGE}
          onPersonalizationClick={() => handleNavClick(PERSONALIZATION_PAGE)} isPersonalizationActive={!service && step === PERSONALIZATION_PAGE}
          onAppearanceClick={() => handleNavClick(APPEARANCE_PAGE)} isAppearanceActive={!service && step === APPEARANCE_PAGE}
          onNotificationsClick={() => handleNavClick(NOTIFICATIONS_PAGE)} isNotificationsActive={!service && step === NOTIFICATIONS_PAGE}
          isProfileActive={!service && step === PROFILE_PAGE} isSecurityActive={!service && step === SECURITY_PAGE}
        />
      </div>

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Update banner — shown at top when an update is available */}
        <UpdateBanner />

        {/* Topbar */}
        <div style={{
          minHeight:48, background:"var(--bg2)",
          borderBottom:"1px solid var(--border)",
          display:"flex", alignItems:"center", flexWrap:"wrap",
          padding:"8px 20px", gap:12, flexShrink:0,
        }}>
          {/* Mobile-only nav trigger — hidden on desktop via .studio-hamburger (index.css) */}
          <button
            className="studio-hamburger"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            aria-haspopup="dialog"
          >☰</button>

          <div style={{
            fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)",
            display:"flex", alignItems:"center", gap:6,
          }}>
            <span
              onClick={handleStudioClick}
              style={{ cursor:"pointer" }}
              title="Back to Studio"
            >studio</span>
            {" / "}
            {Object.values(ACCOUNT_PAGES).includes(step) && !service ? <><span>account</span>{" / "}</> : null}
            {step === CONNECTIONS_PAGE && !service ? <><span>organization</span>{" / "}</> : null}
            <span style={{ color:"var(--text)" }}>{step === CONNECTIONS_PAGE && !service ? "connections" : currentName}</span>
          </div>

          {/* First run warning — data_dir is an Electron-only concept (the
              local Docker stack's data directory). Beta/web mode connects to
              an already-running remote backend and never has one to set
              (see webApi.loadConfig() above), so it's excluded here rather
              than showing a "setup required" warning that doesn't apply. */}
          {config?.mode !== "beta" && !config?.settings?.data_dir && (
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

          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", flexWrap:"wrap", gap:8 }}>
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
            }}>v0.8.0</span>

            <span style={{
              fontFamily:"var(--mono)", fontSize:'var(--font-size-xs)', padding:"3px 8px",
              borderRadius:'var(--radius-xs)', letterSpacing:"0.08em",
              background:"rgba(255,107,53,0.12)", color:"var(--accent3)",
              border:"1px solid rgba(255,107,53,0.2)",
            }}>BETA</span>

            <a
              href="https://control.omnibioai.org"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily:"var(--mono)", fontSize:'var(--font-size-xs)', padding:"3px 8px",
                borderRadius:'var(--radius-xs)', letterSpacing:"0.08em",
                background:"rgba(255,255,255,0.05)", color:"var(--color-text-muted)",
                border:"1px solid rgba(255,255,255,0.08)",
                textDecoration:"none", whiteSpace:"nowrap",
              }}
            >Platform Health &rarr;</a>
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
              ? <Videos onBack={handleVideoBack} />
              : (service.url.includes("/_svc/monitor") || service.url.includes("localhost:3000"))
                ? <GrafanaViewer label={service.label} onBack={() => setService(null)} />
                : service.source === "workbench" && service.pluginSlug
                  ? <PluginPage slug={service.pluginSlug} url={service.url} label={service.label} backLabel={service.backLabel} onBack={() => setService(null)} />
                  : <ServiceViewer url={service.source === "workbench" ? service.url : resolveServiceUrl(service.url)} label={service.label}
                      backLabel={service.source === "workbench" ? "Back to Workbench" : undefined}
                      onBack={() => setService(null)} />
            : (
              <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
                {step === 7 || Object.values(ACCOUNT_PAGES).includes(step) ? null : (
                  <WorkbenchModuleHeader
                    title={PAGE_LABELS[step] || currentName}
                    onBack={handleModuleBack}
                  />
                )}
                {pages[step]}
              </div>
            )
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

      {/* MobileNav drawer — position:fixed, so it's out of the flex flow
          entirely; renders identically on desktop (just permanently closed
          since the hamburger that opens it is display:none there). */}
      <MobileNav
        nav={nav} step={step} setStep={handleNavClick} currentUser={currentUser}
        onProfileClick={() => handleNavClick(PROFILE_PAGE)} onSecurityClick={() => handleNavClick(SECURITY_PAGE)}
        onPreferencesClick={() => handleNavClick(PREFERENCES_PAGE)} isPreferencesActive={!service && step === PREFERENCES_PAGE}
        onPersonalizationClick={() => handleNavClick(PERSONALIZATION_PAGE)} isPersonalizationActive={!service && step === PERSONALIZATION_PAGE}
        onAppearanceClick={() => handleNavClick(APPEARANCE_PAGE)} isAppearanceActive={!service && step === APPEARANCE_PAGE}
        onNotificationsClick={() => handleNavClick(NOTIFICATIONS_PAGE)} isNotificationsActive={!service && step === NOTIFICATIONS_PAGE}
        isProfileActive={!service && step === PROFILE_PAGE} isSecurityActive={!service && step === SECURITY_PAGE}
        open={mobileNavOpen} onClose={() => setMobileNavOpen(false)}
      />
    </div>
    )}

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
    </PreferencesProvider>
    </LicenseGate>
    </AppearanceProvider>
  );
}
