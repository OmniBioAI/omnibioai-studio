import React, { useState, useEffect, useRef } from "react";
import LicenseGate  from "./components/LicenseGate";
import BugReport    from "./components/BugReport";
import Sidebar      from "./components/Sidebar";
import MobileNav    from "./components/MobileNav";
import StudioFooter from "./components/StudioFooter";
import UpdateBanner from "./components/UpdateBanner";
import Mode      from "./pages/Mode";
import LLM       from "./pages/LLM";
import Cloud     from "./pages/Cloud";
import HPC       from "./pages/HPC";
import Launch    from "./pages/Launch";
import Services  from "./pages/Services";
import Logs      from "./pages/Logs";
import Settings  from "./pages/Settings";
import Home from "./pages/Home";
import Workbench from "./pages/Workbench";
import Jobs      from "./pages/Jobs";
import Tools from "./pages/Tools";
import DataHub from "./pages/DataHub";
import SettingsHub from "./pages/SettingsHub";
import AllServices from "./pages/AllServices";
import ServiceViewer from "./pages/ServiceViewer";
import AIChatHub from "./pages/AIChatHub";
import PluginPage from "./pages/PluginPage";
import { resolveWorkbenchPluginDeepLink } from "./lib/pluginDeepLink";
import { STUDIO_VERSION_LABEL } from "./lib/appVersion";
import Videos        from "./pages/Videos";
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
import AccountPrivacy from "./pages/AccountPrivacy";
import AccountPlan from "./pages/AccountPlan";
import AccountStorage from "./pages/AccountStorage";
import AccountHelp from "./pages/AccountHelp";
import AccountMembershipStorage from "./pages/AccountMembershipStorage";
import Projects from "./pages/Projects";
import Artifacts from "./pages/Artifacts";
import Explore from "./pages/Explore";
import PluginsIntegrations from "./pages/PluginsIntegrations";
import StandaloneAppLaunch from "./pages/StandaloneAppLaunch";
import PreferencesProvider from "./components/PreferencesProvider";
import AppearanceProvider from "./components/AppearanceProvider";
import AccountLayout from "./components/AccountLayout";
import OAuthLinkConfirm from "./components/OAuthLinkConfirm";
import Login from "./components/Login";
import OmniBioAILogo from "./components/brand/OmniBioAILogo";
import ErrorBoundary from "./components/ErrorBoundary";
import { GrafanaViewer } from "./components/GrafanaViewer";
import * as session from "./lib/session";
const { getCurrentUser, onSessionChange, consumeOAuthRedirectParams, isElectron, refresh, getRefreshToken } = session;
import { loadConfig as loadWebConfig } from "./lib/web/webApi";
import { safeErrorMessage } from "./lib/safeErrorMessage";
import { openExternal } from "./lib/externalLink";
import { getStandaloneOnlyApp, standaloneAppUrl } from "./lib/standaloneApps";
import { canShowAdmin, filterAdminItems } from "./lib/adminNavigation";
import { ADMIN_ROUTE_DEFINITIONS, adminRouteForIndex, adminRouteForPath, canAccessAdminRoute } from "./lib/adminRoutes";
import {
  LEGACY_STUDIO_REDIRECTS,
  STUDIO_HOME_PATH,
  canonicalizeStudioLocation,
  isKnownStudioPath,
  listenForStudioNavigation,
  pathForStudioPage,
  pluginSlugFromStudioPath,
  studioPluginPath,
  writeStudioLocation,
} from "./lib/studioRouter";

export {
  pluginSlugFromStudioPath,
  studioPluginPath,
};
export const LEGACY_ACCOUNT_REDIRECTS = LEGACY_STUDIO_REDIRECTS;

// idx values: 0-17 are real `step` pages (see `pages` below); 18/19 are the
// Code/Workflows service aliases (never a real step -- see
// EXTERNAL_NAV_SERVICES); 20-22 are the new native Projects/Artifacts/Explore
// shells; -1/-2 are the unified AI chat entry and the retained Agent deep-link
// alias (both are service aliases, never real steps).
const ASK_NAV_IDX = -1;
const BIO_AGENT_NAV_IDX = -2;
const PROJECTS_PAGE = 20;
const ARTIFACTS_PAGE = 21;
const EXPLORE_PAGE = 22;
const INTEGRATIONS_PAGE = 30;
const MEMBERSHIP_PLANS_PAGE = 31;
const ADMIN_CONSOLE_PAGE = 33;
const PLUGINS_PAGE = 34;
const AGENTIC_PAGE = 35;
const OMICS_ANALYSIS_PAGE = 36;
const TOOLS_PAGE = 37;
const DATA_PAGE = 38;
const SETTINGS_HUB_PAGE = 39;
const ALL_SERVICES_PAGE = 40;

