import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getProjectWorkspace: vi.fn(), createProjectWorkspace: vi.fn(), getWorkspaceMembers: vi.fn(),
  searchMemberCandidates: vi.fn(), addWorkspaceMember: vi.fn(), updateWorkspaceMemberRole: vi.fn(),
  removeWorkspaceMember: vi.fn(), getProjectDiscussion: vi.fn(), createProjectComment: vi.fn(),
  updateProjectComment: vi.fn(), deleteProjectComment: vi.fn(),
}));
vi.mock("../../src/ui/lib/collaborationApi", () => api);

import ProjectCollaboration from "../../src/ui/components/projects/ProjectCollaboration";

const active = { projectId: "17", name: "Cancer atlas", status: "active" };
const archived = { ...active, status: "archived" };
const workspace = { workspaceId: "8", name: "Cancer atlas collaboration", description: "Shared findings", currentUserRole: "admin" };
const member = { membershipId: "12", displayName: "Researcher", email: "researcher@example.test", role: "viewer", joinedAt: "2026-10-01T12:00:00Z" };
const admin = { membershipId: "13", displayName: "Workspace admin", email: "admin@example.test", role: "admin", joinedAt: "2026-09-01T12:00:00Z" };
const comment = { commentId: "19", content: "Initial finding", createdAt: "2026-10-02T12:00:00Z" };

function renderCollaboration(project = active) {
  return render(<ProjectCollaboration project={project} formatDate={value => `date:${value}`} />);
}

beforeEach(() => {
  api.getProjectWorkspace.mockReset().mockResolvedValue(workspace);
  api.createProjectWorkspace.mockReset().mockResolvedValue(workspace);
  api.getWorkspaceMembers.mockReset().mockResolvedValue([admin, member]);
  api.searchMemberCandidates.mockReset().mockResolvedValue([{ principalId: "303", displayName: "Candidate", email: "candidate@example.test" }]);
  api.addWorkspaceMember.mockReset().mockResolvedValue(member);
  api.updateWorkspaceMemberRole.mockReset().mockResolvedValue({ ...member, role: "editor" });
  api.removeWorkspaceMember.mockReset().mockResolvedValue(undefined);
  api.getProjectDiscussion.mockReset().mockResolvedValue([comment]);
  api.createProjectComment.mockReset().mockResolvedValue(comment);
  api.updateProjectComment.mockReset().mockResolvedValue({ ...comment, content: "Revised" });
  api.deleteProjectComment.mockReset().mockResolvedValue(undefined);
});

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

