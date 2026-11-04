import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { safeErrorMessage } from "../lib/safeErrorMessage";
import { tesApiFetch } from "../lib/tesApi";
import "./NavigationRedesign.css";

export const TOOL_CATEGORIES = ["QC", "Assembly", "Nanopore", "Single-cell", "RNA-seq", "Epigenomics", "Annotation", "More"];
export const TOOL_BACKENDS = ["Any", "HTTP", "Slurm", "Cloud", "Kubernetes"];

export function toolRunsTemporarilyUnavailable(config = globalThis.window?.__OMNIBIOAI_CONFIG__) {
  const value = config?.toolRunsTemporarilyUnavailable;
  return value === true || value === "true";
}

const CATEGORY_RULES = [
  ["QC", /quality|qc|fastqc|multiqc/], ["Assembly", /assembl/], ["Nanopore", /nanopore|ont/],
  ["Single-cell", /single.?cell|scrna/], ["RNA-seq", /rna.?seq|transcript/],
  ["Epigenomics", /epigen|atac|chip|methyl/], ["Annotation", /annotat/],
];

function words(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

export function toolPresentation(tool) {
  const id = String(tool.tool_id || tool.id || tool.name || "Unnamed tool");
  const tags = words(tool.tags || tool.categories || tool.category);
  const searchable = `${id} ${tool.name || ""} ${tags.join(" ")}`.toLowerCase();
  const category = CATEGORY_RULES.find(([, rule]) => rule.test(searchable))?.[0] || "More";
  const rawBackends = words(tool.backends || tool.runs_on || tool.backend || tool.server_types).map(value => value.toLowerCase());
  const inferred = rawBackends.length ? rawBackends : [tool.url || tool.endpoint ? "http" : "local"];
  const backends = [...new Set(inferred.map(value => value.includes("kube") ? "Kubernetes"
    : value.includes("slurm") ? "Slurm" : /aws|azure|gcp|cloud/.test(value) ? "Cloud"
      : value.includes("http") || value.includes("remote") ? "HTTP" : "Local"))];
  return {
    id,
    name: String(tool.display_name || tool.title || tool.name || id).replaceAll("_", " "),
    description: String(tool.description || tool.summary || "Registered TES tool"),
    category,
    backends,
  };
}

export default function Tools({ initialQuery = "", onOpenJobs }) {
  const [tools, setTools] = useState([]);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("All");
  const [backend, setBackend] = useState("Any");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const showUnavailableNotice = toolRunsTemporarilyUnavailable() && !noticeDismissed;

  useEffect(() => {
    const controller = new AbortController();
    tesApiFetch("/api/tools", { signal: controller.signal })
      .then(value => setTools(Array.isArray(value) ? value : []))
      .catch(failure => { if (!controller.signal.aborted) setError(safeErrorMessage(failure, "Could not load tools.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const cards = useMemo(() => tools.map(toolPresentation), [tools]);
  const backendOptions = cards.some(tool => tool.backends.includes("Local")) ? [...TOOL_BACKENDS, "Local"] : TOOL_BACKENDS;
  const visible = cards.filter(tool => {
    const matchesQuery = !query.trim() || `${tool.name} ${tool.description}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (category === "All" || tool.category === category) && (backend === "Any" || tool.backends.includes(backend));
  });

  return <section className="tools-page">
    <PageHeader title="Tools" description="Browse and run tools registered with TES" />
    {showUnavailableNotice && <div className="tools-availability-notice" role="status">
      <span>Tool runs are temporarily unavailable</span>
      <button type="button" onClick={() => setNoticeDismissed(true)} aria-label="Dismiss tool availability notice">Dismiss</button>
    </div>}
    <label className="tools-search">Search tools<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tools…" /></label>
    <div className="tool-filter-block"><h2>Category</h2><div role="group" aria-label="Tool categories" className="tool-filter-row">
      {["All", ...TOOL_CATEGORIES].map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}
    </div></div>
    <div className="tool-filter-block tool-filter-block--compact"><h2>Runs on</h2><div role="group" aria-label="Runs on" className="tool-filter-row">
      {backendOptions.map(value => <button key={value} type="button" aria-pressed={backend === value} onClick={() => setBackend(value)}>{value}</button>)}
    </div></div>
    {loading ? <p role="status">Loading tools…</p> : error ? <p role="alert">{error}</p> : <>
      <p role="status">Showing {visible.length} of {cards.length} tools</p>
      <div className="tool-card-grid">{visible.map(tool => <article className="tool-card" key={tool.id}>
        <span className="tool-card__category">{tool.category}</span><h2>{tool.name}</h2><p>{tool.description}</p>
        <div className="tool-card__footer"><span>Runs on: {tool.backends.join(", ")}</span><button type="button" onClick={() => onOpenJobs?.(tool.id)}>View and submit</button></div>
      </article>)}</div>
    </>}
  </section>;
}
