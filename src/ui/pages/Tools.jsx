import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { safeErrorMessage } from "../lib/safeErrorMessage";
import { tesApiFetch } from "../lib/tesApi";
import "./NavigationRedesign.css";

export const TOOL_CATEGORIES = ["QC", "Assembly", "Nanopore", "Single-cell", "RNA-seq", "Epigenomics", "Annotation", "More"];
export const TOOL_BACKENDS = ["Any", "HTTP", "Slurm", "Cloud", "Kubernetes"];

// End-to-end verification status, as served by TES on /api/tools ("verification" block).
// HTTP tools are runnable / not_working / not_yet_tested; non-HTTP tools (Slurm, cloud)
// are out_of_scope: the end-to-end run does not exercise them, so they get no badge
// and are always listed.
export const VERIFICATION = {
  runnable: { label: "Runnable", className: "tool-card__badge--runnable" },
  not_working: { label: "Not working", className: "tool-card__badge--not-working" },
  not_yet_tested: { label: "Not yet tested", className: "tool-card__badge--not-yet-tested" },
  out_of_scope: { label: null, className: null },
};

export function toolVerification(tool) {
  const block = tool?.verification && typeof tool.verification === "object" ? tool.verification : {};
  const status = VERIFICATION[block.status] ? block.status : "not_yet_tested";
  const testedAt = typeof block.tested_at === "string" && block.tested_at ? block.tested_at : null;
  const reason = typeof block.reason === "string" && block.reason ? block.reason : null;
  const title = status === "runnable" ? `Tested end to end on ${testedAt || "an unknown date"}`
    : status === "not_working" ? `Failed end to end${testedAt ? ` on ${testedAt}` : ""}${reason ? `: ${reason}` : ""}`
      : status === "out_of_scope" ? (reason || "Not covered by end-to-end verification")
        : reason || "Not yet run end to end";
  // listedByDefault: hidden by default only when an HTTP tool is known not to run or has never been tested.
  return { status, label: VERIFICATION[status].label, className: VERIFICATION[status].className, testedAt, reason, title,
    listedByDefault: status === "runnable" || status === "out_of_scope" };
}

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
    verification: toolVerification(tool),
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
  const [showAll, setShowAll] = useState(false);
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
  const runnableCount = cards.filter(tool => tool.verification.status === "runnable").length;
  const hiddenCount = cards.filter(tool => !tool.verification.listedByDefault).length;
  const visible = cards.filter(tool => {
    const matchesQuery = !query.trim() || `${tool.name} ${tool.description}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = showAll || tool.verification.listedByDefault;
    return matchesStatus && matchesQuery && (category === "All" || tool.category === category) && (backend === "Any" || tool.backends.includes(backend));
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
    <div className="tool-filter-block tool-filter-block--compact"><h2>Verified</h2><div role="group" aria-label="Verification" className="tool-filter-row">
      <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)}>Runnable only</button>
      <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)}>Show all</button>
    </div></div>
    {loading ? <p role="status">Loading tools…</p> : error ? <p role="alert">{error}</p> : <>
      <p role="status">{showAll
        ? `Showing ${visible.length} of ${cards.length} tools (${runnableCount} runnable HTTP tools)`
        : `Showing ${visible.length} of ${cards.length - hiddenCount} tools (${runnableCount} runnable HTTP tools; ${hiddenCount} not working or not yet tested hidden)`}</p>
      {!showAll && runnableCount === 0 && hiddenCount > 0 && <p className="tools-empty-hint">No HTTP tool has passed an end-to-end run yet. Choose “Show all” to see the {hiddenCount} hidden HTTP tools.</p>}
      <div className="tool-card-grid">{visible.map(tool => <article className="tool-card" key={tool.id}>
        <div className="tool-card__labels"><span className="tool-card__category">{tool.category}</span>
          {tool.verification.label && <span className={`tool-card__badge ${tool.verification.className}`} title={tool.verification.title} aria-label={`${tool.verification.label}: ${tool.verification.title}`}>{tool.verification.label}</span>}</div>
        <h2>{tool.name}</h2><p>{tool.description}</p>
        <div className="tool-card__footer"><span>Runs on: {tool.backends.join(", ")}</span><button type="button" onClick={() => onOpenJobs?.(tool.id)}>View and submit</button></div>
      </article>)}</div>
    </>}
  </section>;
}
