import { isElectron, getToken } from "./session";
import { applicationUrl, loadWorkbenchCatalog } from "./workbenchApi";

const STATIC_SERVICES = [
  { id: "studio-workflows", type: "workflow", name: "Workflows", description: "WDL/NF/Snake/CWL workflow bundles", tags: ["workflow bundles"], destination: { kind: "service", url: "/_svc/workflows", label: "Workflows" }, source: "studio-navigation" },
  { id: "studio-tool-executor", type: "service", name: "Tool Executor", description: "Register, execute and inspect tools", tags: ["execution", "tools"], destination: { kind: "service", url: "/_svc/toolserver/docs", label: "Tool Executor" }, source: "studio-navigation" },
];

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function list(value) { return (Array.isArray(value) ? value : [value]).map(text).filter(Boolean); }
function toolRecords(data) { return Array.isArray(data) ? data : (Array.isArray(data?.tools) ? data.tools : []); }

function toolResource(tool) {
  const id = text(tool?.tool_id || tool?.id || tool?.name);
  if (!id) return null;
  return { id: `tool:${id}`, type: "tool", name: text(tool?.name) || id, description: text(tool?.description), tags: list(tool?.tags || tool?.categories || tool?.category), destination: { kind: "navigate", page: 9, label: "Open Jobs" }, source: "tes-tool-registry" };
}

function capabilityResources(record, destination, source) {
  return list(record?.capabilities || record?.scientific_capabilities).map(capability => ({
    id: `${source}:capability:${capability.toLowerCase()}`, type: "capability", name: capability, description: text(record?.description), tags: list(record?.tags || record?.category), destination, source,
  }));
}

function workbenchResources(catalog) {
  return (catalog?.categories || []).flatMap(category => (category.plugins || []).flatMap(plugin => {
    const destination = { kind: "service", url: applicationUrl(plugin.launch_path), label: plugin.title };
    const resource = { id: `workbench:${plugin.slug}`, type: "service", name: plugin.title, description: plugin.description, tags: list(plugin.tags || plugin.category), destination, source: "workbench-catalog" };
    return [resource, ...capabilityResources(plugin, destination, "workbench-catalog")];
  }));
}

async function loadToolRegistry({ signal } = {}) {
  const host = window.__OMNIBIOAI_SERVER__ || import.meta.env.VITE_HOST || "webstudio.omnibioai.org";
  const url = isElectron() ? `http://${host}:8081/api/tools` : "/_tes/api/tools";
  const token = getToken();
  const response = await fetch(url, { headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, credentials: "same-origin", signal: signal || AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Unable to load tool registry (${response.status}).`);
  let data;
  try { data = await response.json(); } catch { throw new Error("Tool registry returned invalid data."); }
  if (!Array.isArray(data) && !Array.isArray(data?.tools)) throw new Error("Tool registry returned invalid data.");
  return data;
}

export async function loadExploreResources({ signal } = {}) {
  const [workbench, tools] = await Promise.allSettled([loadWorkbenchCatalog({ signal }), loadToolRegistry({ signal })]);
  const failures = [];
  const resources = [...STATIC_SERVICES];
  if (workbench.status === "fulfilled") resources.push(...workbenchResources(workbench.value));
  else if (workbench.reason?.name !== "AbortError") failures.push("some applications");
  if (tools.status === "fulfilled") resources.push(...toolRecords(tools.value).map(toolResource).filter(Boolean));
  else if (tools.reason?.name !== "AbortError") failures.push("some tools");
  return { resources, failures };
}

export { STATIC_SERVICES, loadToolRegistry, workbenchResources };
