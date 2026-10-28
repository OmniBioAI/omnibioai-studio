const STANDALONE_ONLY_APPS = [
  { origin: "https://admin.omnibioai.org", label: "Admin Console" },
];

export function getStandaloneOnlyApp(url, base = globalThis.location?.origin || "https://studio.omnibioai.org") {
  let origin;
  try {
    origin = new URL(url, base).origin;
  } catch {
    return null;
  }
  return STANDALONE_ONLY_APPS.find(app => app.origin === origin) || null;
}

export function standaloneAppUrl(url, theme = "dark", base = globalThis.location?.origin || "https://studio.omnibioai.org") {
  const target = new URL(url, base);
  const app = getStandaloneOnlyApp(target.href, base);
  if (app?.origin === "https://admin.omnibioai.org") {
    target.search = "";
    target.searchParams.set("obai_theme", theme === "light" ? "light" : "dark");
  }
  return target.toString();
}
