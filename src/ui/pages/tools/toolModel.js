// Pure helpers for the Tools catalog and tool detail pages: how a TES tool is
// presented (category, backends), its verification badge, the form generated
// from its input schema, client-side validation, and the copyable curl.
import { tesUrl } from "../../lib/tesApi";

export const TOOL_CATEGORIES = ["QC", "Assembly", "Nanopore", "Single-cell", "RNA-seq", "Epigenomics", "Annotation", "More"];

// Backend keys in display order, with the TES server adapter types that run them.
export const BACKENDS = [
  { key: "http", label: "HTTP", adapters: ["http_toolserver"] },
  { key: "slurm", label: "Slurm", adapters: ["slurm"] },
  { key: "aws", label: "AWS Batch", adapters: ["aws_batch"] },
  { key: "azure", label: "Azure Batch", adapters: ["azure_batch"] },
  { key: "gcp", label: "GCP Batch", adapters: ["gcp_batch"] },
  { key: "k8s", label: "Kubernetes", adapters: ["k8s_job"] },
  { key: "local", label: "Local", adapters: ["local"] },
];
const BACKEND_BY_KEY = Object.fromEntries(BACKENDS.map(b => [b.key, b]));
const BACKEND_BY_ADAPTER = Object.fromEntries(BACKENDS.flatMap(b => b.adapters.map(a => [a, b.key])));
export const TOOL_BACKENDS = ["Any", ...BACKENDS.map(b => b.label)];

// End-to-end verification status, as served by TES on /api/tools ("verification" block).
// HTTP tools are runnable / not_working / not_yet_tested; non-HTTP tools (Slurm, cloud)
// are out_of_scope: the end-to-end run does not exercise them, so they get no badge
// and are always listed. Any tool is "unavailable" when no configured backend can run it
// right now (Slurm not answering, an x86_64-only image on an ARM64 host, a backend whose
// handshake failed): hidden by default, shown with an "Unavailable" badge behind "Show all".
export const VERIFICATION = {
  runnable: { label: "Runnable", className: "tool-card__badge--runnable" },
  not_working: { label: "Not working", className: "tool-card__badge--not-working" },
  not_yet_tested: { label: "Not yet tested", className: "tool-card__badge--not-yet-tested" },
  out_of_scope: { label: null, className: null },
  unavailable: { label: "Unavailable", className: "tool-card__badge--unavailable" },
};

// True when TES served a verification block for at least one tool. Without it
// (an older TES, or a rollback) the page fails open: every tool is listed and no
// badge is shown, instead of hiding the whole catalog as "not yet tested".
export function hasVerificationData(tools) {
  return Array.isArray(tools) && tools.some(tool => tool?.verification && typeof tool.verification === "object");
}

