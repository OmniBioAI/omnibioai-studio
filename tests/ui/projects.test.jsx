import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listProjects: vi.fn(), getProject: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(), archiveProject: vi.fn(),
}));
vi.mock("../../src/ui/lib/projectsApi", () => api);
vi.mock("../../src/ui/components/PreferencesProvider", () => ({
  useAccountDateTime: () => value => value ? `date:${value}` : "Unavailable",
}));
vi.mock("../../src/ui/components/projects/ProjectCollaboration", () => ({
  default: () => <div data-project-detail-extension="collaboration" />,
}));

import Projects from "../../src/ui/pages/Projects";

const active = Object.freeze({
  projectId: "17", name: "Cancer atlas", description: "Organization-scoped study", status: "active",
  createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-02T12:00:00Z",
});
const archived = Object.freeze({
  projectId: "23", name: "Completed cohort", description: "Durable archived record", status: "archived",
  createdAt: "2026-08-01T12:00:00Z", updatedAt: "2026-09-02T12:00:00Z",
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function openProject(project = active) {
  fireEvent.click(await screen.findByRole("button", { name: `Open ${project.name}` }));
  const dialog = await screen.findByRole("dialog", { name: project.name });
  await waitFor(() => expect(api.getProject).toHaveBeenCalledWith(project.projectId, expect.any(Object)));
  return dialog;
}

beforeEach(() => {
  api.listProjects.mockReset().mockResolvedValue([]);
  api.getProject.mockReset().mockImplementation(async id => id === archived.projectId ? archived : active);
  api.createProject.mockReset().mockResolvedValue(active);
  api.updateProject.mockReset().mockResolvedValue(active);
  api.archiveProject.mockReset().mockResolvedValue({ ...active, status: "archived", updatedAt: "2026-10-03T12:00:00Z" });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Projects page", () => {
  it("renders loading and then a truthful empty state without fake records", async () => {
    const pending = deferred();
    api.listProjects.mockReturnValue(pending.promise);
    render(<Projects />);
    expect(screen.getByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading projects");
    expect(document.querySelector(".project-list")).not.toBeInTheDocument();
    await act(async () => pending.resolve([]));
    expect(await screen.findByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Project workspace integration is not yet available");
    expect(localStorage.length).toBe(0);
  });

  it("lists canonical metadata and distinguishes active and archived projects", async () => {
    api.listProjects.mockResolvedValue([active, archived]);
    render(<Projects />);
    expect(await screen.findByText(active.name)).toBeInTheDocument();
    expect(screen.queryByText(archived.name)).not.toBeInTheDocument();
    expect(screen.getByText(`Updated date:${active.updatedAt}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archived" }));
    expect(screen.getByText(archived.name)).toBeInTheDocument();
    expect(screen.queryByText(active.name)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText(active.name)).toBeInTheDocument();
    expect(screen.getByText(archived.name)).toBeInTheDocument();
    expect(api.listProjects).toHaveBeenCalledWith({ status: "all", signal: expect.any(AbortSignal) });
  });

  it("shows a safe list error and retries instead of presenting an empty state", async () => {
    api.listProjects.mockRejectedValueOnce(Object.assign(new Error("private backend body"), { code: "unavailable" }))
      .mockResolvedValueOnce([active]);
    render(<Projects />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Projects are unavailable right now");
    expect(screen.queryByText("private backend body")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No projects yet" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(active.name)).toBeInTheDocument();
    expect(api.listProjects).toHaveBeenCalledTimes(2);
  });

  it("loads canonical detail and exposes a stable collaboration insertion point without collaboration UI", async () => {
    api.listProjects.mockResolvedValue([active]);
    const { container } = render(<Projects />);
    const dialog = await openProject();
    expect(within(dialog).getByRole("heading", { name: active.name })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(within(dialog).getByText(`date:${active.createdAt}`)).toBeInTheDocument();
    expect(container.querySelector('[data-project-detail-extension="collaboration"]')).toBeInTheDocument();
    expect(screen.queryByText(/members|comments|workspace|enable collaboration/i)).not.toBeInTheDocument();
  });

  it("keeps list state intact when direct detail access becomes unavailable", async () => {
    api.listProjects.mockResolvedValue([active]);
    api.getProject.mockRejectedValue(Object.assign(new Error("hidden other org"), { code: "not_found" }));
    render(<Projects />);
    const dialog = await openProject();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("This project is unavailable");
    expect(screen.queryByText("hidden other org")).not.toBeInTheDocument();
    expect(screen.getAllByText(active.name).length).toBeGreaterThan(0);
  });

  it("validates required name and creates using only editable metadata", async () => {
    api.listProjects.mockResolvedValue([]);
    const created = { ...active, projectId: "31", name: "New study", description: "New description" };
    api.createProject.mockResolvedValue(created);
    api.getProject.mockImplementation(async id => id === created.projectId ? created : active);
    render(<Projects />);
    await screen.findByRole("heading", { name: "No projects yet" });
    fireEvent.click(screen.getAllByRole("button", { name: "Create project" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Create project" });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Create project" }).closest("form"));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Project name is required");
    expect(api.createProject).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: " New study " } });
    fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: "New description" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith(
      { name: " New study ", description: "New description" }, { signal: expect.any(AbortSignal) },
    ));
    const payload = api.createProject.mock.calls[0][0];
    expect(payload).not.toHaveProperty("organization_id");
    expect(payload).not.toHaveProperty("created_by");
    expect(payload).not.toHaveProperty("status");
    expect(await screen.findByRole("dialog", { name: created.name })).toBeInTheDocument();
  });

  it("prevents duplicate create submissions while the canonical request is pending", async () => {
    api.listProjects.mockResolvedValue([]);
    const pending = deferred();
    api.createProject.mockReturnValue(pending.promise);
    render(<Projects />);
    await screen.findByRole("heading", { name: "No projects yet" });
    fireEvent.click(screen.getAllByRole("button", { name: "Create project" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Create project" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Only once" } });
    const submit = within(dialog).getByRole("button", { name: "Create project" });
    fireEvent.click(submit);
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
    expect(api.createProject).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ ...active, name: "Only once" }));
  });

  it("shows a safe create failure and retains entered values", async () => {
    api.listProjects.mockResolvedValue([]);
    api.createProject.mockRejectedValue(Object.assign(new Error("database trace"), { code: "unavailable" }));
    render(<Projects />);
    await screen.findByRole("heading", { name: "No projects yet" });
    fireEvent.click(screen.getAllByRole("button", { name: "Create project" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Create project" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Retained" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be created");
    expect(screen.queryByText("database trace")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Retained");
  });

  it("edits only project name and description using the canonical response", async () => {
    api.listProjects.mockResolvedValue([active]);
    const updated = { ...active, name: "Curated atlas", description: "Revised description" };
    api.updateProject.mockResolvedValue(updated);
    render(<Projects />);
    const detail = await openProject();
    fireEvent.click(within(detail).getByRole("button", { name: "Edit project" }));
    const edit = screen.getByRole("dialog", { name: "Edit project" });
    fireEvent.change(within(edit).getByLabelText("Name"), { target: { value: updated.name } });
    fireEvent.change(within(edit).getByLabelText("Description"), { target: { value: updated.description } });
    fireEvent.click(within(edit).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateProject).toHaveBeenCalledWith(active.projectId,
      { name: updated.name, description: updated.description }, { signal: expect.any(AbortSignal) }));
    expect(await within(detail).findByRole("heading", { name: updated.name })).toBeInTheDocument();
    const payload = api.updateProject.mock.calls[0][1];
    expect(payload).not.toHaveProperty("organization_id");
    expect(payload).not.toHaveProperty("created_by");
    expect(payload).not.toHaveProperty("id");
  });

  it("keeps edit open with safe feedback when update authorization fails", async () => {
    api.listProjects.mockResolvedValue([active]);
    api.updateProject.mockRejectedValue(Object.assign(new Error("owner id secret"), { code: "forbidden" }));
    render(<Projects />);
    const detail = await openProject();
    fireEvent.click(within(detail).getByRole("button", { name: "Edit project" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Denied edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("do not have permission");
    expect(screen.queryByText("owner id secret")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit project" })).toBeInTheDocument();
  });

  it("requires confirmation and applies the canonical archived response without deletion", async () => {
    api.listProjects.mockResolvedValue([active]);
    render(<Projects />);
    const detail = await openProject();
    fireEvent.click(within(detail).getByRole("button", { name: "Archive project" }));
    const confirmation = within(detail).getByRole("alertdialog");
    expect(confirmation).toHaveTextContent("does not delete artifacts, workspaces, runs, or storage");
    expect(api.archiveProject).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Confirm archive" }));
    await waitFor(() => expect(api.archiveProject).toHaveBeenCalledWith(active.projectId, { signal: expect.any(AbortSignal) }));
    expect(within(detail).getAllByText("archived")).toHaveLength(2);
    expect(within(detail).queryByRole("button", { name: "Archive project" })).not.toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "Close project details" }));
    expect(await screen.findByRole("heading", { name: "No active projects" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archived" }));
    expect(screen.getByText(active.name)).toBeInTheDocument();
  });

  it("retains confirmation and project state when archive fails", async () => {
    api.listProjects.mockResolvedValue([active]);
    api.archiveProject.mockRejectedValue(Object.assign(new Error("private cross-org detail"), { code: "not_found" }));
    render(<Projects />);
    const detail = await openProject();
    fireEvent.click(within(detail).getByRole("button", { name: "Archive project" }));
    fireEvent.click(within(detail).getByRole("button", { name: "Confirm archive" }));
    expect(await within(detail).findByRole("alert")).toHaveTextContent("This project is unavailable");
    expect(within(detail).getAllByText("active")).toHaveLength(2);
    expect(screen.queryByText("private cross-org detail")).not.toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: "Confirm archive" })).toBeEnabled();
  });
});
