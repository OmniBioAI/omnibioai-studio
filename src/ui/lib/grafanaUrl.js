const GRAFANA_THEMES = new Set(["light", "dark"]);

export function buildGrafanaUrl(url, theme, baseUrl = globalThis.location?.href || "http://localhost/") {
  const target = new URL(url, baseUrl);
  if (GRAFANA_THEMES.has(theme)) target.searchParams.set("theme", theme);
  return /^[a-z][a-z\d+.-]*:/i.test(url)
    ? target.href
    : `${target.pathname}${target.search}${target.hash}`;
}
