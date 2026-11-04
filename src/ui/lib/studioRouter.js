export const STUDIO_HOME_PATH = "/studio";
export const LEGACY_PORTAL_PATH = "/workbench";

const PLUGIN_PATH = /^\/studio\/plugins\/([a-z0-9][a-z0-9_-]*)\/?$/;

export const STUDIO_ROUTES = Object.freeze([
  ["/studio/account/organization/members-roles", 11],
  ["/studio/account/organization/billing", 12],
  ["/studio/account/organization/api-keys", 14],
  ["/studio/account/profile", 15],
  ["/studio/account/security", 16],
  ["/studio/account/preferences", 17],
  ["/studio/projects", 20],
  ["/studio/artifacts", 21],
  ["/studio/explore", 22],
  ["/studio/organization/connections", 26],
  ["/studio/account/privacy-data", 27],
  ["/studio/account/organization/usage", 28],
  ["/studio/account/help", 29],
  ["/studio/account/membership-storage", 32],
  ["/studio/admin", 33],
  ["/studio/plugins", 34],
  ["/studio/agentic", 35],
  ["/studio/omics-analysis", 36],
  ["/studio/tools", 37],
  ["/studio/data", 38],
  ["/studio/settings", 39],
  ["/studio/services", 40],
  ["/studio/jobs", 9],
  ["/studio/workbench", 13],
]);

export const LEGACY_STUDIO_REDIRECTS = Object.freeze({
  "/": STUDIO_HOME_PATH,
  [LEGACY_PORTAL_PATH]: STUDIO_HOME_PATH,
  "/studio/billing": "/studio/account/organization/billing",
  "/studio/developer": "/studio/account/organization/api-keys",
  "/studio/profile": "/studio/account/profile",
  "/studio/security": "/studio/account/security",
  "/studio/preferences": "/studio/account/preferences",
  "/studio/appearance": "/studio/account/preferences",
  "/studio/personalization": "/studio/account/preferences",
  "/studio/notifications": "/studio/account/preferences",
  "/studio/privacy": "/studio/account/privacy-data",
  "/studio/plan": "/studio/account/membership-storage",
  "/studio/storage": "/studio/account/membership-storage",
  "/studio/billing/plans": "/studio/account/membership-storage",
  "/studio/help": "/studio/account/help",
  "/studio/admin-console": "/studio/admin",
  "/studio/integrations": "/studio/plugins?view=integrations",
});

const PATH_TO_PAGE = new Map(STUDIO_ROUTES);
const PAGE_TO_PATH = new Map(STUDIO_ROUTES.map(([path, page]) => [page, path]));

export function pluginSlugFromStudioPath(pathname) {
  return PLUGIN_PATH.exec(pathname || "")?.[1] || null;
}

export function studioPluginPath(slug) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug || "")) throw new Error("Invalid plugin slug.");
  return `/studio/plugins/${slug}`;
}

export function pathForStudioPage(page) {
  return PAGE_TO_PATH.get(page) || STUDIO_HOME_PATH;
}

export function isKnownStudioPath(pathname) {
  return pathname === STUDIO_HOME_PATH || PATH_TO_PAGE.has(pathname) || PLUGIN_PATH.test(pathname || "");
}

export function resolveStudioLocation(location = window.location) {
  const pathname = location.pathname || STUDIO_HOME_PATH;
  const redirectTo = LEGACY_STUDIO_REDIRECTS[pathname] || null;
  const canonicalPath = redirectTo ? new URL(redirectTo, location.origin || window.location.origin).pathname : pathname;
  const pluginSlug = pluginSlugFromStudioPath(canonicalPath);
  return {
    page: pluginSlug ? 13 : (PATH_TO_PAGE.get(canonicalPath) ?? 7),
    pathname: canonicalPath,
    pluginSlug,
    redirectTo,
  };
}

export function writeStudioLocation(pathname, { replace = false, preserveSearch = true } = {}) {
  const url = new URL(window.location.href);
  const target = new URL(pathname, url.origin);
  url.pathname = target.pathname;
  for (const [key, value] of target.searchParams) url.searchParams.set(key, value);
  if (!preserveSearch) {
    url.search = "";
    url.hash = "";
  }
  const method = replace ? "replaceState" : "pushState";
  window.history[method](window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function canonicalizeStudioLocation() {
  const route = resolveStudioLocation();
  if (route.redirectTo) writeStudioLocation(route.redirectTo, { replace: true });
  return route;
}

export function listenForStudioNavigation(listener) {
  const handlePopState = () => listener(resolveStudioLocation());
  window.addEventListener("popstate", handlePopState);
  return () => window.removeEventListener("popstate", handlePopState);
}