describe("ProjectCollaboration", () => {
  it("offers workspace enablement for an active project and creates with editable fields only", async () => {
    api.getProjectWorkspace.mockResolvedValueOnce(null).mockResolvedValueOnce(workspace);
    renderCollaboration();
    fireEvent.click(await screen.findByRole("button", { name: "Enable collaboration" }));
    const dialog = screen.getByRole("dialog", { name: "Enable collaboration" });
    expect(within(dialog).getByLabelText("Workspace name")).toHaveValue("Cancer atlas collaboration");
    fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: "Study discussion" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enable collaboration" }));
    await waitFor(() => expect(api.createProjectWorkspace).toHaveBeenCalledWith("17", {
      name: "Cancer atlas collaboration", description: "Study discussion",
    }, { signal: expect.any(AbortSignal) }));
    expect(api.createProjectWorkspace.mock.calls[0][1]).not.toHaveProperty("organization_id");
    expect(await screen.findByText("Collaboration workspace enabled.")).toBeInTheDocument();
  });

  it("does not allow an archived project without a workspace to enable collaboration", async () => {
    api.getProjectWorkspace.mockResolvedValue(null);
    renderCollaboration(archived);
    expect(await screen.findByText("Collaboration cannot be enabled for an archived project.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enable collaboration" })).not.toBeInTheDocument();
  });

  it("renders the workspace summary and server-derived caller role", async () => {
    renderCollaboration();
    expect(await screen.findByText(workspace.name)).toBeInTheDocument();
    expect(screen.getByText(workspace.description)).toBeInTheDocument();
    expect(screen.getByText("Admin", { selector: ".collaboration-role" })).toBeInTheDocument();
    expect(document.querySelector('[data-project-detail-extension="collaboration"]')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("organization_id");
  });

  it("shows member administration only to admins", async () => {
    renderCollaboration();
    expect(await screen.findByRole("button", { name: "Add member" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Role for Researcher/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.queryByText("202")).not.toBeInTheDocument();
  });

  it.each(["editor", "viewer"])("hides member administration for %s", async callerRole => {
    api.getProjectWorkspace.mockResolvedValue({ ...workspace, currentUserRole: callerRole });
    renderCollaboration();
    expect(await screen.findByRole("heading", { name: "Members" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Role for/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Viewer", { selector: ".collaboration-role" }).length).toBeGreaterThan(0);
  });

  it("searches canonical candidates with debounce and adds with Viewer by default", async () => {
    renderCollaboration();
    fireEvent.click(await screen.findByRole("button", { name: "Add member" }));
    const dialog = screen.getByRole("dialog", { name: "Add member" });
    expect(within(dialog).queryByLabelText(/user id/i)).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Search organization members"), { target: { value: "can" } });
    expect(api.searchMemberCandidates).not.toHaveBeenCalled();
    await waitFor(() => expect(api.searchMemberCandidates).toHaveBeenCalledWith("8", "can", { signal: expect.any(AbortSignal) }));
    fireEvent.click(await within(dialog).findByLabelText(/Candidate/));
    expect(within(dialog).getByLabelText("Role")).toHaveValue("viewer");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add member" }));
    await act(async () => Promise.resolve());
    expect(api.addWorkspaceMember).toHaveBeenCalledWith("8", "303", "viewer");
  });

  it("supports Editor and Admin role selection for a canonical candidate", async () => {
    renderCollaboration();
    fireEvent.click(await screen.findByRole("button", { name: "Add member" }));
    const dialog = screen.getByRole("dialog", { name: "Add member" });
    fireEvent.change(within(dialog).getByLabelText("Search organization members"), { target: { value: "candidate" } });
    await waitFor(() => expect(api.searchMemberCandidates).toHaveBeenCalled());
    fireEvent.click(await within(dialog).findByLabelText(/Candidate/));
    const select = within(dialog).getByLabelText("Role");
    expect([...select.options].map(option => option.value)).toEqual(["viewer", "editor", "admin"]);
    fireEvent.change(select, { target: { value: "admin" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add member" }));
    await act(async () => Promise.resolve());
    expect(api.addWorkspaceMember).toHaveBeenCalledWith("8", "303", "admin");
  });

  it("shows the safe final-admin message after backend role rejection", async () => {
    api.updateWorkspaceMemberRole.mockRejectedValue(Object.assign(new Error("private database detail"), { code: "invalid" }));
    renderCollaboration();
    const select = await screen.findByLabelText(/Role for Workspace admin/);
    fireEvent.change(select, { target: { value: "viewer" } });
    expect(await screen.findByText("At least one workspace admin is required.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private database detail");
  });

  it("lets editors create discussion comments while viewers remain read-only", async () => {
    api.getProjectWorkspace.mockResolvedValue({ ...workspace, currentUserRole: "editor" });
    renderCollaboration();
    const input = await screen.findByLabelText("Add a comment");
    fireEvent.change(input, { target: { value: "New evidence" } });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    await waitFor(() => expect(api.createProjectComment).toHaveBeenCalledWith("8", "17", "New evidence"));
    cleanup();
    api.getProjectWorkspace.mockResolvedValue({ ...workspace, currentUserRole: "viewer" });
    renderCollaboration();
    expect(await screen.findByText("You have read-only access to this discussion.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
  });

  it("lists discussion and lets an admin edit and confirm deletion without chat UI", async () => {
    renderCollaboration();
    expect(await screen.findByText("Initial finding")).toBeInTheDocument();
    expect(screen.getByText(`date:${comment.createdAt}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const edit = screen.getByRole("dialog", { name: "Edit comment" });
    fireEvent.change(within(edit).getByLabelText("Comment"), { target: { value: "Revised finding" } });
    fireEvent.click(within(edit).getByRole("button", { name: "Save comment" }));
    await waitFor(() => expect(api.updateProjectComment).toHaveBeenCalledWith("19", "Revised finding"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const confirmation = screen.getByRole("dialog", { name: "Delete comment?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete comment" }));
    await waitFor(() => expect(api.deleteProjectComment).toHaveBeenCalledWith("19"));
    expect(document.body).not.toHaveTextContent(/real-time chat|typing|presence|websocket/i);
  });
});
