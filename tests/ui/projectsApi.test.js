import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: "session-token", version: 7, electron: false }));
vi.mock("../../src/ui/lib/session", () => ({
  getToken: () => session.token,
  getSessionVersion: () => session.version,
  isElectron: () => session.electron,
}));

import {
  ProjectsApiError,
  archiveProject,
  createProject,
  getProject,
  listProjects,
  normalizeProject,
  updateProject,
} from "../../src/ui/lib/projectsApi";

const rawProject = Object.freeze({
  id: 17,
  organization_id: 901,
  name: "Cancer atlas",
  description: "Organization-scoped study",
  created_by: 44,
  status: "active",
  created_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-02T12:00:00Z",
});

function response({ body = rawProject, status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: vi.fn(async () => body) };
}

beforeEach(() => {
  session.token = "session-token";
  session.version = 7;
  session.electron = false;
  vi.restoreAllMocks();
});

describe("Projects API", () => {
  it("lists active and archived projects through the exact Workbench browser proxy", async () => {
    const signal = new AbortController().signal;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ body: { projects: [rawProject] } }));
    const projects = await listProjects({ status: "all", signal });
    expect(fetchSpy).toHaveBeenCalledWith("/_svc/workbench/api/projects/?status=all", {
      method: "GET", credentials: "same-origin", cache: "no-store", signal,
      headers: { Accept: "application/json", Authorization: "Bearer session-token" },
    });
    expect(projects).toEqual([expect.objectContaining({ projectId: "17", name: "Cancer atlas", status: "active" })]);
    expect(String(fetchSpy.mock.calls[0][0])).not.toMatch(/organization/i);
  });

  it("uses the exact detail, update, and archive endpoints", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({ body: { ...rawProject, name: "Updated" } }))
      .mockResolvedValueOnce(response({ body: { ...rawProject, status: "archived" } }));
    await getProject("17");
    await updateProject("17", { name: " Updated ", description: "Revised" });
    await archiveProject("17");
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      "/_svc/workbench/api/projects/17/",
      "/_svc/workbench/api/projects/17/",
      "/_svc/workbench/api/projects/17/archive/",
    ]);
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: "GET" });
    expect(fetchSpy.mock.calls[1][1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ name: "Updated", description: "Revised" }) });
    expect(fetchSpy.mock.calls[2][1]).toMatchObject({ method: "POST" });
    expect(fetchSpy.mock.calls[2][1]).not.toHaveProperty("body");
  });

  it("creates with only name and description and never sends organization or creator identity", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ body: rawProject, status: 201 }));
    await createProject({ name: " Cancer atlas ", description: "Study" });
    expect(fetchSpy).toHaveBeenCalledWith("/_svc/workbench/api/projects/", expect.objectContaining({
      method: "POST", body: JSON.stringify({ name: "Cancer atlas", description: "Study" }),
    }));
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("organization_id");
    expect(body).not.toHaveProperty("created_by");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("id");
  });

  it.each(["organization_id", "created_by", "status", "id"])("rejects client-controlled %s before sending a request", async field => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(createProject({ name: "Injected", [field]: 99 })).rejects.toBeInstanceOf(ProjectsApiError);
    await expect(updateProject("17", { name: "Injected", [field]: 99 })).rejects.toBeInstanceOf(ProjectsApiError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("normalizes safe display fields and omits organization and creator authority metadata", () => {
    const project = normalizeProject(rawProject);
    expect(project).toEqual({
      projectId: "17", name: rawProject.name, description: rawProject.description, status: "active",
      createdAt: rawProject.created_at, updatedAt: rawProject.updated_at,
    });
    expect(project).not.toHaveProperty("organization_id");
    expect(project).not.toHaveProperty("organizationId");
    expect(project).not.toHaveProperty("created_by");
    expect(project).not.toHaveProperty("createdBy");
  });

  it.each([
    [400, "invalid"], [401, "unauthorized"], [403, "forbidden"], [404, "not_found"], [500, "unavailable"],
  ])("maps HTTP %s without reading backend error details", async (status, code) => {
    const backend = response({ status, body: { error: { message: "private organization detail" } } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(backend);
    await expect(getProject("17")).rejects.toMatchObject({ name: "ProjectsApiError", code, message: code });
    expect(backend.json).not.toHaveBeenCalled();
  });

  it("rejects malformed identifiers, non-JSON responses, and invalid project payloads", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(getProject("../other-org")).rejects.toMatchObject({ code: "invalid" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockResolvedValueOnce({ ...response(), json: vi.fn(async () => { throw new Error("private HTML"); }) });
    await expect(listProjects()).rejects.toMatchObject({ code: "invalid" });
    fetchSpy.mockResolvedValueOnce(response({ body: { projects: [{ ...rawProject, status: "invented" }] } }));
    await expect(listProjects()).rejects.toMatchObject({ code: "invalid" });
  });

  it("uses the existing Electron Workbench proxy origin convention", async () => {
    session.electron = true;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ body: { projects: [] } }));
    await listProjects({ status: "archived" });
    expect(fetchSpy.mock.calls[0][0]).toMatch(/^http:\/\/localhost(?::5174)?\/_svc\/workbench\/api\/projects\/\?status=archived$/);
  });

  it("discards a response when the authenticated session changes during JSON parsing", async () => {
    let release;
    const body = new Promise(resolve => { release = resolve; });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ...response(), json: vi.fn(() => body) });
    const pending = listProjects({ status: "all" });
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    session.version += 1;
    release({ projects: [rawProject] });
    await expect(pending).rejects.toMatchObject({ code: "stale" });
  });

  it("preserves AbortError and normalizes network failures", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockRejectedValueOnce(new DOMException("cancelled", "AbortError"));
    await expect(listProjects()).rejects.toMatchObject({ name: "AbortError" });
    fetchSpy.mockRejectedValueOnce(new Error("private host refused"));
    await expect(listProjects()).rejects.toMatchObject({ code: "unavailable", message: "unavailable" });
  });
});
