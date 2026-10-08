import React, { useEffect, useMemo, useState } from "react";
import { ProgressBar, Spinner } from "@omnibioai/ui";
import { useAccountDateTime } from "../components/PreferencesProvider";
import {
  downloadArtifact,
  getArtifact,
  getArtifactProvenance,
  getStorageUsage,
  listArtifacts,
} from "../lib/artifactsApi";
import "./Artifacts.css";

export const ARTIFACT_FILTERS = Object.freeze([
  { label: "All", types: null },
  { label: "Reports", types: ["report"] },
  { label: "Tables", types: ["table"] },
  { label: "Files", types: ["file"] },
  { label: "Other", types: null, other: true },
]);

const PRIMARY_TYPES = new Set(ARTIFACT_FILTERS.flatMap(filter => filter.types || []));
const TYPE_LABELS = {
  file: "File", directory: "Directory", dataset: "Dataset", report: "Report",
  workflow_output: "Workflow output", tool_output: "Tool output", model: "Model",
  image: "Image", document: "Document", table: "Table", sequence_data: "Sequence data",
  alignment: "Alignment", variant_data: "Variant data", expression_data: "Expression data",
  metadata: "Metadata", archive: "Archive", other: "Other",
};
const buttonClass = "omni-btn omni-btn--secondary omni-btn--sm";

function typeLabel(value = "") {
  return TYPE_LABELS[value] || value.replaceAll("_", " ").replace(/^./, first => first.toUpperCase());
}

function formatBytes(value) {
  if (value === null) return "Unavailable";
  if (value < 1000) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1000;
  let unit = units[0];
  for (let index = 1; index < units.length && amount >= 1000; index += 1) {
    amount /= 1000;
    unit = units[index];
  }
  return `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} ${unit}`;
}

function userMessage(error, operation) {
  if (error?.name === "AbortError") return "";
  if (operation === "list") {
    if (error?.code === "unauthorized") return "Sign in again to view artifacts.";
    return "Artifacts are unavailable right now. Please retry.";
  }
  if (operation === "detail") {
    return error?.code === "not_found" || error?.code === "forbidden"
      ? "This artifact is unavailable."
      : "Artifact details are unavailable right now.";
  }
  if (operation === "provenance") return "Provenance is unavailable right now.";
  return error?.code === "not_found" || error?.code === "forbidden"
    ? "This artifact is unavailable for download."
    : "The artifact could not be downloaded. Please retry.";
}

async function loadEveryArtifact(query, signal) {
  const artifacts = [];
  let offset = 0;
  let total = 0;
  do {
    const page = await listArtifacts({ query, limit: 200, offset, signal });
    total = page.total;
    artifacts.push(...page.artifacts);
    offset += page.artifacts.length;
    if (page.artifacts.length === 0 && offset < total) throw new Error("invalid-pagination");
  } while (offset < total);
  return artifacts;
}

