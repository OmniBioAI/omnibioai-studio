import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: "session-token", version: 4, electron: false }));
vi.mock("../../src/ui/lib/session", () => ({
  getToken: () => session.token,
  getSessionVersion: () => session.version,
  isElectron: () => session.electron,
}));

import {
  CollaborationApiError,
  addWorkspaceMember,
  createProjectComment,
  createProjectWorkspace,
  deleteProjectComment,
  getProjectDiscussion,
  getProjectWorkspace,
  getWorkspaceMembers,
  removeWorkspaceMember,
  searchMemberCandidates,
  updateProjectComment,
  updateWorkspaceMemberRole,
} from "../../src/ui/lib/collaborationApi";

const workspace = { id: 8, name: "Cancer atlas collaboration", description: "Shared study", current_user_role: "admin" };
const member = { id: 12, principal_id: "202", display_name: "Researcher", email: "researcher@example.test", workspace: 8, role: "viewer", joined_at: "2026-10-01T12:00:00Z" };
const candidate = { principal_id: "303", display_name: "Candidate", email: "candidate@example.test" };
const comment = { id: 19, workspace: 8, plugin_name: "omnibioai", object_id: "project:17", content: "Finding", author: 99, created_at: "2026-10-02T12:00:00Z", parent: null };

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: vi.fn(async () => body) };
}

beforeEach(() => {
  session.token = "session-token";
  session.version = 4;
  session.electron = false;
  vi.restoreAllMocks();
});

describe("Collaboration API", () => {
  it("gets the project workspace through the Workbench proxy", async () => {
    const signal = new AbortController().signal;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response([workspace]));
    await expect(getProjectWorkspace("17", { signal })).resolves.toEqual({
      workspaceId: "8", name: workspace.name, description: workspace.description, currentUserRole: "admin",
    });
    expect(fetchSpy).toHaveBeenCalledWith("/_svc/workbench/plugins/collaboration/api/workspaces/?project_id=17", {
      method: "GET", credentials: "same-origin", cache: "no-store", signal,
      headers: { Accept: "application/json", Authorization: "Bearer session-token" },
    });
  });

  it("creates a workspace using only editable fields and the project relationship", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(workspace, 201));
    await createProjectWorkspace("17", { name: " Cancer atlas collaboration ", description: "Shared study" });
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({
      name: "Cancer atlas collaboration", description: "Shared study", project_id: 17,
    });
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  it("lists members and searches canonical candidates", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response([member])).mockResolvedValueOnce(response([candidate]));
    const members = await getWorkspaceMembers("8");
    const candidates = await searchMemberCandidates("8", " cand ");
    expect(members[0]).toEqual(expect.objectContaining({ membershipId: "12", displayName: "Researcher", role: "viewer" }));
    expect(members[0]).not.toHaveProperty("principalId");
    expect(candidates).toEqual([{ principalId: "303", displayName: "Candidate", email: "candidate@example.test" }]);
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      "/_svc/workbench/plugins/collaboration/api/memberships/?workspace=8",
      "/_svc/workbench/plugins/collaboration/api/member-candidates/?workspace=8&q=cand",
    ]);
  });

  it("adds, updates, and removes membership with narrow bodies", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(member, 201))
      .mockResolvedValueOnce(response({ ...member, role: "editor" }))
      .mockResolvedValueOnce({ ok: true, status: 204 });
    await addWorkspaceMember("8", "303", "viewer");
    await updateWorkspaceMemberRole("12", "editor");
    await removeWorkspaceMember("12");
    expect(fetchSpy.mock.calls.map(([url, options]) => [url, options.method, options.body])).toEqual([
      ["/_svc/workbench/plugins/collaboration/api/memberships/", "POST", JSON.stringify({ workspace: 8, principal_id: "303", role: "viewer" })],
      ["/_svc/workbench/plugins/collaboration/api/memberships/12/", "PATCH", JSON.stringify({ role: "editor" })],
      ["/_svc/workbench/plugins/collaboration/api/memberships/12/", "DELETE", undefined],
    ]);
  });

  it("lists, creates, edits, and deletes the canonical project discussion", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response([comment]))
      .mockResolvedValueOnce(response(comment, 201))
      .mockResolvedValueOnce(response({ ...comment, content: "Revised" }))
      .mockResolvedValueOnce({ ok: true, status: 204 });
    await getProjectDiscussion("8", "17");
    await createProjectComment("8", "17", " Finding ");
    await updateProjectComment("19", " Revised ");
    await deleteProjectComment("19");
    expect(fetchSpy.mock.calls[0][0]).toBe("/_svc/workbench/plugins/collaboration/api/comments/?workspace=8&object_id=project%3A17");
    expect(JSON.parse(fetchSpy.mock.calls[1][1].body)).toEqual({ workspace: 8, plugin_name: "omnibioai", object_id: "project:17", content: "Finding" });
    expect(JSON.parse(fetchSpy.mock.calls[2][1].body)).toEqual({ content: "Revised" });
    expect(fetchSpy.mock.calls[3][1]).toMatchObject({ method: "DELETE" });
  });

  it("rejects authority injection and arbitrary identifiers before fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const field of ["organization_id", "created_by", "current_user_role", "caller"]) {
      await expect(createProjectWorkspace("17", { name: "Injected", [field]: 9 })).rejects.toBeInstanceOf(CollaborationApiError);
    }
    await expect(addWorkspaceMember("8", "someone@example.test", "viewer")).rejects.toMatchObject({ code: "invalid" });
    await expect(searchMemberCandidates("8", "ab")).rejects.toMatchObject({ code: "invalid" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses bearer mutation auth without inventing a CSRF header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(comment, 201));
    await createProjectComment("8", "17", "Finding");
    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer session-token");
    expect(headers).not.toHaveProperty("X-CSRFToken");
    expect(fetchSpy.mock.calls[0][1].credentials).toBe("same-origin");
  });

  it("maps safe errors and rejects stale session responses", async () => {
    const forbidden = response({ detail: "private IAM claim" }, 403);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(forbidden);
    await expect(getProjectWorkspace("17")).rejects.toMatchObject({ code: "forbidden", message: "forbidden" });
    expect(forbidden.json).not.toHaveBeenCalled();

    let release;
    const body = new Promise(resolve => { release = resolve; });
    globalThis.fetch.mockResolvedValueOnce({ ...response([]), json: vi.fn(() => body) });
    const pending = getProjectWorkspace("17");
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    session.version += 1;
    release([]);
    await expect(pending).rejects.toMatchObject({ code: "stale" });
  });
});