const BASE_NAV = [
  { section: null, items: [{ name:"Home", idx:7 }, { name:"Ask OmniBioAI", idx: ASK_NAV_IDX }] },
  { section: "WORK", items: [
    { name:"Projects",  idx: PROJECTS_PAGE },
    { name:"Code",      idx: 18 },
    { name:"Workflows", idx: 19 },
    { name:"Tools", idx: TOOLS_PAGE },
    { name:"Jobs",      idx: 9  },
    { name:"Data", idx: DATA_PAGE },
    { name:"Artifacts", idx: ARTIFACTS_PAGE },
  ]},
  { section: "DISCOVER", items: [
    { name:"Explore", idx: EXPLORE_PAGE },
    { name:"Plugins and integrations", idx: PLUGINS_PAGE },
    { name:"Omics and analysis", idx: OMICS_ANALYSIS_PAGE },
    { name:"Agentic", idx: AGENTIC_PAGE },
    { name:"All services", idx: ALL_SERVICES_PAGE },
  ]},
];

const ADMIN_NAV_ITEMS = ADMIN_ROUTE_DEFINITIONS.flatMap((route, index, routes) => [
  ...(index === 0 || route.group !== routes[index - 1].group ? [{ name: route.group, heading: true }] : []),
  route,
]);

export function buildNav(user) {
  if (!canShowAdmin(user)) return BASE_NAV;
  const items = [];
  let group = null;
  let children = [];
  const flush = () => {
    const visible = filterAdminItems(children, user);
    if (group && visible.length) items.push(group, ...visible);
  };
  for (const item of ADMIN_NAV_ITEMS) {
    if (item.heading) { flush(); group = { ...item, group: true }; children = []; }
    else {
      const { group: _group, ...navItem } = item;
      children.push(navItem);
    }
  }
  flush();
  return [...BASE_NAV, { section:"ADMIN", collapsed:true, items }];
}

const WIZARD_STEPS = ["Mode","LLM","Cloud","HPC","Launch"];
const WIZARD_MAX   = 4;

const PAGE_NAMES = [
  "mode","llm","cloud","hpc","launch",
  "services","logs","studio","settings","jobs",null,"roles","billing","workbench","developer","profile","security","preferences",
  "code","workflows", // 18/19 -- never a real `step` (see EXTERNAL_NAV_SERVICES); kept only so later indices stay aligned
  "projects","artifacts","explore","notifications","personalization","appearance","organization-connections",
  "privacy","plan","help","integrations","membership-plans","storage","admin-console",
  "plugins","agentic","omics-analysis","tools","data","settings","all-services",
];

const PAGE_LABELS = [
  "Mode", "LLM", "Cloud", "HPC", "Launch", "Services", "Logs",
  "Studio", "Settings", "Jobs", null, "Roles", "Organization plan", "Workbench", "API keys", "Profile", "Security", "Preferences",
  "Code", "Workflows",
  "Projects", "Artifacts", "Explore", null, null, null, "Connections",
  "Privacy & data", "Usage", "Help & support", "Integrations", null, "Membership & storage", "Admin Console",
  "Plugins and integrations", "Agentic", "Omics and analysis", "Tools", "Data", "Settings", "All services",
];

const STUDIO_PATH = STUDIO_HOME_PATH;
const PROFILE_PAGE = 15;
const SECURITY_PAGE = 16;
const PREFERENCES_PAGE = 17;
const NOTIFICATIONS_PAGE = 23;
const PERSONALIZATION_PAGE = 24;
const APPEARANCE_PAGE = 25;
const CONNECTIONS_PAGE = 26;
const PRIVACY_PAGE = 27;
const PLAN_PAGE = 28;
const STORAGE_PAGE = 32;
const HELP_PAGE = 29;
const ACCOUNT_PAGES = { profile: PROFILE_PAGE, security: SECURITY_PAGE, preferences: PREFERENCES_PAGE, privacy: PRIVACY_PAGE, membership: STORAGE_PAGE, billing: 12, usage: PLAN_PAGE, "api-keys": 14, "members-roles": 11, help: HELP_PAGE };
const VIDEO_STUDIO_PATH = "/studio/videos";

