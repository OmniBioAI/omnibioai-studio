const PLUGIN_SLUG = /^[a-z0-9][a-z0-9_-]*$/;

export function resolveWorkbenchPluginDeepLink(search = "") {
  const params = new URLSearchParams(search);
  const pluginValues = params.getAll("plugin");
  if (pluginValues.length !== 1) return null;
  const [slug] = pluginValues;
  if (!slug || !PLUGIN_SLUG.test(slug)) return null;

  const label = slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join(" ");

  return {
    url: `/_svc/workbench/plugins/${slug}/`,
    label,
    source: "workbench",
    pluginSlug: slug,
    backLabel: "Back to Studio",
  };
}
