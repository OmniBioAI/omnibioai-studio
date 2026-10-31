import React, { useCallback, useEffect, useMemo, useState } from "react";
import { nativePluginRequest } from "../../lib/nativePluginApi";
import "./NativeAdminRenderers.css";

export default function PluginManagerRenderer() {
  const [plugins, setPlugins] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try { const result = await nativePluginRequest("/plugins/plugin_manager/api/catalog/"); setPlugins(result.plugins || []); setCategories(result.categories || []); setError(""); }
    catch (failure) { setError(failure.message || "Could not load the plugin registry."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return plugins.filter(plugin => (!category || plugin.category === category) && (!needle || [plugin.name, plugin.slug, plugin.category, plugin.description].join(" ").toLowerCase().includes(needle)));
  }, [plugins, category, query]);

  async function updateOne(plugin) {
    const enabled = !plugin.enabled;
    if (!window.confirm(`${enabled ? "Enable" : "Disable"} ${plugin.slug}? Restart is required for the change to take full effect.`)) return;
    setBusy(plugin.slug); setError(""); setNotice("");
    try { const result = await nativePluginRequest(`/plugins/plugin_manager/api/toggle/${encodeURIComponent(plugin.slug)}/`, { method: "POST", body: { enabled } });
      setPlugins(items => items.map(item => item.slug === plugin.slug ? { ...item, enabled } : item));
      setNotice(`${plugin.slug} ${enabled ? "enabled" : "disabled"}. Restart the Workbench to apply it.`);
    } catch (failure) { setError(failure.message || "Could not update plugin state."); }
    finally { setBusy(""); }
  }

  async function bulk(action, mode, selectedCategory = "") {
    const target = mode === "all" ? "all plugins" : `the ${selectedCategory} category`;
    if (!window.confirm(`${action === "enable" ? "Enable" : "Disable"} ${target}? Restart is required for the change to take full effect.`)) return;
    setBusy("bulk"); setError(""); setNotice("");
    try { const result = await nativePluginRequest("/plugins/plugin_manager/api/bulk/", { method: "POST", body: { action, mode, ...(mode === "category" ? { category: selectedCategory } : {}) } });
      setNotice(`${action === "enable" ? "Enabled" : "Disabled"} ${result.updated} plugin(s). Restart the Workbench to apply the changes.`);
      await refresh();
      if (result.errors?.length) setError(`${result.errors.length} plugin(s) could not be updated: ${result.errors.slice(0, 3).join("; ")}`);
    } catch (failure) { setError(failure.message || "Could not update plugins."); }
    finally { setBusy(""); }
  }

  return <section className="native-admin-page" aria-label="Plugin Manager">
    <header className="native-admin-heading"><div><span className="native-admin-eyebrow">WORKBENCH ADMIN</span><h2>Plugin Manager</h2><p>Enable or disable registered plugins and open active tools.</p></div>
      <button className="omni-btn omni-btn--secondary" type="button" onClick={refresh} disabled={loading || Boolean(busy)}>Refresh</button></header>
    <p className="native-admin-note"><strong>Restart required:</strong> registry changes are saved immediately; the running Workbench loads them after restart.</p>
    {notice && <p className="native-admin-success" role="status">{notice}</p>}{error && <p className="plugin-error" role="alert">{error}</p>}
    <div className="native-admin-bulk">
      <div><button className="omni-btn omni-btn--primary" type="button" disabled={Boolean(busy)} onClick={() => bulk("enable", "all")}>Enable all</button>
        <button className="omni-btn omni-btn--danger" type="button" disabled={Boolean(busy)} onClick={() => bulk("disable", "all")}>Disable all</button></div>
      <div><label className="workbench-sr-only" htmlFor="plugin-manager-bulk-category">Bulk category</label><select id="plugin-manager-bulk-category" value={bulkCategory} onChange={event => setBulkCategory(event.target.value)}>
        <option value="">Select category</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select>
        <button className="omni-btn omni-btn--secondary" type="button" disabled={!bulkCategory || Boolean(busy)} onClick={() => bulk("enable", "category", bulkCategory)}>Enable category</button>
        <button className="omni-btn omni-btn--danger" type="button" disabled={!bulkCategory || Boolean(busy)} onClick={() => bulk("disable", "category", bulkCategory)}>Disable category</button></div>
    </div>
    <div className="native-admin-toolbar"><label>Search plugins<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, slug, category…" /></label>
      <label>Category<select aria-label="Filter plugin category" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <span>{loading ? "Loading registry…" : `${visible.length} of ${plugins.length} plugins`}</span></div>
    {loading && !plugins.length ? <p role="status">Loading plugin registry…</p> : null}
    {!loading && !visible.length ? <p className="native-admin-empty">No plugins match this filter.</p> : null}
    <div className="plugin-manager-grid">{visible.map(plugin => <article className="plugin-manager-card" key={plugin.slug}>
      <header><div><h3>{plugin.name}</h3><p><code>{plugin.slug}</code> · {plugin.category} · v{plugin.version}</p></div><span className={`plugin-manager-state ${plugin.enabled ? "is-enabled" : "is-disabled"}`}>{plugin.enabled ? "Enabled" : "Disabled"}</span></header>
      <p className="plugin-manager-description">{plugin.description || "No description provided."}</p>
      <div className="plugin-manager-actions">{plugin.enabled ? <a className="omni-btn omni-btn--primary" href={plugin.mount_path}>Open</a> : <button className="omni-btn omni-btn--primary" type="button" disabled title="Enable this plugin first">Open</button>}
        <button className={plugin.enabled ? "omni-btn omni-btn--danger" : "omni-btn omni-btn--secondary"} type="button" disabled={Boolean(busy)} onClick={() => updateOne(plugin)}>{busy === plugin.slug ? "Saving…" : plugin.enabled ? "Disable" : "Enable"}</button></div>
      <details><summary>Technical details</summary><dl><dt>Mount</dt><dd><code>{plugin.mount_path}</code></dd><dt>App</dt><dd><code>{plugin.app}</code></dd><dt>URLs</dt><dd><code>{plugin.urls}</code></dd></dl></details>
    </article>)}</div>
  </section>;
}
