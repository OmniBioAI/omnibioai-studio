import React, { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@omnibioai/ui";
import { Panel, PanelBody } from "../components/UI";
import {
  getIntegrationProvider,
  loadIntegrationCatalog,
  revokePersonalCredential,
  savePersonalCredential,
} from "../lib/integrationsApi";
import "./Integrations.css";

const FILTERS = [
  ["all", "All"], ["connected", "Connected"], ["available", "Available"], ["needs_setup", "Needs setup"],
];

const pretty = value => String(value || "").split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
const searchable = provider => [provider.displayName, provider.description, provider.category, ...provider.capabilities,
  ...provider.pluginSlugs, ...provider.plugins.map(plugin => plugin.pluginName)].join(" ").toLowerCase();

function statusInfo(provider) {
  if (provider.effectiveStatus === "CONNECTED_USER") return ["Connected — Personal", "connected"];
  if (provider.effectiveStatus === "CONNECTED_ORGANIZATION") return ["Connected — Organization", "connected"];
  if (provider.effectiveStatus === "CONNECTED_PLATFORM") return ["Connected — Platform", "connected"];
  if (provider.effectiveStatus === "READY_NO_CREDENTIALS") return ["Ready — No setup required", "ready"];
  if (provider.setupState === "license_required") return ["License required", "restricted"];
  if (provider.setupState === "unsupported_auth") return ["Setup not yet supported", "unavailable"];
  return ["Not configured", "setup"];
}

function matchesFilter(provider, filter) {
  if (filter === "connected") return provider.effectiveStatus.startsWith("CONNECTED_");
  if (filter === "available") return provider.effectiveStatus !== "NOT_CONFIGURED";
  if (filter === "needs_setup") return provider.effectiveStatus === "NOT_CONFIGURED";
  return true;
}

function messageFor(error) {
  if (error?.code === "unauthorized") return "Sign in to manage integrations.";
  if (error?.code === "forbidden") return "You do not have permission to perform this action.";
  if (error?.code === "not_found") return "This integration is no longer available.";
  if (error?.code === "invalid") return "The integration service returned an invalid response.";
  if (error?.code === "network_error") return "Unable to reach the integration services. Check your connection and retry.";
  if (error?.code === "server_error") return "The integration service encountered an error. Please retry.";
  return "Integrations are unavailable right now. Please retry.";
}

export default function Integrations({ onOrganizationConnections }) {
  const [providers, setProviders] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function reload(signal) {
    setLoading(true); setError("");
    try {
      const data = await loadIntegrationCatalog({ signal });
      if (!signal?.aborted) setProviders(data);
    } catch (failure) {
      if (!signal?.aborted && failure?.name !== "AbortError") setError(messageFor(failure));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal);
    return () => controller.abort();
  }, []);

  const categories = useMemo(() => [...new Set(providers.map(provider => provider.category))].sort(), [providers]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return providers.filter(provider => matchesFilter(provider, filter)
      && (category === "all" || provider.category === category)
      && (!term || searchable(provider).includes(term)));
  }, [category, filter, providers, query]);

  async function openProvider(provider) {
    setDetailLoading(true); setError("");
    try {
      const detail = await getIntegrationProvider(provider.providerId);
      setSelected({ ...provider, ...detail });
    } catch (failure) { setError(messageFor(failure)); }
    finally { setDetailLoading(false); }
  }

  async function changed(message) {
    setSelected(null); setNotice(message);
    await reload();
  }

  return <section className="integrations-page" aria-labelledby="integrations-heading">
    <header className="integrations-header">
      <div><p className="integrations-eyebrow">Studio</p><h1 id="integrations-heading">Integrations</h1>
        <p>Connect provider accounts to the capabilities available in OmniBioAI Workbench.</p></div>
      <button type="button" className="integrations-org-link" onClick={onOrganizationConnections}>Organization connections</button>
    </header>

    {notice && <p className="integrations-notice" role="status">{notice}</p>}
    <Panel><PanelBody><div className="integrations-controls">
      <label className="integrations-search">Search integrations
        <input type="search" value={query} placeholder="Search integrations..." onChange={event => setQuery(event.target.value)} />
      </label>
      <label>Category
        <select value={category} onChange={event => setCategory(event.target.value)}>
          <option value="all">All categories</option>
          {categories.map(value => <option key={value} value={value}>{pretty(value)}</option>)}
        </select>
      </label>
    </div>
    <div className="integrations-filters" role="group" aria-label="Integration status filters">
      {FILTERS.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div></PanelBody></Panel>

    {loading ? <div className="integrations-message" role="status"><Spinner /> Loading integrations…</div>
      : error ? <Panel><PanelBody><div className="integrations-message"><p role="alert">{error}</p><button type="button" onClick={() => reload()}>Retry</button></div></PanelBody></Panel>
      : providers.length === 0 ? <Panel><PanelBody><p className="integrations-message">No integrations are currently available.</p></PanelBody></Panel>
      : <>
        <p className="integrations-summary" role="status">Showing {visible.length} of {providers.length} integrations</p>
        {visible.length === 0 ? <Panel><PanelBody><p className="integrations-message">No integrations match the current search and filters.</p></PanelBody></Panel>
          : <div className="integrations-grid">{visible.map(provider => {
            const [label, tone] = statusInfo(provider);
            return <Panel key={provider.providerId}><PanelBody><article className="integration-card">
              <div className="integration-card-top"><span className="integration-category">{pretty(provider.category)}</span><span className={`integration-status integration-status-${tone}`}>{label}</span></div>
              <h2>{provider.displayName}</h2><p>{provider.description}</p>
              <dl><div><dt>Authentication</dt><dd>{pretty(provider.authentication.type)}</dd></div>
                <div><dt>Plugins</dt><dd>{provider.pluginCount}</dd></div>
                <div><dt>Capabilities</dt><dd>{provider.capabilityCount}</dd></div></dl>
              <button type="button" className="integration-primary" disabled={detailLoading} onClick={() => openProvider(provider)}>View {provider.displayName}</button>
            </article></PanelBody></Panel>;
          })}</div>}
      </>}
    {selected && <ProviderDialog provider={selected} onClose={() => setSelected(null)} onChanged={changed} />}
  </section>;
}

