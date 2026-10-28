export const EMBED_READY_EVENT = "omnibioai.embed.ready.v1";
export const EMBED_THEME_EVENT = "omnibioai.theme.set.v1";

const ALLOWED = {
  theme: new Set(["light", "dark"]),
  accent: new Set(["teal", "blue", "purple", "orange"]),
  density: new Set(["comfortable", "compact"]),
  motion: new Set(["system", "reduce"]),
};

const DEFAULTS = { theme: "dark", accent: "teal", density: "comfortable", motion: "system" };
const SENSITIVE_QUERY_KEY = /token|secret|password|credential|authorization|auth|session|user|email|api[_-]?key|organization|account/i;

export function createEmbedAppearance(appearance = {}) {
  return Object.fromEntries(Object.keys(DEFAULTS).map((key) => [
    key,
    ALLOWED[key].has(appearance[key]) ? appearance[key] : DEFAULTS[key],
  ]));
}

export function createThemeSetMessage(appearance) {
  return { type: EMBED_THEME_EVENT, ...createEmbedAppearance(appearance) };
}

export function buildEmbeddedUrl(url, appearance, baseUrl = globalThis.location?.href || "http://localhost/") {
  const target = new URL(url, baseUrl);
  for (const key of [...target.searchParams.keys()]) {
    if (key.startsWith("obai_") || SENSITIVE_QUERY_KEY.test(key)) target.searchParams.delete(key);
  }
  const snapshot = createEmbedAppearance(appearance);
  target.searchParams.set("obai_theme", snapshot.theme);
  target.searchParams.set("obai_accent", snapshot.accent);
  target.searchParams.set("obai_density", snapshot.density);
  target.searchParams.set("obai_motion", snapshot.motion);
  return target.href;
}

export function getExactOrigin(url, baseUrl = globalThis.location?.href || "http://localhost/") {
  return new URL(url, baseUrl).origin;
}
