import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { datasetCatalogApi } from "../../lib/datasetCatalogApi";
import { safeErrorMessage } from "../../lib/safeErrorMessage";
import "./DatasetCatalogRenderer.css";

const DEFAULT_STALE_DAYS = 90;
const emptyForm = () => ({ id: "", name: "", category: "", type: "", root_path: "", tags: "" });

function staleWindow() {
  const value = Number(new URLSearchParams(window.location.search).get("stale_days"));
  return Number.isInteger(value) && value > 0 && value <= 3650 ? value : DEFAULT_STALE_DAYS;
}

function formatJson(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

export default function DatasetCatalogRenderer() {
  const staleDays = useMemo(staleWindow, []);
  const [datasets, setDatasets] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [updatedAt, setUpdatedAt] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [freshness, setFreshness] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [intel, setIntel] = useState(null);
  const intelRequest = useRef(null);

  const refresh = useCallback(async ({ signal, quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const payload = await datasetCatalogApi.list(staleDays, { signal });
      setDatasets(Array.isArray(payload.datasets) ? payload.datasets : []);
      setKpis(payload.kpis || null);
      setUpdatedAt(payload.updated_at || "");
      setError("");
    } catch (failure) {
      if (failure.name !== "AbortError") setError(safeErrorMessage(failure, "Could not load the dataset catalog."));
    } finally {
      if (!signal?.aborted && !quiet) setLoading(false);
    }
  }, [staleDays]);

  useEffect(() => {
    const controller = new AbortController();
    refresh({ signal: controller.signal });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!addOpen && !intel) return undefined;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = event => {
      if (event.key === "Escape") {
        setAddOpen(false);
        intelRequest.current?.abort();
        setIntel(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [addOpen, intel]);

  useEffect(() => () => intelRequest.current?.abort(), []);

  const categories = useMemo(() => [...new Set(datasets.map(item => (item.category || "other").trim()).filter(Boolean))].sort(), [datasets]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return datasets.filter(item => {
      if (category && (item.category || "other") !== category) return false;
      if (freshness === "stale" && !item.is_stale) return false;
      if (freshness === "fresh" && item.is_stale) return false;
      if (!needle) return true;
      const haystack = [item.id, item.name, item.category, item.type, (item.tags || []).join(","), item.root_path]
        .map(value => String(value || "").toLowerCase()).join(" | ");
      return haystack.includes(needle);
    });
  }, [datasets, query, category, freshness]);

  function closeAdd() {
    setAddOpen(false);
    setFormError("");
  }

  async function saveDataset(event) {
    event.preventDefault();
    const id = form.id.trim();
    if (!id) { setFormError("Dataset ID is required."); return; }
    setSaving(true); setFormError("");
    try {
      await datasetCatalogApi.create({
        id,
        name: form.name.trim() || id,
        category: form.category.trim() || "other",
        type: form.type.trim() || "dataset",
        root_path: form.root_path.trim(),
        tags: form.tags.trim(),
      });
      closeAdd(); setForm(emptyForm());
      await refresh();
    } catch (failure) {
      setFormError(safeErrorMessage(failure, "Could not save this dataset."));
    } finally { setSaving(false); }
  }

  async function deleteDataset(event, dataset) {
    event.stopPropagation();
    if (!window.confirm(`Delete '${dataset.id}' from the catalog?`)) return;
    setDeletingId(dataset.id); setError("");
    try { await datasetCatalogApi.remove(dataset.id); await refresh({ quiet: true }); }
    catch (failure) { setError(safeErrorMessage(failure, "Could not delete this dataset.")); }
    finally { setDeletingId(""); }
  }

  async function openIntelligence(dataset) {
    intelRequest.current?.abort();
    const controller = new AbortController();
    intelRequest.current = controller;
    setIntel({ dataset, loading: true, data: null, error: "" });
    if (!dataset.root_path) {
      setIntel({ dataset, loading: false, data: null, error: "This dataset has no root path. Add a root path and try again." });
      return;
    }
    try {
      const data = await datasetCatalogApi.intelligence(dataset.id, dataset.root_path, { signal: controller.signal });
      if (!controller.signal.aborted) setIntel({ dataset, loading: false, data, error: "" });
    } catch (failure) {
      if (!controller.signal.aborted) setIntel({ dataset, loading: false, data: null,
        error: safeErrorMessage(failure, "Failed to load dataset intelligence.") });
    }
  }

  function closeIntelligence() {
    intelRequest.current?.abort();
    setIntel(null);
  }

  function clearFilters() { setQuery(""); setCategory(""); setFreshness(""); }

  return (
    <section className="dataset-catalog-page" aria-label="Dataset Catalog">
      <div className="dataset-catalog-toolbar">
        <div><span className="dataset-catalog-eyebrow">GOVERNED DATA</span>
          <p>Curate and track reference datasets, downloads, and imported resources.</p>
        </div>
        <div className="dataset-catalog-toolbar__actions">
          <span className="dataset-catalog-updated">Updated: {updatedAt || "—"}</span>
          <button type="button" className="omni-btn omni-btn--primary" onClick={() => { setForm(emptyForm()); setAddOpen(true); }}>Add Dataset</button>
        </div>
      </div>

      <div className="dataset-catalog-kpis" aria-label="Dataset catalog summary">
        <article><span>Datasets</span><strong>{kpis?.dataset_count ?? (loading ? "…" : "—")}</strong><small>Tracked datasets</small></article>
        <article><span>Total size</span><strong>{kpis?.total_size_human ?? (loading ? "…" : "—")}</strong><small>Across all datasets</small></article>
        <article><span>Stale</span><strong>{kpis?.stale_count ?? (loading ? "…" : "—")}</strong><small>At least {staleDays} days</small></article>
      </div>

      <div className="dataset-catalog-panel">
        <div className="dataset-catalog-filters">
          <label className="workbench-sr-only" htmlFor="dataset-search">Search datasets</label>
          <input id="dataset-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name, ID, tag, path…" />
          <label className="workbench-sr-only" htmlFor="dataset-category">Filter by category</label>
          <select id="dataset-category" value={category} onChange={event => setCategory(event.target.value)}>
            <option value="">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <label className="workbench-sr-only" htmlFor="dataset-freshness">Filter by freshness</label>
          <select id="dataset-freshness" value={freshness} onChange={event => setFreshness(event.target.value)}>
            <option value="">All freshness</option><option value="stale">Stale only</option><option value="fresh">Fresh only</option>
          </select>
          <div className="dataset-catalog-filter-spacer" />
          <button type="button" className="omni-btn omni-btn--secondary" onClick={() => refresh()} disabled={loading}>Refresh</button>
          <button type="button" className="omni-btn omni-btn--secondary" onClick={clearFilters}>Clear</button>
        </div>
        {error && <p className="plugin-error" role="alert">{error}</p>}
        <div className="dataset-catalog-table-wrap">
          <table className="dataset-catalog-table">
            <thead><tr><th>Dataset</th><th>Category / Type</th><th>Version / Status</th><th>Path</th><th>Size</th><th>Updated</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && !datasets.length ? <tr><td colSpan="7" role="status">Loading catalog…</td></tr> : null}
              {!loading && !filtered.length ? <tr><td colSpan="7" className="dataset-catalog-empty">No datasets in catalog.</td></tr> : null}
              {filtered.map(item => <tr key={item.id} onClick={() => openIntelligence(item)} onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openIntelligence(item); }
              }} tabIndex={0} aria-label={`Inspect ${item.name || item.id}`}>
                <td><strong>{item.name || item.id}</strong><code>{item.id}</code><div className="dataset-catalog-tags">
                  <span className={`dataset-catalog-status ${item.is_stale ? "is-stale" : "is-ok"}`}>{item.is_stale ? "stale" : "ok"}</span>
                  {item.source && <span className="dataset-catalog-status is-neutral">{item.source}</span>}
                  {(item.tags || []).map(tag => <span className="dataset-catalog-tag" key={tag}>{tag}</span>)}
                </div></td>
                <td><strong>{item.category || "other"}</strong><small>{item.type || "dataset"}</small></td>
                <td><strong>{item.version || "—"}</strong><span className={`dataset-catalog-status ${item.status === "failed" ? "is-bad" : "is-ok"}`}>{item.status || "ready"}</span></td>
                <td>{item.root_path ? <code>{item.root_path}</code> : "—"}</td>
                <td><strong>{item.size_human || "—"}</strong><small>{item.size_bytes ?? "—"} bytes</small></td>
                <td><strong>{item.last_updated_display || "—"}</strong><small>Age: {item.age_days ?? "—"} days</small></td>
                <td><div className="dataset-catalog-row-actions">
                  <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" onClick={event => { event.stopPropagation(); openIntelligence(item); }}>Inspect</button>
                  <button type="button" className="omni-btn omni-btn--danger omni-btn--sm" disabled={deletingId === item.id} onClick={event => deleteDataset(event, item)}>
                    {deletingId === item.id ? "Deleting…" : "Delete"}
                  </button>
                </div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className="dataset-catalog-tip">Tip: set the stale window with <code>?stale_days=90</code>. Select a dataset to inspect its structure and quality.</p>
      </div>

      {addOpen && <div className="dataset-catalog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeAdd(); }}>
        <form className="dataset-catalog-dialog" role="dialog" aria-modal="true" aria-labelledby="dataset-add-title" onSubmit={saveDataset}>
          <header><h2 id="dataset-add-title">Add Dataset</h2><button type="button" className="dataset-catalog-close" onClick={closeAdd} aria-label="Close">×</button></header>
          <div className="dataset-catalog-dialog-body">
            <div className="dataset-catalog-form-grid">
              {[ ["id", "Dataset ID *", "e.g. gnomad_v4"], ["name", "Name", "Display name"],
                ["category", "Category", "reference / annotation / panel"], ["type", "Type", "vcf / fasta / gtf / tsv"],
                ["root_path", "Root path", "/data/ref/…"], ["tags", "Tags (comma-separated)", "hg38, qc, …"] ].map(([key, label, placeholder]) => (
                <label key={key}>{label}<input autoFocus={key === "id"} required={key === "id"} value={form[key]} placeholder={placeholder}
                  onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} /></label>
              ))}
            </div>
            {formError && <p role="alert" className="plugin-error">{formError}</p>}
          </div>
          <footer><button type="button" className="omni-btn omni-btn--secondary" onClick={closeAdd}>Cancel</button>
            <button type="submit" className="omni-btn omni-btn--primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button></footer>
        </form>
      </div>}

      {intel && <div className="dataset-catalog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeIntelligence(); }}>
        <section className="dataset-catalog-dialog dataset-catalog-intelligence" role="dialog" aria-modal="true" aria-labelledby="dataset-intel-title">
          <header><div><h2 id="dataset-intel-title">Dataset Intelligence</h2><p>{intel.dataset.name || intel.dataset.id}</p></div>
            <button type="button" className="dataset-catalog-close" onClick={closeIntelligence} aria-label="Close">×</button></header>
          <div className="dataset-catalog-dialog-body">
            {intel.loading && <p role="status">Loading dataset intelligence…</p>}
            {intel.error && <p className="plugin-error" role="alert">Failed to load dataset intelligence: {intel.error}</p>}
            {intel.data && <>
              <div className="dataset-catalog-intel-grid">
                <article><h3>Summary</h3><pre>{formatJson(intel.data.summary)}</pre></article>
                <article><h3>Detected Semantics</h3>{intel.data.semantics?.length
                  ? <div className="dataset-catalog-tags">{intel.data.semantics.map(value => <span className="dataset-catalog-tag" key={value}>{value}</span>)}</div>
                  : <p>No semantics detected.</p>}</article>
              </div>
              <article className="dataset-catalog-intel-block"><h3>Structure</h3><pre>{formatJson(intel.data.structure)}</pre></article>
              <article className="dataset-catalog-intel-block"><h3>Quality</h3><pre>{formatJson(intel.data.quality)}</pre></article>
              <article className="dataset-catalog-intel-block"><h3>Compatible Plugins</h3>{intel.data.compatible_plugins?.length
                ? intel.data.compatible_plugins.map((plugin, index) => <div className="dataset-catalog-plugin-match" key={`${plugin.slug || plugin.name || "plugin"}-${index}`}>
                  <div><strong>{plugin.name || plugin.slug || "plugin"}</strong><p>{plugin.description || ""}</p></div><span>score: {plugin.score ?? "—"}</span>
                </div>) : <p>No compatible plugins detected.</p>}</article>
              <p className="dataset-catalog-tip">Intelligence is deterministic; preview statistics are sampled for speed.</p>
            </>}
          </div>
          <footer><button type="button" className="omni-btn omni-btn--secondary" onClick={closeIntelligence}>Close</button></footer>
        </section>
      </div>}
    </section>
  );
}