export function toolVerification(tool) {
  const block = tool?.verification && typeof tool.verification === "object" ? tool.verification : {};
  const status = VERIFICATION[block.status] ? block.status : "not_yet_tested";
  const testedAt = typeof block.tested_at === "string" && block.tested_at ? block.tested_at : null;
  const reason = typeof block.reason === "string" && block.reason ? block.reason : null;
  const title = status === "runnable" ? `Tested end to end on ${testedAt || "an unknown date"}`
    : status === "not_working" ? `Failed end to end${testedAt ? ` on ${testedAt}` : ""}${reason ? `: ${reason}` : ""}`
      : status === "out_of_scope" ? (reason || "Not covered by end-to-end verification")
        : status === "unavailable" ? `No backend can run this tool right now${reason ? `: ${reason}` : ""}`
          : reason || "Not yet run end to end";
  // listedByDefault: hidden by default when an HTTP tool is known not to run or has never been
  // tested, and when no backend can run the tool at all.
  return { status, label: VERIFICATION[status].label, className: VERIFICATION[status].className, testedAt, reason, title,
    runId: typeof block.run_id === "string" ? block.run_id : null,
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

export function toolCategory(tool) {
  const id = String(tool?.tool_id || tool?.id || tool?.name || "");
  const tags = words(tool?.tags || tool?.categories || tool?.category);
  const searchable = `${id} ${tool?.name || ""} ${tags.join(" ")}`.toLowerCase();
  return CATEGORY_RULES.find(([, rule]) => rule.test(searchable))?.[0] || "More";
}

// Which backends can run a tool: its own http/slurm blocks plus every server whose
// config names it (the same derivation the TES Tool Docs page used), never a guess
// from the URL. `servers` is the /api/servers list (optional).
export function deriveBackends(tool, servers = []) {
  const found = new Set();
  if (tool?.http) found.add("http");
  if (tool?.slurm) found.add("slurm");
  const id = tool?.tool_id;
  for (const srv of Array.isArray(servers) ? servers : []) {
    const key = BACKEND_BY_ADAPTER[srv?.adapter_type];
    if (!key || !id) continue;
    const cfg = srv.config || {};
    const map = srv.adapter_type === "aws_batch" ? cfg.job_definition_map : cfg.tools;
    const advertised = Array.isArray(srv.capabilities?.tools) && srv.capabilities.tools.some(t => t?.tool_id === id);
    if ((map && typeof map === "object" && id in map) || (advertised && !["http_toolserver", "slurm"].includes(srv.adapter_type))) found.add(key);
  }
  for (const raw of words(tool?.backends || tool?.runs_on || tool?.backend || tool?.server_types)) {
    const value = raw.toLowerCase();
    const key = value.includes("kube") ? "k8s" : value.includes("slurm") ? "slurm" : /aws/.test(value) ? "aws" : /azure/.test(value) ? "azure"
      : /gcp|google/.test(value) ? "gcp" : value.includes("http") || value.includes("remote") ? "http" : value.includes("local") ? "local" : null;
    if (key) found.add(key);
  }
  return BACKENDS.filter(b => found.has(b.key)).map(b => b.label);
}

export function toolPresentation(tool, servers = []) {
  const id = String(tool.tool_id || tool.id || tool.name || "Unnamed tool");
  const backends = deriveBackends(tool, servers);
  return {
    id,
    name: String(tool.display_name || tool.title || tool.name || id).replaceAll("_", " "),
    description: String(tool.description || tool.summary || "No description yet."),
    category: toolCategory(tool),
    tags: Array.isArray(tool.tags) ? tool.tags.map(String) : [],
    backends,
    backendKeys: backendKeys(backends),
    verification: toolVerification(tool),
  };
}

// Counts per backend label over a set of presented cards (for the "Runs on" chips).
export function backendCounts(cards) {
  const counts = Object.fromEntries(BACKENDS.map(b => [b.label, 0]));
  for (const card of cards) for (const label of card.backends) counts[label] = (counts[label] || 0) + 1;
  return counts;
}

export function backendLabel(key) { return BACKEND_BY_KEY[key]?.label || key; }

export function backendKeyForServer(server) { return BACKEND_BY_ADAPTER[server?.adapter_type] || null; }

export function backendKeys(labels) { return BACKENDS.filter(b => labels.includes(b.label)).map(b => b.key); }

// Why the current filters leave nothing to show. `context` carries the counts the
// list page already computed; returns { title, hint, action } or null when tools exist.
export function emptyState({ total, afterStatus, afterBackend, afterCategory, afterQuery, showAll, backend, category, query, servers = [] }) {
  if (total === 0) return { title: "No tools are available from TES right now.", hint: "Check that the Tool Execution Service is running, then reload." };
  if (afterQuery > 0) return null;
  const downBackend = backend !== "Any" && servers.some(s => s && s.available === false && BACKEND_BY_ADAPTER[s.adapter_type] && backendLabel(BACKEND_BY_ADAPTER[s.adapter_type]) === backend);
  if (!showAll && backend !== "Any" && afterBackend === 0 && downBackend) {
    return { title: `No runnable ${backend} tools yet: the ${backend} backend isn't available.`, hint: "Show all to browse them.", action: "show-all" };
  }
  if (!showAll && afterStatus === 0) {
    return { title: "No runnable tools yet.", hint: `Show all to browse the ${total.toLocaleString("en-US")} tools that are not working, not yet tested or unavailable.`, action: "show-all" };
  }
  if (!showAll && backend !== "Any" && afterBackend === 0) {
    return { title: `No runnable ${backend} tools yet.`, hint: "Show all to browse the not-yet-tested and unavailable ones.", action: "show-all" };
  }
  if (!showAll && afterCategory === 0 && afterBackend > 0) {
    return { title: `No runnable ${category === "All" ? "" : `${category} `}tools${backend === "Any" ? "" : ` on ${backend}`} yet.`, hint: "Show all to include tools that are not working, not yet tested or unavailable.", action: "show-all" };
  }
  if (query.trim()) return { title: `No tools match “${query.trim()}”.`, hint: "Try another name, or clear the search.", action: "clear-search" };
  if (category !== "All" && afterCategory === 0) return { title: `No ${category} tools${backend === "Any" ? "" : ` run on ${backend}`}.`, hint: "Choose another category or backend." };
  if (backend !== "Any" && afterBackend === 0) return { title: `No tools run on ${backend}.`, hint: "Choose another backend." };
  return { title: "No tools match these filters.", hint: "Clear a filter to see more." };
}

// ---------------------------------------------------------------------------
// Detail page: inputs form from inputs_schema (fallback: the inputs list), outputs
// ---------------------------------------------------------------------------
const TYPES = new Set(["string", "integer", "number", "boolean", "array", "object", "path", "file"]);

export function schemaFields(tool) {
  const schema = tool?.inputs_schema && typeof tool.inputs_schema === "object" ? tool.inputs_schema : {};
  const props = schema.properties && typeof schema.properties === "object" ? schema.properties : null;
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const list = Array.isArray(tool?.inputs) ? tool.inputs.filter(f => f && typeof f === "object" && f.name) : [];
  const byName = Object.fromEntries(list.map(f => [f.name, f]));
  const fields = [];
  if (props && Object.keys(props).length) {
    for (const [name, def] of Object.entries(props)) {
      const d = def && typeof def === "object" ? def : {};
      const extra = byName[name] || {};
      fields.push(field(name, { ...extra, ...d, required: required.has(name) || extra.required === true }));
    }
  }
  for (const f of list) if (!fields.some(x => x.name === f.name)) fields.push(field(f.name, f));
  return fields;
}

function field(name, d) {
  const type = TYPES.has(String(d.type)) ? String(d.type) : "string";
  return {
    name,
    type,
    required: d.required === true,
    description: typeof d.description === "string" ? d.description : "",
    default: d.default,
    enum: Array.isArray(d.enum) && d.enum.length ? d.enum.map(String) : null,
    minimum: typeof d.minimum === "number" ? d.minimum : null,
    maximum: typeof d.maximum === "number" ? d.maximum : null,
    secret: d.secret === true || d.format === "password",
  };
}

export function defaultValues(fields) {
  const out = {};
  for (const f of fields) {
    if (f.default === undefined || f.default === null) { out[f.name] = f.type === "boolean" ? false : ""; continue; }
    out[f.name] = f.type === "boolean" ? Boolean(f.default) : (f.type === "array" || f.type === "object") ? JSON.stringify(f.default) : String(f.default);
  }
  return out;
}

export function valuesFromInputs(fields, inputs) {
  const out = defaultValues(fields);
  for (const [k, v] of Object.entries(inputs || {})) {
    const f = fields.find(x => x.name === k);
    if (!f) { out[k] = typeof v === "string" ? v : JSON.stringify(v); continue; }
    out[k] = f.type === "boolean" ? Boolean(v) : (f.type === "array" || f.type === "object") && typeof v !== "string" ? JSON.stringify(v) : String(v);
  }
  return out;
}

// Validate and coerce the form values into the TES inputs payload.
export function validateInputs(fields, values) {
  const inputs = {};
  const errors = {};
  for (const f of fields) {
    const raw = values[f.name];
    const empty = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
    if (f.type === "boolean") { inputs[f.name] = Boolean(raw); continue; }
    if (empty) { if (f.required) errors[f.name] = "Required."; continue; }
    const text = String(raw).trim();
    if (f.type === "integer") {
      if (!/^-?\d+$/.test(text)) { errors[f.name] = "Must be a whole number."; continue; }
      inputs[f.name] = Number(text);
    } else if (f.type === "number") {
      if (!Number.isFinite(Number(text))) { errors[f.name] = "Must be a number."; continue; }
      inputs[f.name] = Number(text);
    } else if (f.type === "array" || f.type === "object") {
      try {
        const parsed = JSON.parse(text);
        if (f.type === "array" && !Array.isArray(parsed)) throw new Error("not an array");
        if (f.type === "object" && (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))) throw new Error("not an object");
        inputs[f.name] = parsed;
      } catch { errors[f.name] = f.type === "array" ? "Must be a JSON array, e.g. [\"a\", \"b\"]." : "Must be a JSON object."; continue; }
    } else {
      inputs[f.name] = text;
    }
    if (f.enum && !f.enum.includes(String(inputs[f.name]))) errors[f.name] = `Must be one of: ${f.enum.join(", ")}.`;
    if (f.minimum !== null && typeof inputs[f.name] === "number" && inputs[f.name] < f.minimum) errors[f.name] = `Must be at least ${f.minimum}.`;
    if (f.maximum !== null && typeof inputs[f.name] === "number" && inputs[f.name] > f.maximum) errors[f.name] = `Must be at most ${f.maximum}.`;
  }
  for (const [k, v] of Object.entries(values)) if (!fields.some(f => f.name === k) && typeof v === "string" && v.trim()) inputs[k] = v;
  return { inputs, errors, ok: Object.keys(errors).length === 0 };
}

export function outputRows(tool) {
  const schema = tool?.outputs_schema && typeof tool.outputs_schema === "object" ? tool.outputs_schema : {};
  const props = schema.properties && typeof schema.properties === "object" ? schema.properties : null;
  if (props && Object.keys(props).length) {
    return Object.entries(props).map(([name, d]) => ({ name, type: typeof d?.type === "string" ? d.type : "", description: typeof d?.description === "string" ? d.description : "" }));
  }
  const slurmOutputs = Array.isArray(tool?.slurm?.outputs) ? tool.slurm.outputs : Array.isArray(tool?.outputs) ? tool.outputs : [];
  if (slurmOutputs.length) return slurmOutputs.filter(o => o && typeof o === "object").map(o => ({ name: String(o.name || "output"), type: "file", description: o.pattern ? `Files matching ${o.pattern} in the run directory` : "" }));
  if (tool?.response_map && typeof tool.response_map === "object") return Object.keys(tool.response_map).map(name => ({ name, type: "", description: "From the service response" }));
  return [];
}

// Servers that can run the tool, from GET /api/tools/{id} (`servers`) or derived from /api/servers.
export function toolServers(tool, servers = []) {
  if (Array.isArray(tool?.servers)) return tool.servers;
  const id = tool?.tool_id;
  return (Array.isArray(servers) ? servers : []).filter(s => Array.isArray(s?.capabilities?.tools) && s.capabilities.tools.some(t => t?.tool_id === id))
    .map(s => ({ server_id: s.server_id, display_name: s.display_name || s.server_id, adapter_type: s.adapter_type,
      available: s.available !== false, unavailable_reason: s.unavailable_reason || null }));
}

export function serverBackendLabel(server) { return backendLabel(BACKEND_BY_ADAPTER[server?.adapter_type] || server?.adapter_type || ""); }

// Why a tool cannot be run from the page right now, or null.
export function runBlocker(verification, servers) {
  if (verification.status === "unavailable") return { title: "Unavailable", detail: verification.reason || "No backend can run this tool right now." };
  if (verification.status === "not_working") return { title: "Not working", detail: `This tool failed its last end-to-end run${verification.testedAt ? ` on ${verification.testedAt}` : ""}${verification.reason ? `: ${verification.reason}` : "."}` };
  if (Array.isArray(servers) && servers.length && servers.every(s => s.available === false)) {
    return { title: "Unavailable", detail: servers.map(s => `${s.display_name || s.server_id}: ${s.unavailable_reason || "unavailable"}`).join("; ") };
  }
  return null;
}

// Copyable curl for the same submission. $OMNIBIOAI_TOKEN stays a placeholder: no
// real token is ever rendered into the page or the clipboard.
export function curlCommand(toolId, inputs, origin = globalThis.window?.location?.origin || "") {
  const path = tesUrl("/api/runs/submit");
  const url = /^https?:\/\//.test(path) ? path : `${origin}${path}`;
  const body = JSON.stringify({ tool_id: toolId, inputs: inputs || {} }, null, 2).replace(/'/g, "'\\''");
  return `curl -sS -X POST '${url}' \\\n  -H 'Authorization: Bearer $OMNIBIOAI_TOKEN' \\\n  -H 'Content-Type: application/json' \\\n  -d '${body}'`;
}