export function resolveInitialPage() {
  return canonicalizeStudioLocation().page;
}

function canAccessPage(user, page) {
  const route = adminRouteForIndex(page);
  return !route || canAccessAdminRoute(user, route);
}

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
  // One Studio entry hosts two isolated existing services as tabs. Ask opens
  // Dev Hub's chat deep link; old Agent navigation/deep links select its tab.
  [ASK_NAV_IDX]: { source: "ai-chat-hub", label: "Ask OmniBioAI", initialMode: "ask" },
  [BIO_AGENT_NAV_IDX]: { source: "ai-chat-hub", label: "Ask OmniBioAI", initialMode: "agent" },
  ...Object.fromEntries(ADMIN_ROUTE_DEFINITIONS.filter(route => route.oldUrl).map(route => [route.idx, { url: route.oldUrl, label: route.name }])),
};

function getInitialService() {
  const adminRoute = typeof window !== "undefined" ? adminRouteForPath(window.location.pathname) : null;
  if (adminRoute?.oldUrl) return { url: adminRoute.oldUrl, label: adminRoute.name };
  const pluginService = typeof window !== "undefined"
    ? resolveWorkbenchPluginDeepLink(window.location.search)
    : null;
  if (pluginService?.pluginSlug === "bio_agent") {
    return { source: "ai-chat-hub", label: "Ask OmniBioAI", initialMode: "agent", returnToWorkbench: true };
  }
  if (pluginService) return pluginService;
  if (typeof window !== "undefined" && window.location.pathname === VIDEO_STUDIO_PATH) {
    return { url: "/_svc/videos", label: "Videos" };
  }
  const slug = typeof window !== "undefined" ? pluginSlugFromStudioPath(window.location.pathname) : null;
  if (slug === "bio_agent") {
    return { source: "ai-chat-hub", label: "Ask OmniBioAI", initialMode: "agent", returnToWorkbench: true };
  }
  if (slug) {
    return {
      url: `/_svc/workbench/plugins/${slug}/`,
      label: slug.replaceAll("_", " "),
      source: "workbench",
      pluginSlug: slug,
      initialRunId: new URLSearchParams(window.location.search).get("run_id") || "",
      backLabel: "Back to Workbench",
    };
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
  const [step,         setStep]         = useState(resolveInitialPage);
  const [systemStatus, setSystemStatus] = useState("idle");
  const [ready,        setReady]        = useState(false);
  const [config,       setConfig]       = useState({
    mode: "beta", llm: {}, cloud: {}, hpc: {}, settings: {},
  });
  const [service, setServiceState] = useState(getInitialService); // { url, label } when viewing a service
  const serviceOpenId = useRef(0);
  function setService(next) {
    // A deliberate open (including the same URL) starts a new document.
    // Ordinary renders retain the key and the active workspace's state.
    setServiceState(next ? { ...next, openId: ++serviceOpenId.current } : null);
  }
  const [workbenchState, setWorkbenchState] = useState({ query: "", category: "__all__", focusSlug: null });
  const [pluginReturnPage, setPluginReturnPage] = useState(13);
  const [currentUser,  setCurrentUser]  = useState(null); // decoded JWT claims, or null if signed out
  const [accountIdentity, setAccountIdentity] = useState(null);
  const [authChecked,  setAuthChecked]  = useState(false); // has the initial session check resolved?
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
              setStep(SETTINGS_HUB_PAGE);
            }
          } else {
            // No config at all → first run → Settings
            setStep(SETTINGS_HUB_PAGE);
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

  useEffect(() => {
    let active = true;
    if (!currentUser) { setAccountIdentity(null); return undefined; }
    if (typeof session.getIdentity !== "function") { setAccountIdentity({ organizations: [] }); return undefined; }
    session.getIdentity().then(value => { if (active) setAccountIdentity(value); }).catch(() => { if (active) setAccountIdentity({ organizations: [] }); });
    return () => { active = false; };
  }, [currentUser?.userId]);

  // Browser back/forward is routed through the same route registry as clicks.
  useEffect(() => {
    return listenForStudioNavigation(route => {
      setStep(route.page);
      setService(route.pluginSlug ? getInitialService() : null);
    });
  }, []);

  // ─── Listen for navigate events (from Workbench page) ──
  useEffect(() => {
    const handler = (e) => handleNavClick(e.detail === 10 ? 4 : e.detail);
    window.addEventListener("navigate", handler);
    return () => window.removeEventListener("navigate", handler);
  }, [currentUser]);

  // ─── Listen for service open events (from Workbench tiles) ──
  useEffect(() => {
    const handler = (e) => {
      const serviceUrl = e.detail?.url;
      if (getStandaloneOnlyApp(serviceUrl)) {
        openExternal(standaloneAppUrl(serviceUrl));
        setService(null);
        return;
      }
      if (typeof serviceUrl === "string" && /\/plugins\/bio_agent\/?(?:\?.*)?$/.test(serviceUrl)) {
        setService({ source: "ai-chat-hub", label: "Ask OmniBioAI", initialMode: "agent" });
        return;
      }
      setService(e.detail);
    };
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
  // API consumers share the active session. The web build refreshes its
  // browser session; Electron refreshes through main-process-owned storage.
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

  const nav = buildNav(currentUser);

  const pages = [
    <Mode      config={config} setConfig={setConfig} currentUser={currentUser} />,
    <LLM       config={config} setConfig={setConfig} currentUser={currentUser} />,
    <Cloud     config={config} setConfig={setConfig} currentUser={currentUser} />,
    <HPC       config={config} setConfig={setConfig} currentUser={currentUser} />,
    <Launch    config={config} onStatusChange={setSystemStatus} />,
    <Services  config={config} currentUser={currentUser} />,
    <Logs      />,
    <Home currentUser={currentUser} />,
    <Settings  config={config} setConfig={setConfig} currentUser={currentUser} />,
    <Jobs         />,
    null, // 10 — retired IDE Services slot; keep later page indices stable
    <AccountLayout activeSection="members-roles" currentUser={currentUser} identity={accountIdentity} onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      <RoleManagement currentUser={currentUser} />
    </AccountLayout>,
    <AccountLayout activeSection="billing" currentUser={currentUser} identity={accountIdentity} onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      {({ organizationId }) => <Billing currentUser={currentUser} organizationId={organizationId} onMembershipPlans={() => handleNavClick(STORAGE_PAGE)} onStorage={() => handleNavClick(STORAGE_PAGE)} />}
    </AccountLayout>,
    <Workbench state={workbenchState} onStateChange={setWorkbenchState}
      onOpen={openWorkbenchPlugin} />,
    <AccountLayout activeSection="api-keys" currentUser={currentUser} identity={accountIdentity} onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      {({ organizationId }) => <Developer currentUser={{ ...currentUser, orgId: organizationId || currentUser?.orgId }} />}
    </AccountLayout>,
    <AccountLayout activeSection="profile" currentUser={currentUser} identity={accountIdentity} onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      <Profile currentUser={currentUser} onOrganizationPlan={() => handleNavClick(12)} />
    </AccountLayout>,
    <AccountLayout activeSection="security" currentUser={currentUser} identity={accountIdentity} onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      <AccountSecurity key={`${currentUser?.userId ?? ""}:${currentUser?.email ?? ""}`} currentUser={currentUser} />
    </AccountLayout>,
    <AccountLayout activeSection="preferences" currentUser={currentUser} identity={accountIdentity} onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      <AccountPreferences />
      <AccountAppearance />
      <AccountPersonalization />
      <AccountNotifications currentUser={currentUser} />
    </AccountLayout>,
    null, // 18 — "Code" opens an external service directly (handleNavClick); never rendered as a page
    null, // 19 — "Workflows" opens an external service directly (handleNavClick); never rendered as a page
    <Projects />,
    <Artifacts />,
    <Explore onOpen={(destination, resource) => {
      if (destination?.kind === "navigate") handleNavClick(destination.page);
      else if (destination?.kind === "service") setService({ url: destination.url, label: destination.label || resource?.name, source: resource?.source });
    }} />,
    null,
    null,
    null,
    <OrganizationConnections currentUser={currentUser} />,
    <AccountLayout activeSection="privacy" currentUser={currentUser} identity={accountIdentity} onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      <AccountPrivacy />
    </AccountLayout>,
    <AccountLayout activeSection="usage" currentUser={currentUser} identity={accountIdentity} onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      {({ organizationId }) => <Billing currentUser={currentUser} organizationId={organizationId} view="usage" />}
    </AccountLayout>,
    <AccountLayout activeSection="help" currentUser={currentUser} identity={accountIdentity} onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      <AccountHelp />
    </AccountLayout>,
    null, // 30 — legacy Integrations URL redirects to the combined discovery page
    null,
    <AccountLayout activeSection="membership" currentUser={currentUser} identity={accountIdentity} onNavigate={section => handleNavClick(ACCOUNT_PAGES[section])}>
      <AccountMembershipStorage currentUser={currentUser} />
    </AccountLayout>,
    <StandaloneAppLaunch />,
    <PluginsIntegrations state={workbenchState} onStateChange={setWorkbenchState} onOpen={openWorkbenchPlugin}
      onOrganizationConnections={() => handleNavClick(CONNECTIONS_PAGE)} />,
    <Workbench view="agentic" state={workbenchState} onStateChange={setWorkbenchState}
      onOpen={openWorkbenchPlugin} />,
    <Workbench view="omics" state={workbenchState} onStateChange={setWorkbenchState}
      onOpen={openWorkbenchPlugin} />,
    <Tools initialQuery={new URLSearchParams(window.location.search).get("q") || ""} onOpenJobs={() => handleNavClick(9)} />,
    <DataHub />,
    <SettingsHub config={config} setConfig={setConfig} currentUser={currentUser} initialTab={new URLSearchParams(window.location.search).get("tab") || "General"} />,
    <AllServices currentUser={currentUser} />,
  ];

  const currentName = service ? service.label : (PAGE_NAMES[step] || "—");
  const isWizardPage = !service && step <= WIZARD_MAX;

  function handleStudioClick() {
    writeStudioLocation(STUDIO_PATH);
    setService(null);
    setStep(7); // return to Studio
  }

  function handleVideoBack() {
    writeStudioLocation(STUDIO_PATH);
    setService(null);
    setStep(7);
  }

  function openWorkbenchPlugin(url, label, plugin) {
    const slug = plugin?.slug;
    if (!slug) return;
    setPluginReturnPage([PLUGINS_PAGE, AGENTIC_PAGE, OMICS_ANALYSIS_PAGE].includes(step) ? step : 13);
    writeStudioLocation(studioPluginPath(slug), { preserveSearch: false });
    if (slug === "bio_agent") {
      setService({ source: "ai-chat-hub", label: "Ask OmniBioAI", initialMode: "agent", returnToWorkbench: true });
      return;
    }
    setService({ url, label, source: "workbench", pluginSlug: slug });
  }

  function handlePluginBack() {
    writeStudioLocation(pathForStudioPage(pluginReturnPage), { preserveSearch: false });
    setService(null);
    setStep(pluginReturnPage);
  }

  function handleNavClick(idx) {
    const adminRoute = adminRouteForIndex(idx);
    if (adminRoute && !canAccessAdminRoute(currentUser, adminRoute)) {
      setService(null);
      setStep(7);
      const url = new URL(window.location.href);
      url.pathname = STUDIO_PATH;
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      return;
    }
    const externalService = EXTERNAL_NAV_SERVICES[idx];
    if (externalService) {
      if (externalService.source === "ai-chat-hub") {
        setService(externalService);
        return;
      }
      // Same Electron-vs-browser absolute URL resolution Studio.jsx's own
      // dashboard tiles already use for this exact pair of services --
      // Electron's <webview> needs a fully-qualified src, a browser tab
      // must stay same-origin relative so nginx-router still proxies it.
      let url = externalService.url;
      if (url.startsWith("/") && isElectron()) {
        const devHost = url.startsWith("/_svc/") && import.meta.env.DEV ? "http://localhost:5174" : "http://localhost";
        url = `${devHost}${url}`;
      }
      if (adminRoute) writeStudioLocation(adminRoute.path);
      setService({ ...externalService, url });
      return;
    }
    setService(null);
    if ([PLUGINS_PAGE, AGENTIC_PAGE, OMICS_ANALYSIS_PAGE].includes(idx)) {
      setWorkbenchState({ query: "", category: "__all__", focusSlug: null });
    }
    setStep(idx);
    const targetPath = adminRoute?.path || pathForStudioPage(idx);
    if (idx === 7 || targetPath !== STUDIO_PATH || isKnownStudioPath(window.location.pathname)) {
      writeStudioLocation(targetPath);
    }
  }

  useEffect(() => {
    const adminRoute = adminRouteForIndex(step);
    if (authChecked && currentUser && adminRoute && !canAccessAdminRoute(currentUser, adminRoute)) {
      handleNavClick(7);
    }
  }, [authChecked, currentUser, step]);

  // Electron webview bypasses Vite proxy for relative URLs; prefix /_svc/*
  // with the Vite dev server so the proxy routes them correctly.
  const resolveServiceUrl = (url) => {
    if (url && url.startsWith('/_svc/') && import.meta.env.DEV) {
      return `http://localhost:5174${url}`;
    }
    return url;
  };

  // Do not flash authenticated content or the sign-in form while a protected
  // desktop session is still being restored.
  if (!ready || !authChecked) {
    return (
      <div style={{
        display:"flex", height:"100vh",
        alignItems:"center", justifyContent:"center",
        background:"var(--bg)", flexDirection:"column", gap:12,
      }}>
        <OmniBioAILogo variant="mark" size="lg" />
        <div style={{ fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)" }}>
          Loading configuration...
        </div>
      </div>
    );
  }

  // A desktop license is an entitlement, not an identity session. After the
  // license gate succeeds, Electron must still establish the main-owned Auth
  // session used by role- and organization-scoped features.
  const showLogin = !currentUser;

  return (
    <AppearanceProvider userId={currentUser?.userId}>
    <LicenseGate>
    <PreferencesProvider currentUser={currentUser}>
    {showLogin ? (
      <Login
        title="Welcome to OmniBioAI Studio"
        description={isElectron()
          ? "Sign in to establish a protected desktop session"
          : "Sign in or enter your license key to access the platform"}
        accountOnly={isElectron()}
      />
    ) : (
    <div style={{
      display:"flex", height:"100vh",
      background:"var(--bg)", color:"var(--text)",
      fontFamily:"var(--font)", overflow:"hidden",
    }}>
      <a href="#main-content" className="skip-to-content">Skip to content</a>
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
          onPrivacyClick={() => handleNavClick(PRIVACY_PAGE)} isPrivacyActive={!service && step === PRIVACY_PAGE}
          onPlanClick={() => handleNavClick(PLAN_PAGE)} isPlanActive={!service && step === PLAN_PAGE}
          onStorageClick={() => handleNavClick(STORAGE_PAGE)} isStorageActive={!service && step === STORAGE_PAGE}
          onHelpClick={() => handleNavClick(HELP_PAGE)} isHelpActive={!service && step === HELP_PAGE}
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
            <button type="button" className="studio-breadcrumb-link"
              onClick={handleStudioClick}
              title="Back to Studio"
            >studio</button>
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
            }} onClick={() => handleNavClick(SETTINGS_HUB_PAGE)}>
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
            }}>{STUDIO_VERSION_LABEL}</span>

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
                minWidth:44, minHeight:44, display:"inline-flex", alignItems:"center",
                fontFamily:"var(--mono)", fontSize:'var(--font-size-xs)', padding:"3px 8px",
                borderRadius:'var(--radius-xs)', letterSpacing:"0.08em",
                background:"rgba(255,255,255,0.05)", color:"var(--color-text-muted)",
                border:"1px solid rgba(255,255,255,0.08)",
                textDecoration:"none", whiteSpace:"nowrap",
              }}
            >Platform Health &rarr;</a>
            <BugReport />
          </div>
        </div>

        {/* Page Content */}
        <main id="main-content" tabIndex={-1} style={{
          flex:1, overflow:"hidden", display:"flex", flexDirection:"column",
          ...(service ? {} : { overflowY:"auto", padding:20 }),
          scrollbarWidth:"thin",
          scrollbarColor:"var(--border2) transparent",
        }}>
          <ErrorBoundary key={service?.openId || `page-${step}`} compact onReset={handleStudioClick}>
          {service && canAccessPage(currentUser, step)
            ? service.source === "ai-chat-hub"
              ? <AIChatHub key={service.openId} initialMode={service.initialMode} onBack={() => service.returnToWorkbench ? handlePluginBack() : setService(null)} />
              : service.url.includes("/_svc/videos")
                ? <Videos onBack={handleVideoBack} />
              : (service.url.includes("/_svc/monitor") || service.url.includes("localhost:3000"))
                ? <GrafanaViewer label={service.label} onBack={() => setService(null)} />
                : service.source === "workbench" && service.pluginSlug
                  ? <PluginPage slug={service.pluginSlug} url={service.url} label={service.label} initialRunId={service.initialRunId} backLabel={service.backLabel} onBack={handlePluginBack} />
                  : <ServiceViewer key={service.openId} url={service.source === "workbench" ? service.url : resolveServiceUrl(service.url)} label={service.label}
                      backLabel={service.source === "workbench" ? "Back to Workbench" : undefined}
                      onBack={() => setService(null)} />
            : (
              <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
                {canAccessPage(currentUser, step) ? pages[step] : pages[7]}
              </div>
            )
          }
          </ErrorBoundary>
        </main>

        {/* Wizard Nav — only for setup pages */}
        {isWizardPage && (
          <div style={{
            height:52, background:"var(--bg2)",
            borderTop:"1px solid var(--border)",
            display:"flex", alignItems:"center",
            padding:"0 20px", gap:10, flexShrink:0,
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, flex:1 }}>
              {WIZARD_STEPS.map((name, i) => canAccessPage(currentUser, i) && (
                <div
                  key={i}
                  onClick={() => handleNavClick(i)}
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
              onClick={() => handleNavClick(Math.min(canAccessPage(currentUser, WIZARD_MAX) ? WIZARD_MAX : WIZARD_MAX - 1, step + 1))}
              disabled={step === (canAccessPage(currentUser, WIZARD_MAX) ? WIZARD_MAX : WIZARD_MAX - 1)}
              style={{
                padding:"7px 16px", borderRadius:'var(--radius-sm)', fontSize:'var(--font-size-xs)',
                fontFamily:"var(--font)", fontWeight:500,
                cursor: step === (canAccessPage(currentUser, WIZARD_MAX) ? WIZARD_MAX : WIZARD_MAX - 1) ? "not-allowed" : "pointer",
                opacity: step === (canAccessPage(currentUser, WIZARD_MAX) ? WIZARD_MAX : WIZARD_MAX - 1) ? 0.4 : 1,
                background:"var(--accent)", border:"none",
                color:"#000", transition:"all 0.15s",
              }}
            >Next →</button>
          </div>
        )}

        <StudioFooter
          onHelpClick={() => handleNavClick(HELP_PAGE)}
          onPrivacyClick={() => handleNavClick(PRIVACY_PAGE)}
        />
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
        onPrivacyClick={() => handleNavClick(PRIVACY_PAGE)} isPrivacyActive={!service && step === PRIVACY_PAGE}
        onPlanClick={() => handleNavClick(PLAN_PAGE)} isPlanActive={!service && step === PLAN_PAGE}
        onStorageClick={() => handleNavClick(STORAGE_PAGE)} isStorageActive={!service && step === STORAGE_PAGE}
        onHelpClick={() => handleNavClick(HELP_PAGE)} isHelpActive={!service && step === HELP_PAGE}
        isProfileActive={!service && step === PROFILE_PAGE} isSecurityActive={!service && step === SECURITY_PAGE}
        open={mobileNavOpen} onClose={() => setMobileNavOpen(false)}
      />
      <span
        className="studio-visually-hidden"
        tabIndex={0}
        onFocus={() => document.querySelector(".skip-to-content")?.focus()}
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
          <div style={{ flex: 1 }}>{safeErrorMessage(oauthNotice, "Sign-in could not be completed. Please try again.")}</div>
          <div style={{ cursor: "pointer" }} onClick={() => setOauthNotice(null)}>✕</div>
        </div>
      )}

    </PreferencesProvider>
    </LicenseGate>
    </AppearanceProvider>
  );
}
