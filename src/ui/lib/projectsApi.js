import { getSessionVersion, getToken, isElectron } from "./session";

const WORKBENCH_PREFIX = "/_svc/workbench";
const PROJECTS_PATH = "/api/projects/";
const PROJECT_ID = /^[1-9][0-9]*$/;
const STATUSES = new Set(["active", "archived"]);

export class ProjectsApiError extends Error {
  constructor(code) {
    super(code);
    this.name = "ProjectsApiError";
    this.code = code;
  }
}

function workbenchUrl(path) {
  const origin = isElectron() ? (import.meta.env.DEV ? "http://localhost:5174" : "http://localhost") : "";
  return `${origin}${WORKBENCH_PREFIX}${path}`;
}

function projectPath(projectId, suffix = "") {
  const id = String(projectId ?? "");
  if (!PROJECT_ID.test(id)) throw new ProjectsApiError("invalid");
  return `${PROJECTS_PATH}${encodeURIComponent(id)}/${suffix}`;
}

function cleanText(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function normalizeProject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProjectsApiError("invalid");
  const projectId = Number.isSafeInteger(value.id) && value.id > 0 ? String(value.id) : "";
  const name = cleanText(value.name, 255);
  const description = cleanText(value.description, 10000);
  const status = cleanText(value.status, 16);
  const createdAt = validDate(value.created_at);
  const updatedAt = validDate(value.updated_at);
  if (!projectId || !name || !STATUSES.has(status) || createdAt === null || updatedAt === null) {
    throw new ProjectsApiError("invalid");
  }
  // Organization and creator remain backend authorization data, not Studio authority inputs.
  return Object.freeze({ projectId, name, description, status, createdAt, updatedAt });
}

function statusCode(status) {
  if (status === 400) return "invalid";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  return "unavailable";
}

async function request(path, { method = "GET", body, signal } = {}) {
  const token = getToken();
  const version = getSessionVersion();
  let response;
  try {
    response = await fetch(workbenchUrl(path), {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ProjectsApiError("unavailable");
  }
  if (token !== getToken() || version !== getSessionVersion()) throw new ProjectsApiError("stale");
  if (!response.ok) throw new ProjectsApiError(statusCode(response.status));
  let data;
  try { data = await response.json(); }
  catch { throw new ProjectsApiError("invalid"); }
  if (token !== getToken() || version !== getSessionVersion()) throw new ProjectsApiError("stale");
  return data;
}

function projectMetadata(values, { partial = false } = {}) {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new ProjectsApiError("invalid");
  const unknown = Object.keys(values).filter(key => !["name", "description"].includes(key));
  if (unknown.length) throw new ProjectsApiError("invalid");
  const payload = {};
  if (Object.hasOwn(values, "name")) {
    if (typeof values.name !== "string" || !values.name.trim() || values.name.trim().length > 255) {
      throw new ProjectsApiError("invalid");
    }
    payload.name = values.name.trim();
  }
  if (Object.hasOwn(values, "description")) {
    if (values.description !== null && typeof values.description !== "string") throw new ProjectsApiError("invalid");
    payload.description = values.description || "";
  }
  if ((!partial && !payload.name) || (partial && Object.keys(payload).length === 0)) throw new ProjectsApiError("invalid");
  return payload;
}

export async function listProjects({ status = "active", signal } = {}) {
  if (!["active", "archived", "all"].includes(status)) throw new ProjectsApiError("invalid");
  const data = await request(`${PROJECTS_PATH}?status=${encodeURIComponent(status)}`, { signal });
  if (!data || !Array.isArray(data.projects)) throw new ProjectsApiError("invalid");
  return Object.freeze(data.projects.map(normalizeProject));
}

export async function getProject(projectId, { signal } = {}) {
  return normalizeProject(await request(projectPath(projectId), { signal }));
}

export async function createProject(values, { signal } = {}) {
  return normalizeProject(await request(PROJECTS_PATH, { method: "POST", body: projectMetadata(values), signal }));
}

export async function updateProject(projectId, values, { signal } = {}) {
  return normalizeProject(await request(projectPath(projectId), {
    method: "PATCH", body: projectMetadata(values, { partial: true }), signal,
  }));
}

export async function archiveProject(projectId, { signal } = {}) {
  return normalizeProject(await request(projectPath(projectId, "archive/"), { method: "POST", signal }));
}