function saveDownload({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function Artifacts() {
  const formatDate = useAccountDateTime();
  const [request, setRequest] = useState({ query: "", reload: 0 });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [result, setResult] = useState({ status: "loading", items: [], error: "" });
  const [selected, setSelected] = useState(null);
  const [usage, setUsage] = useState({ status: "loading", data: null });

  useEffect(() => {
    const controller = new AbortController();
    setUsage({ status: "loading", data: null });
    getStorageUsage({ signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setUsage({ status: "success", data });
    }).catch(error => {
      if (!controller.signal.aborted && error?.name !== "AbortError") setUsage({ status: "error", data: null });
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setResult({ status: "loading", items: [], error: "" });
    loadEveryArtifact(request.query, controller.signal).then(items => {
      if (!controller.signal.aborted) setResult({ status: "success", items, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ status: "error", items: [], error: userMessage(error, "list") });
    });
    return () => controller.abort();
  }, [request]);

  const visible = useMemo(() => {
    const active = ARTIFACT_FILTERS.find(candidate => candidate.label === filter);
    if (!active || active.label === "All") return result.items;
    if (active.other) return result.items.filter(item => !PRIMARY_TYPES.has(item.artifactType));
    return result.items.filter(item => active.types.includes(item.artifactType));
  }, [result.items, filter]);

  function submitSearch(event) {
    event.preventDefault();
    setFilter("All");
    setSelected(null);
    setRequest(previous => ({ query: search.trim(), reload: previous.reload + 1 }));
  }

  function clearSearch() {
    setSearch("");
    setFilter("All");
    setSelected(null);
    setRequest(previous => ({ query: "", reload: previous.reload + 1 }));
  }

  return <section className="artifacts-page" aria-labelledby="artifacts-heading">
    <header className="artifacts-header">
      <div>
        <h1 id="artifacts-heading">Artifacts</h1>
        <p>Discover authorized scientific outputs, inspect their metadata and lineage, and securely download available files.</p>
      </div>
    </header>

    <StorageUsage state={usage} />

    <div className="artifacts-toolbar">
      <form className="artifact-search" role="search" onSubmit={submitSearch}>
        <label htmlFor="artifact-search">Search artifacts</label>
        <div>
          <input id="artifact-search" className="studio-field" value={search} maxLength={200}
            onChange={event => setSearch(event.target.value)} placeholder="Search artifacts" />
          <button type="submit" className={buttonClass}>Search</button>
          {request.query && <button type="button" className={buttonClass} onClick={clearSearch}>Clear</button>}
        </div>
      </form>
      <div className="artifact-filters" role="group" aria-label="Artifact type filters">
        {ARTIFACT_FILTERS.map(value => <button key={value.label} type="button" className={buttonClass}
          aria-pressed={filter === value.label} onClick={() => setFilter(value.label)}>{value.label}</button>)}
      </div>
    </div>

    <div className="artifacts-results" aria-busy={result.status === "loading"}>
      {result.status === "loading" && <div className="artifact-state" role="status"><Spinner size="sm" /> Loading artifacts…</div>}
      {result.status === "error" && <div className="artifact-state artifact-state--error">
        <p role="alert">{result.error}</p>
        <button type="button" className={buttonClass}
          onClick={() => setRequest(previous => ({ ...previous, reload: previous.reload + 1 }))}>Retry</button>
      </div>}
      {result.status === "success" && result.items.length === 0 && <div className="artifact-state">
        <h2>{request.query ? "No matching artifacts" : "No artifacts yet"}</h2>
        <p>{request.query ? "Try a different search." : "Authorized scientific outputs will appear here when they are created."}</p>
      </div>}
      {result.status === "success" && result.items.length > 0 && visible.length === 0 && <div className="artifact-state">
        <h2>No artifacts in this category</h2><p>Choose another artifact type filter.</p>
      </div>}
      {result.status === "success" && visible.length > 0 && <>
        <p className="artifact-summary" role="status">Showing {visible.length} of {result.items.length} authorized artifacts{request.query ? ` matching “${request.query}”` : ""}.</p>
        <div className="artifact-table-wrap"><table className="artifact-table">
          <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Created</th><th>Size</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{visible.map(item => <tr key={item.artifactId}>
            <td><button type="button" className="artifact-name" onClick={() => setSelected(item)}>{item.name}</button>
              {item.description && <span>{item.description}</span>}</td>
            <td>{typeLabel(item.artifactType)}</td>
            <td><span className={`artifact-status artifact-status--${item.status}`}>{typeLabel(item.status)}</span></td>
            <td><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></td>
            <td>{formatBytes(item.sizeBytes)}</td>
            <td><button type="button" className={buttonClass} aria-label={`Open ${item.name}`}
              onClick={() => setSelected(item)}>Open</button></td>
          </tr>)}</tbody>
        </table></div>
      </>}
    </div>
    {selected && <ArtifactDetail summary={selected} formatDate={formatDate} onClose={() => setSelected(null)} />}
  </section>;
}

function StorageUsage({ state }) {
  if (state.status === "loading") return <section className="storage-usage" aria-busy="true">
    <p role="status"><Spinner size="sm" /> Loading personal storage usage…</p>
  </section>;
  if (state.status === "error") return <section className="storage-usage storage-usage--unavailable">
    <h2>Personal managed storage</h2><p role="alert">Storage usage is unavailable right now. No usage value has been assumed.</p>
  </section>;
  const value = state.data;
  const percent = value.quotaBytes ? Math.min(100, ((value.usedBytes + value.reservedBytes) / value.quotaBytes) * 100) : 0;
  return <section className={`storage-usage${value.overQuota ? " storage-usage--over" : ""}`}>
    <div className="storage-usage__heading"><div><h2>Personal managed storage</h2>
      <p>Membership: {value.plan ? value.plan[0].toUpperCase() + value.plan.slice(1) : "Unavailable"}</p></div>
      <a className="omni-btn omni-btn--secondary omni-btn--sm" href="/studio/billing/plans">View upgrade options</a></div>
    {value.quotaBytes === null ? <p role="alert">Your current storage allowance is unavailable.</p> : <>
      <ProgressBar value={percent} variant={value.overQuota ? "danger" : percent >= 85 ? "warning" : "accent"} />
      <dl><div><dt>Used</dt><dd>{formatBytes(value.usedBytes)}</dd></div>
        <div><dt>Reserved</dt><dd>{formatBytes(value.reservedBytes)}</dd></div>
        <div><dt>Available</dt><dd>{formatBytes(value.availableBytes)}</dd></div>
        <div><dt>Total</dt><dd>{formatBytes(value.quotaBytes)}</dd></div></dl>
    </>}
    {value.enforcementActive && <p className="storage-usage__enforced">Quota enforced</p>}
    {value.quotaMode === "audit" && <p>Quota accounting is in audit mode; enforcement is not active.</p>}
    {value.overQuota && <p role="alert">You are over your current storage allowance. Downloads and deletion remain available, but new storage may be blocked.</p>}
  </section>;
}

function ArtifactDetail({ summary, formatDate, onClose }) {
  const [detail, setDetail] = useState({ status: "loading", data: null, error: "" });
  const [lineage, setLineage] = useState({ status: "loading", data: null, error: "" });
  const [download, setDownload] = useState({ status: "idle", message: "" });

  useEffect(() => {
    const controller = new AbortController();
    getArtifact(summary.artifactId, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setDetail({ status: "success", data, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setDetail({ status: "error", data: null, error: userMessage(error, "detail") });
    });
    getArtifactProvenance(summary.artifactId, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setLineage({ status: "success", data, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setLineage({ status: "error", data: null, error: userMessage(error, "provenance") });
    });
    return () => controller.abort();
  }, [summary.artifactId]);

  useEffect(() => {
    const close = event => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const artifact = detail.data || summary;
  const downloadable = ["available", "archived"].includes(artifact.status);

  async function startDownload() {
    if (!downloadable || download.status === "loading") return;
    setDownload({ status: "loading", message: "" });
    try {
      const file = await downloadArtifact(artifact.artifactId, { filename: artifact.name });
      saveDownload(file);
      setDownload({ status: "success", message: `Download started for ${artifact.name}.` });
    } catch (error) {
      if (error?.name !== "AbortError") setDownload({ status: "error", message: userMessage(error, "download") });
    }
  }

  return <div className="artifact-detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="artifact-detail" role="dialog" aria-modal="true" aria-labelledby="artifact-detail-title">
      <header><div><span>{typeLabel(artifact.artifactType)}</span><h2 id="artifact-detail-title">{artifact.name}</h2></div>
        <button type="button" className={buttonClass} aria-label="Close artifact details" onClick={onClose}>Close</button></header>
      <div className="artifact-detail-body">
        {detail.status === "loading" && <p role="status"><Spinner size="sm" /> Loading artifact details…</p>}
        {detail.status === "error" && <p role="alert">{detail.error}</p>}
        {detail.status === "success" && <>
          {artifact.description && <p className="artifact-description">{artifact.description}</p>}
          <dl className="artifact-metadata">
            <div><dt>Status</dt><dd>{typeLabel(artifact.status)}</dd></div>
            <div><dt>Type</dt><dd>{typeLabel(artifact.artifactType)}</dd></div>
            <div><dt>Created</dt><dd>{formatDate(artifact.createdAt)}</dd></div>
            <div><dt>Size</dt><dd>{formatBytes(artifact.sizeBytes)}</dd></div>
            {artifact.format && <div><dt>Format</dt><dd>{artifact.format}</dd></div>}
            {artifact.version > 1 && <div><dt>Version</dt><dd>{artifact.version}</dd></div>}
            {artifact.projectId && <div><dt>Project reference</dt><dd>{artifact.projectId}</dd></div>}
            {artifact.workflowId && <div><dt>Workflow</dt><dd>{artifact.workflowId}</dd></div>}
            {artifact.runId && <div><dt>Run</dt><dd>{artifact.runId}</dd></div>}
          </dl>
          {artifact.tags.length > 0 && <section className="artifact-detail-section"><h3>Tags</h3>
            <ul className="artifact-tags">{artifact.tags.map(tag => <li key={tag}>{tag}</li>)}</ul></section>}
          <section className="artifact-detail-section"><h3>Download</h3>
            {downloadable ? <button type="button" className="omni-btn omni-btn--primary omni-btn--sm"
              disabled={download.status === "loading"} onClick={startDownload}>
              {download.status === "loading" ? "Preparing download…" : "Download artifact"}</button>
              : <p>Download is unavailable while this artifact is {typeLabel(artifact.status).toLowerCase()}.</p>}
            {download.message && <p role={download.status === "error" ? "alert" : "status"}>{download.message}</p>}
          </section>
        </>}
        <Provenance state={lineage} formatDate={formatDate} />
      </div>
    </aside>
  </div>;
}

function Provenance({ state, formatDate }) {
  return <section className="artifact-detail-section artifact-provenance"><h3>Provenance</h3>
    {state.status === "loading" && <p role="status"><Spinner size="sm" /> Loading provenance…</p>}
    {state.status === "error" && <p role="alert">{state.error}</p>}
    {state.status === "success" && state.data.inputs.length === 0 && state.data.outputs.length === 0
      && <p>No provenance has been recorded for this artifact.</p>}
    {state.status === "success" && <>
      <ProvenanceList title="Inputs" edges={state.data.inputs} formatDate={formatDate} />
      <ProvenanceList title="Derived outputs" edges={state.data.outputs} formatDate={formatDate} />
    </>}
  </section>;
}

function ProvenanceList({ title, edges, formatDate }) {
  if (!edges.length) return null;
  return <div className="artifact-lineage"><h4>{title}</h4><ul>{edges.map(edge => <li key={`${edge.relationship}:${edge.artifact.artifactId}`}>
    <strong>{edge.artifact.name}</strong><span>{typeLabel(edge.relationship)}</span>
    {(edge.producingTool || edge.producingPlugin) && <small>{[edge.producingTool, edge.producingPlugin].filter(Boolean).join(" · ")}</small>}
    {edge.executionTimestamp && <time dateTime={edge.executionTimestamp}>{formatDate(edge.executionTimestamp)}</time>}
  </li>)}</ul></div>;
}
