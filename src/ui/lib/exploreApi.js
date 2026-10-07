import { isElectron, getToken } from "./session";
import { applicationUrl, loadWorkbenchCatalog } from "./workbenchApi";
import { loadDomainResources } from "./exploreDomains";

const STATIC_SERVICES = [
  { id: "studio-tool-executor", type: "service", name: "Tool Executor", description: "Register, execute and inspect tools", tags: ["execution", "tools"], destination: { kind: "service", url: "/_svc/toolserver/docs", label: "Tool Executor" }, source: "studio-navigation" },
];

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function list(value) { return (Array.isArray(value) ? value : [value]).map(text).filter(Boolean); }
function toolRecords(data) { return Array.isArray(data) ? data : (Array.isArray(data?.tools) ? data.tools : []); }

function workflowRecords(data) { return Array.isArray(data) ? data : (Array.isArray(data?.workflows) ? data.workflows : []); }

function toolResource(tool) {
  const id = text(tool?.tool_id || tool?.id || tool?.name);
  if (!id) return null;
  return { id: `tool:${id}`, type: "tool", name: text(tool?.name) || id, description: text(tool?.description), tags: list(tool?.tags || tool?.categories || tool?.category), destination: { kind: "navigate", page: 9, label: "Open Jobs" }, source: "tes-tool-registry" };
}

function capabilityResource(id, name, description, tags, destination, source) {
  return { id: `${source}:capability:${id}`, type: "capability", name, description, tags, destination, source };
}

function workflowResources(data) {
  return workflowRecords(data).flatMap(workflow => {
    const id = workflow?.id !== undefined && workflow?.id !== null ? String(workflow.id) : text(workflow?.name);
    const engine = text(workflow?.engine);
    if (!id || !text(workflow?.display_name || workflow?.name) || !engine) return [];
    const destination = { kind: "service", url: "/_svc/workflows", label: "Workflow Registry" };
    const tags = list([workflow.category, workflow.engine]);
    const resource = {
      id: `workflow:${id}`,
      type: "workflow",
      name: text(workflow.display_name) || text(workflow.name),
      description: text(workflow.description),
      tags,
      destination,
      source: "workflow-registry",
    };
    return [resource, capabilityResource(`workflow-engine:${engine.toLowerCase()}`, `${engine} workflows`, `Workflow engine used by ${resource.name}.`, [engine], destination, "workflow-registry")];
  });
}

function workbenchResources(catalog) {
  return (catalog?.categories || []).flatMap(category => (category.plugins || []).map(plugin => ({
    id: `workbench:${plugin.slug}`, type: "service", name: plugin.title, description: plugin.description, tags: list(plugin.tags || plugin.category), destination: { kind: "service", url: applicationUrl(plugin.launch_path), label: plugin.title }, source: "workbench-catalog",
  })));
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

async function loadWorkflowRegistry({ signal } = {}) {
  const host = window.__OMNIBIOAI_SERVER__ || import.meta.env.VITE_HOST || "webstudio.omnibioai.org";
  const url = isElectron() ? `http://${host}:8098/v1/workflows` : "/_svc/workflows/v1/workflows";
  const token = getToken();
  const response = await fetch(url, { headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, credentials: "same-origin", signal: signal || AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Unable to load workflow registry (${response.status}).`);
  const data = await response.json().catch(() => null);
  if (!Array.isArray(data) && !Array.isArray(data?.workflows)) throw new Error("Workflow registry returned invalid data.");
  return data;
}

async function loadRuntimeMetadata({ signal } = {}) {
  const host = window.__OMNIBIOAI_SERVER__ || import.meta.env.VITE_HOST || "webstudio.omnibioai.org";
  const url = isElectron() ? `http://${host}:8081/api/servers` : "/_tes/api/servers";
  const token = getToken();
  const response = await fetch(url, { headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, credentials: "same-origin", signal: signal || AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Unable to load runtime metadata (${response.status}).`);
  const data = await response.json().catch(() => null);
  if (!Array.isArray(data)) throw new Error("Runtime metadata returned invalid data.");
  return data;
}

function runtimeCapabilities(servers) {
  return servers.flatMap(server => {
    const adapter = text(server?.adapter_type || server?.server_id);
    if (!adapter) return [];
    const capabilityNames = Object.keys(server?.capabilities || {}).filter(key => key !== "tool_count");
    return [capabilityResource(`runtime:${adapter}`, `${adapter} runtime`, "Registered execution runtime available through TES.", [adapter, ...capabilityNames], { kind: "navigate", page: 9, label: "Open Jobs" }, "tes-runtime-registry")];
  });
}

function uniqueResources(resources) {
  return [...new Map(resources.map(resource => [resource.id, resource])).values()];
}

export async function loadExploreResources({ signal } = {}) {
  const [workbench, tools, workflows, runtimes, domains] = await Promise.allSettled([loadWorkbenchCatalog({ signal }), loadToolRegistry({ signal }), loadWorkflowRegistry({ signal }), loadRuntimeMetadata({ signal }), loadDomainResources()]);
  const failures = [];
  const resources = [...STATIC_SERVICES];
  if (workbench.status === "fulfilled") resources.push(...workbenchResources(workbench.value));
  else if (workbench.reason?.name !== "AbortError") failures.push("some applications");
  if (tools.status === "fulfilled") resources.push(...toolRecords(tools.value).map(toolResource).filter(Boolean));
  else if (tools.reason?.name !== "AbortError") failures.push("some tools");
  if (workflows.status === "fulfilled") resources.push(...workflowResources(workflows.value));
  else if (workflows.reason?.name !== "AbortError") failures.push("some workflows");
  if (runtimes.status === "fulfilled") resources.push(...runtimeCapabilities(runtimes.value));
  else if (runtimes.reason?.name !== "AbortError") failures.push("runtime metadata");
  if (domains.status === "fulfilled") resources.push(...domains.value);
  else failures.push("some domains");
  return { resources: uniqueResources(resources), failures };
}

export { STATIC_SERVICES, loadToolRegistry, loadWorkflowRegistry, loadRuntimeMetadata, runtimeCapabilities, uniqueResources, workflowResources, workbenchResources };
