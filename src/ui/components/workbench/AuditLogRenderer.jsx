import React, { useCallback, useEffect, useMemo, useState } from "react";
import { nativePluginRequest } from "../../lib/nativePluginApi";
import "./NativeAdminRenderers.css";

const FILTER_KEYS = ["q", "actor", "source", "severity", "object_id", "dataset_id", "run_id", "workflow_id", "from", "to"];
const initialFilters = () => {
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(FILTER_KEYS.map(key => [key, params.get(key) || ""]));
};

export default function AuditLogRenderer() {
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [page, setPage] = useState(Math.max(1, Number(new URLSearchParams(window.location.search).get("page")) || 1));
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(applied).forEach(([key, value]) => { if (String(value).trim()) params.set(key, String(value).trim()); });
    params.set("page", String(page));
    params.set("page_size", "50");
    return params.toString();
  }, [applied, page]);

  const load = useCallback(async signal => {
    setLoading(true);
    try {
      const payload = await nativePluginRequest(`/plugins/audit_log/api/events?${query}`, { signal });
      setData(payload); setError("");
    } catch (failure) {
      if (failure.name !== "AbortError") setError(failure.message || "Failed to load audit events.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    FILTER_KEYS.forEach(key => applied[key] ? params.set(key, applied[key]) : params.delete(key));
    params.set("page", String(page)); params.set("page_size", "50");
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }, [applied, page]);

  async function showEvent(event) {
    setSelected({ loading: true, event: null });
    try { const result = await nativePluginRequest(`/plugins/audit_log/api/events/${encodeURIComponent(event.id)}`); setSelected({ loading: false, event: result.event }); }
    catch (failure) { setSelected({ loading: false, error: failure.message || "Could not load event details." }); }
  }

  function applyFilters(event) { event.preventDefault(); setPage(1); setApplied({ ...filters }); setSelected(null); }
  function pageButton(delta) { setPage(value => Math.max(1, Math.min(data?.total_pages || 1, value + delta))); setSelected(null); }

  return <section className="native-admin-page" aria-label="Audit and Activity Log">
    <header className="native-admin-heading"><div><span className="native-admin-eyebrow">GOVERNANCE</span><h2>Audit &amp; Activity Log</h2><p>Search and inspect platform events, actions, and audit history.</p></div>
      <button className="omni-btn omni-btn--secondary" type="button" onClick={() => load()} disabled={loading}>Refresh</button></header>
    <form className="native-admin-filter-card" onSubmit={applyFilters}>
      <label>Search<input value={filters.q} onChange={event => setFilters(current => ({ ...current, q: event.target.value }))} placeholder="Action, source, actor, object, run…" /></label>
      <label>Actor<input value={filters.actor} onChange={event => setFilters(current => ({ ...current, actor: event.target.value }))} placeholder="Actor" /></label>
      <label>Source<input value={filters.source} onChange={event => setFilters(current => ({ ...current, source: event.target.value }))} placeholder="Source" /></label>
      <label>Severity<select value={filters.severity} onChange={event => setFilters(current => ({ ...current, severity: event.target.value }))}>
        <option value="">Any severity</option>{["DEBUG", "INFO", "WARN", "ERROR"].map(level => <option key={level}>{level}</option>)}
      </select></label>
      <details className="native-admin-advanced"><summary>More filters</summary><div className="native-admin-advanced-grid">
        {[ ["object_id", "Object ID"], ["dataset_id", "Dataset ID"], ["run_id", "Run ID"], ["workflow_id", "Workflow ID"], ["from", "From (ISO date/time)"], ["to", "To (ISO date/time)"] ].map(([key, label]) => <label key={key}>{label}<input value={filters[key]} onChange={event => setFilters(current => ({ ...current, [key]: event.target.value }))} placeholder={label} /></label>)}
      </div></details>
      <div className="native-admin-filter-actions"><button className="omni-btn omni-btn--primary" type="submit">Apply filters</button>
        <button className="omni-btn omni-btn--secondary" type="button" onClick={() => { const blank = Object.fromEntries(FILTER_KEYS.map(key => [key, ""])); setFilters(blank); setApplied(blank); setPage(1); }}>Clear</button></div>
    </form>
    {error && <p className="plugin-error" role="alert">{error}</p>}
    <div className="native-admin-table-card">
      <div className="native-admin-table-header"><p>{data ? `Events: ${data.total_events} · Page ${data.page} / ${data.total_pages}` : loading ? "Loading audit events…" : "No event data"}</p>
        <div><button className="omni-btn omni-btn--secondary omni-btn--sm" type="button" onClick={() => pageButton(-1)} disabled={loading || page <= 1}>Prev</button>
          <button className="omni-btn omni-btn--secondary omni-btn--sm" type="button" onClick={() => pageButton(1)} disabled={loading || page >= (data?.total_pages || 1)}>Next</button></div></div>
      <div className="native-admin-table-wrap"><table className="native-admin-table"><thead><tr><th>Time</th><th>Severity</th><th>Action</th><th>Source</th><th>Actor</th><th>Object</th><th>Run</th><th>Workflow</th></tr></thead>
        <tbody>{loading && !data ? <tr><td colSpan="8" role="status">Loading events…</td></tr> : null}
          {!loading && !data?.events?.length ? <tr><td colSpan="8" className="native-admin-empty">No events found.</td></tr> : null}
          {data?.events?.map(event => <tr key={event.id} tabIndex={0} onClick={() => showEvent(event)} onKeyDown={keyEvent => { if (keyEvent.key === "Enter") showEvent(event); }} aria-label={`Inspect event ${event.id}`}>
            <td>{event.created_at || "—"}</td><td><span className={`native-admin-severity is-${String(event.severity || "unknown").toLowerCase()}`}>{event.severity || "—"}</span></td>
            <td><code>{event.action || "—"}</code></td><td>{event.source || "—"}</td><td>{event.actor || "—"}</td><td><code>{event.object_id || event.dataset_id || "—"}</code></td><td><code>{event.run_id || "—"}</code></td><td><code>{event.workflow_id || "—"}</code></td>
          </tr>)}</tbody></table></div>
      {selected && <section className="native-admin-event-detail" aria-label="Selected audit event"><header><h3>Event details</h3><button className="omni-btn omni-btn--secondary omni-btn--sm" type="button" onClick={() => setSelected(null)}>Close</button></header>
        {selected.loading ? <p role="status">Loading event details…</p> : selected.error ? <p role="alert">{selected.error}</p> : <pre>{JSON.stringify(selected.event, null, 2)}</pre>}</section>}
    </div>
  </section>;
}
