import { getSessionVersion, getToken, isElectron } from "./session";

const WORKBENCH_PREFIX = "/_svc/workbench";
const API_PATH = "/plugins/collaboration/api/";
const POSITIVE_ID = /^[1-9][0-9]*$/;
const PRINCIPAL_ID = /^[1-9][0-9]*$/;
const ROLES = new Set(["admin", "editor", "viewer"]);

export class CollaborationApiError extends Error {
  constructor(code) {
    super(code);
    this.name = "CollaborationApiError";
    this.code = code;
  }
}

function workbenchUrl(path) {
  const origin = isElectron() ? (import.meta.env.DEV ? "http://localhost:5174" : "http://localhost") : "";
  return `${origin}${WORKBENCH_PREFIX}${API_PATH}${path}`;
}

function id(value) {
  const normalized = String(value ?? "");
  if (!POSITIVE_ID.test(normalized)) throw new CollaborationApiError("invalid");
  return normalized;
}

function text(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function date(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : "";
}

function role(value) {
  if (!ROLES.has(value)) throw new CollaborationApiError("invalid");
  return value;
}

function errorCode(status) {
  if (status === 400 || status === 409) return "invalid";
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
    throw new CollaborationApiError("unavailable");
  }
  if (token !== getToken() || version !== getSessionVersion()) throw new CollaborationApiError("stale");
  if (!response.ok) throw new CollaborationApiError(errorCode(response.status));
  if (response.status === 204) return null;
  let data;
  try { data = await response.json(); }
  catch { throw new CollaborationApiError("invalid"); }
  if (token !== getToken() || version !== getSessionVersion()) throw new CollaborationApiError("stale");
  return data;
}

function normalizeWorkspace(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CollaborationApiError("invalid");
  const workspaceId = Number.isSafeInteger(value.id) && value.id > 0 ? String(value.id) : "";
  const currentUserRole = value.current_user_role;
  if (!workspaceId || !text(value.name, 255) || !ROLES.has(currentUserRole)) throw new CollaborationApiError("invalid");
  return Object.freeze({
    workspaceId,
    name: text(value.name, 255),
    description: text(value.description, 10000),
    currentUserRole,
  });
}

function normalizeMember(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CollaborationApiError("invalid");
  const membershipId = Number.isSafeInteger(value.id) && value.id > 0 ? String(value.id) : "";
  const joinedAt = date(value.joined_at);
  if (!membershipId || !ROLES.has(value.role) || !joinedAt) throw new CollaborationApiError("invalid");
  return Object.freeze({
    membershipId,
    displayName: text(value.display_name, 255) || text(value.email, 254) || "Workspace member",
    email: text(value.email, 254),
    role: value.role,
    joinedAt,
  });
}

function normalizeCandidate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CollaborationApiError("invalid");
  const principalId = text(value.principal_id, 128);
  const email = text(value.email, 254);
  if (!PRINCIPAL_ID.test(principalId) || !email) throw new CollaborationApiError("invalid");
  return Object.freeze({ principalId, displayName: text(value.display_name, 255) || email, email });
}

function normalizeComment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CollaborationApiError("invalid");
  const commentId = Number.isSafeInteger(value.id) && value.id > 0 ? String(value.id) : "";
  const createdAt = date(value.created_at);
  if (!commentId || typeof value.content !== "string" || !createdAt) throw new CollaborationApiError("invalid");
  return Object.freeze({ commentId, content: text(value.content, 100000), createdAt });
}

function workspaceValues(projectId, values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new CollaborationApiError("invalid");
  if (Object.keys(values).some(key => !["name", "description"].includes(key))) throw new CollaborationApiError("invalid");
  const name = typeof values.name === "string" ? values.name.trim() : "";
  if (!name || name.length > 255 || (values.description != null && typeof values.description !== "string")) {
    throw new CollaborationApiError("invalid");
  }
  return { name, description: values.description || "", project_id: Number(id(projectId)) };
}

function discussionObject(projectId) {
  return `project:${id(projectId)}`;
}

export async function getProjectWorkspace(projectId, { signal } = {}) {
  const data = await request(`workspaces/?project_id=${encodeURIComponent(id(projectId))}`, { signal });
  if (!Array.isArray(data) || data.length > 1) throw new CollaborationApiError("invalid");
  return data.length ? normalizeWorkspace(data[0]) : null;
}

export async function createProjectWorkspace(projectId, values, { signal } = {}) {
  return normalizeWorkspace(await request("workspaces/", {
    method: "POST", body: workspaceValues(projectId, values), signal,
  }));
}

export async function getWorkspaceMembers(workspaceId, { signal } = {}) {
  const data = await request(`memberships/?workspace=${encodeURIComponent(id(workspaceId))}`, { signal });
  if (!Array.isArray(data)) throw new CollaborationApiError("invalid");
  return Object.freeze(data.map(normalizeMember));
}

export async function searchMemberCandidates(workspaceId, query, { signal } = {}) {
  const term = typeof query === "string" ? query.trim() : "";
  if (term.length < 3 || term.length > 100) throw new CollaborationApiError("invalid");
  const data = await request(`member-candidates/?workspace=${encodeURIComponent(id(workspaceId))}&q=${encodeURIComponent(term)}`, { signal });
  if (!Array.isArray(data)) throw new CollaborationApiError("invalid");
  return Object.freeze(data.map(normalizeCandidate));
}

export async function addWorkspaceMember(workspaceId, principalId, memberRole, { signal } = {}) {
  const principal = String(principalId ?? "");
  if (!PRINCIPAL_ID.test(principal)) throw new CollaborationApiError("invalid");
  return normalizeMember(await request("memberships/", {
    method: "POST", body: { workspace: Number(id(workspaceId)), principal_id: principal, role: role(memberRole) }, signal,
  }));
}

export async function updateWorkspaceMemberRole(membershipId, memberRole, { signal } = {}) {
  return normalizeMember(await request(`memberships/${id(membershipId)}/`, {
    method: "PATCH", body: { role: role(memberRole) }, signal,
  }));
}

export async function removeWorkspaceMember(membershipId, { signal } = {}) {
  await request(`memberships/${id(membershipId)}/`, { method: "DELETE", signal });
}

export async function getProjectDiscussion(workspaceId, projectId, { signal } = {}) {
  const objectId = discussionObject(projectId);
  const data = await request(`comments/?workspace=${encodeURIComponent(id(workspaceId))}&object_id=${encodeURIComponent(objectId)}`, { signal });
  if (!Array.isArray(data)) throw new CollaborationApiError("invalid");
  return Object.freeze(data.map(normalizeComment));
}

export async function createProjectComment(workspaceId, projectId, content, { signal } = {}) {
  const value = typeof content === "string" ? content.trim() : "";
  if (!value) throw new CollaborationApiError("invalid");
  return normalizeComment(await request("comments/", {
    method: "POST",
    body: { workspace: Number(id(workspaceId)), plugin_name: "omnibioai", object_id: discussionObject(projectId), content: value },
    signal,
  }));
}

export async function updateProjectComment(commentId, content, { signal } = {}) {
  const value = typeof content === "string" ? content.trim() : "";
  if (!value) throw new CollaborationApiError("invalid");
  return normalizeComment(await request(`comments/${id(commentId)}/`, {
    method: "PATCH", body: { content: value }, signal,
  }));
}

export async function deleteProjectComment(commentId, { signal } = {}) {
  await request(`comments/${id(commentId)}/`, { method: "DELETE", signal });
}