function ProviderDialog({ provider, onClose, onChanged }) {
  const [mode, setMode] = useState("details");
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef(null);
  const controller = useRef(new AbortController());
  const [statusLabel] = statusInfo(provider);
  const canConfigure = provider.authentication.allowedScopes.includes("user") && provider.authentication.type !== "none";

  useEffect(() => {
    root.current?.querySelector("button")?.focus();
    return () => { controller.current.abort(); setValues({}); };
  }, []);

  function close() { setValues({}); onClose(); }
  function keys(event) {
    if (event.key === "Escape" && !busy) { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const items = [...root.current.querySelectorAll("button, input")].filter(item => !item.disabled);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function beginConfigure() { setValues({}); setError(""); setMode("configure"); }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    const submitted = { ...values };
    setValues({}); setBusy(true); setError("");
    try {
      await savePersonalCredential(provider, submitted, { signal: controller.current.signal });
      await onChanged(provider.personalCredential ? "Personal credential replaced." : "Personal credential configured.");
    } catch (failure) {
      if (!controller.current.signal.aborted) { setError(messageFor(failure)); setBusy(false); }
    }
  }
  async function remove() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await revokePersonalCredential(provider.providerId, { signal: controller.current.signal });
      await onChanged("Personal credential removed.");
    } catch (failure) {
      if (!controller.current.signal.aborted) { setError(messageFor(failure)); setBusy(false); }
    }
  }

  const complete = provider.authentication.fields.some(field => String(values[field.name] || "").trim())
    && provider.authentication.fields.every(field => !field.required || String(values[field.name] || "").trim());

  return <div className="integrations-overlay">
    <div className="integrations-dialog" data-sentry-block="true" role="dialog" aria-modal="true" aria-labelledby="integration-dialog-title" ref={root} onKeyDown={keys}>
      <div className="integrations-dialog-heading"><div><span className="integration-category">{pretty(provider.category)}</span><h2 id="integration-dialog-title">{provider.displayName}</h2></div><button type="button" aria-label="Close integration details" onClick={close} disabled={busy}>×</button></div>
      {mode === "details" ? <>
        <p>{provider.description}</p><p><span className="integration-status integration-status-ready">{statusLabel}</span></p>
        {provider.effectiveStatus === "CONNECTED_ORGANIZATION" && <p className="integration-managed">Managed by your organization. Organization credentials are never displayed here.</p>}
        {provider.effectiveStatus === "CONNECTED_PLATFORM" && <p className="integration-managed">Managed by the OmniBioAI platform.</p>}
        {provider.authentication.anonymousAccess && <p>Public capabilities remain available without a credential.</p>}
        {provider.setupState === "unsupported_auth" && <p className="integration-managed">This provider's authentication flow is catalogued but is not yet supported by Studio. No credential is requested.</p>}
        {provider.setupState === "license_required" && <p className="integration-managed">This provider requires an external license or subscription. Studio does not claim access or request credentials.</p>}
        <h3>Workbench plugins</h3><ul className="integration-plugin-list">{provider.plugins.map(plugin => <li key={plugin.pluginId}>
          <span><strong>{plugin.pluginName}</strong><small>{plugin.pluginId}</small></span><span>{plugin.capabilityCount} capabilities</span>
        </li>)}</ul>
        <h3>Workbench capabilities</h3><ul className="integration-capabilities">{provider.capabilities.map(capability => <li key={capability}>{pretty(capability)}</li>)}</ul>
        <h3>Credential scopes</h3><p>{provider.authentication.allowedScopes.map(pretty).join(", ") || "No credentials required"}</p>
        <p className="integration-test-note">Connection testing is unavailable for this provider. Saving a credential configures it but does not externally verify it.</p>
        <div className="integrations-actions">
          {canConfigure && <button type="button" className="integration-primary" onClick={beginConfigure}>{provider.personalCredential ? "Replace personal credential" : "Configure personal credential"}</button>}
          {provider.personalCredential && <button type="button" className="integration-danger" onClick={() => setMode("remove")}>Remove personal credential</button>}
          <button type="button" disabled title="No safe provider probe is available">Test connection unavailable</button>
        </div>
      </> : mode === "configure" ? <form onSubmit={save}>
        <p>Credential values are write-only. Existing values are never retrieved or displayed.</p>
        {provider.authentication.fields.map(field => <label key={field.name} htmlFor={`integration-${field.name}`}>{field.label}{field.required ? " *" : ""}
          <input id={`integration-${field.name}`} data-sentry-mask={field.secret ? "true" : undefined} type={field.secret ? "password" : "text"} value={values[field.name] || ""} required={field.required} disabled={busy} autoComplete="off" spellCheck={false} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} />
        </label>)}
        {error && <p role="alert">{error} Re-enter the credential to retry.</p>}
        <div className="integrations-actions"><button type="button" onClick={() => { setValues({}); setMode("details"); }} disabled={busy}>Cancel</button><button type="submit" className="integration-primary" disabled={busy || !complete}>{busy ? "Saving…" : provider.personalCredential ? "Replace credential" : "Save credential"}</button></div>
      </form> : <>
        <h3>Remove personal credential?</h3><p>Workbench will fall back only to sources permitted by the provider policy. This does not revoke the credential at the external provider.</p>
        {error && <p role="alert">{error}</p>}
        <div className="integrations-actions"><button type="button" onClick={() => setMode("details")} disabled={busy}>Cancel</button><button type="button" className="integration-danger" onClick={remove} disabled={busy}>{busy ? "Removing…" : "Confirm removal"}</button></div>
      </>}
    </div>
  </div>;
}

export { matchesFilter, statusInfo };
