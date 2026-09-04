import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rolesApi = vi.hoisted(() => ({
  listRoles: vi.fn(),
  createRole: vi.fn(),
  getRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  getUserRoles: vi.fn(),
  setUserRoles: vi.fn(),
}));
vi.mock("../../src/ui/lib/rolesApi", () => rolesApi);

import RoleManagement from "../../src/ui/pages/RoleManagement";

const admin = { email: "admin@test", permissions: ["manage_roles"] };
const twoRoles = [
  { id: "r1", name: "Reader", permission_count: 2, user_count: 0 },
  { id: "r2", name: "Writer", permission_count: 1, user_count: 3 },
];

beforeEach(() => {
  rolesApi.listRoles.mockReset().mockResolvedValue(twoRoles);
  rolesApi.createRole.mockReset();
  rolesApi.getRole.mockReset();
  rolesApi.updateRole.mockReset();
  rolesApi.deleteRole.mockReset();
  rolesApi.getUserRoles.mockReset();
  rolesApi.setUserRoles.mockReset();
  window.confirm = vi.fn(() => true);
});
afterEach(() => cleanup());

describe("RoleManagement gating", () => {
  it("requires sign-in when there is no current user", () => {
    render(<RoleManagement currentUser={null} />);
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
  });

  it("denies access without the manage_roles permission", () => {
    render(<RoleManagement currentUser={{ email: "u@test", permissions: [] }} />);
    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(screen.getByText(/requires: manage_roles/)).toBeInTheDocument();
  });

  it("denies access when the user carries no permissions list at all", () => {
    render(<RoleManagement currentUser={{ email: "u@test" }} />);
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });
});

describe("RoleManagement console — roles list", () => {
  it("loads and renders roles, and surfaces a load error", async () => {
    render(<RoleManagement currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("Reader")).toBeInTheDocument());
    expect(screen.getByText("Writer")).toBeInTheDocument();
    cleanup();

    rolesApi.listRoles.mockRejectedValueOnce(new Error("boom"));
    render(<RoleManagement currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    cleanup();

    rolesApi.listRoles.mockRejectedValueOnce(new Error());
    render(<RoleManagement currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("Failed to load roles")).toBeInTheDocument());
  });

  it("shows the empty-state message with no roles", async () => {
    rolesApi.listRoles.mockResolvedValueOnce([]);
    render(<RoleManagement currentUser={admin} />);
    await waitFor(() => expect(screen.getByText(/No roles yet/)).toBeInTheDocument());
  });

  it("deletes a role after confirmation, and cancels without confirmation", async () => {
    render(<RoleManagement currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("Reader")).toBeInTheDocument());
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });

    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(deleteButtons[0]);
    expect(rolesApi.deleteRole).not.toHaveBeenCalled();

    rolesApi.deleteRole.mockResolvedValueOnce(undefined);
    rolesApi.listRoles.mockResolvedValueOnce([twoRoles[1]]);
    fireEvent.click(deleteButtons[0]);
    await waitFor(() => expect(rolesApi.deleteRole).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(screen.getByText(/deleted/)).toBeInTheDocument());
  });

  it("shows a conflict message when deleting a role still assigned to users", async () => {
    render(<RoleManagement currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("Writer")).toBeInTheDocument());
    const err = new Error("conflict"); err.status = 409;
    rolesApi.deleteRole.mockRejectedValueOnce(err);
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[1]); // Writer, user_count 3
    await waitFor(() => expect(screen.getByText(/still assigned to 3 user\(s\)/)).toBeInTheDocument());
  });

  it("shows a generic delete failure message, falling back when the error has no message", async () => {
    render(<RoleManagement currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("Reader")).toBeInTheDocument());
    rolesApi.deleteRole.mockRejectedValueOnce(new Error("network down"));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());

    rolesApi.deleteRole.mockRejectedValueOnce(new Error());
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await waitFor(() => expect(screen.getByText("Delete failed")).toBeInTheDocument());
  });
});

describe("RoleManagement console — role detail", () => {
  it("creates a new role, validating the name and toggling permissions", async () => {
    render(<RoleManagement currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("Reader")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "+ New Role" }));
    expect(screen.getByText(/New Role/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Role name is required")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("e.g. data_scientist"), { target: { value: "data_scientist" } });
    const permInput = screen.getByPlaceholderText("e.g. read:samples");
    fireEvent.change(permInput, { target: { value: "read:samples" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("read:samples")).toBeInTheDocument();
    // duplicate/empty adds are no-ops
    fireEvent.change(permInput, { target: { value: "read:samples" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getAllByText("read:samples")).toHaveLength(1);
    fireEvent.click(screen.getByTitle("Remove read:samples"));
    expect(screen.queryByText("read:samples")).not.toBeInTheDocument();
    expect(screen.getByText("No permissions assigned")).toBeInTheDocument();

    fireEvent.change(permInput, { target: { value: "write:samples" } });
    fireEvent.submit(permInput.closest("form"));
    expect(screen.getByText("write:samples")).toBeInTheDocument();

    rolesApi.createRole.mockResolvedValueOnce({});
    rolesApi.listRoles.mockResolvedValueOnce(twoRoles);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rolesApi.createRole).toHaveBeenCalledWith("data_scientist", ["write:samples"]));
    await waitFor(() => expect(screen.getByText(/created/)).toBeInTheDocument());
  });

  it("edits an existing role, handling load failure and a name-conflict save", async () => {
    render(<RoleManagement currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("Reader")).toBeInTheDocument());
    rolesApi.getRole.mockResolvedValueOnce({ name: "Reader", permissions: ["read:samples"] });
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(await screen.findByText(/Edit Role — Reader/)).toBeInTheDocument();
    expect(screen.getByText("read:samples")).toBeInTheDocument();

    const conflict = new Error("dup"); conflict.status = 409;
    rolesApi.updateRole.mockRejectedValueOnce(conflict);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("A role with that name already exists.")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "← Back to roles" }));
    await waitFor(() => expect(screen.getByText("Role Management")).toBeInTheDocument());

    rolesApi.getRole.mockRejectedValueOnce(new Error("not found"));
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    await waitFor(() => expect(screen.getByText("not found")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByText("Role Management")).toBeInTheDocument());

    rolesApi.getRole.mockRejectedValueOnce(new Error());
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    await waitFor(() => expect(screen.getByText("Failed to load role")).toBeInTheDocument());
  });

  it("falls back to a generic save-failed message when the error carries no message", async () => {
    render(<RoleManagement currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("Reader")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "+ New Role" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. data_scientist"), { target: { value: "x" } });
    rolesApi.createRole.mockRejectedValueOnce(new Error());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Save failed")).toBeInTheDocument());
  });
});

describe("RoleManagement console — assign to user", () => {
  it("looks up a user, handles a 404 and generic failure, toggles roles, and saves", async () => {
    render(<RoleManagement currentUser={admin} />);
    await waitFor(() => expect(screen.getByText("Reader")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Assign to User"));

    const idInput = screen.getByPlaceholderText("e.g. 42");
    fireEvent.click(screen.getByRole("button", { name: "Load" })); // blank id: button is disabled
    fireEvent.submit(idInput.closest("form")); // blank id via direct submit: load() itself no-ops
    expect(rolesApi.getUserRoles).not.toHaveBeenCalled();

    const notFound = new Error("nope"); notFound.status = 404;
    rolesApi.getUserRoles.mockRejectedValueOnce(notFound);
    fireEvent.change(idInput, { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() => expect(screen.getByText("No user with id 42.")).toBeInTheDocument());

    rolesApi.getUserRoles.mockRejectedValueOnce(new Error("server error"));
    fireEvent.submit(idInput.closest("form"));
    await waitFor(() => expect(screen.getByText("server error")).toBeInTheDocument());

    rolesApi.getUserRoles.mockResolvedValueOnce({ user_id: 42, roles: ["Reader"] });
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    expect(await screen.findByText(/Roles for user #42/)).toBeInTheDocument();
    expect(screen.getByText(/2 permissions/)).toBeInTheDocument();
    expect(screen.getByText(/1 permission\)/)).toBeInTheDocument();

    const readerBox = screen.getByRole("checkbox", { name: /Reader/ });
    expect(readerBox.checked).toBe(true);
    fireEvent.click(readerBox); // untoggle
    expect(readerBox.checked).toBe(false);
    const writerBox = screen.getByRole("checkbox", { name: /Writer/ });
    expect(writerBox.checked).toBe(false);
    fireEvent.click(writerBox); // toggle on
    expect(writerBox.checked).toBe(true);

    const forbidden = new Error("no"); forbidden.status = 403;
    rolesApi.setUserRoles.mockRejectedValueOnce(forbidden);
    fireEvent.click(screen.getByRole("button", { name: "Save Assignment" }));
    await waitFor(() => expect(screen.getByText(/Cannot modify your own roles/)).toBeInTheDocument());

    rolesApi.setUserRoles.mockRejectedValueOnce(new Error("server exploded"));
    fireEvent.click(screen.getByRole("button", { name: "Save Assignment" }));
    await waitFor(() => expect(screen.getByText("server exploded")).toBeInTheDocument());

    rolesApi.setUserRoles.mockResolvedValueOnce({ roles: ["Writer"] });
    fireEvent.click(screen.getByRole("button", { name: "Save Assignment" }));
    await waitFor(() => expect(screen.getByText("Roles updated.")).toBeInTheDocument());
  });

  it("shows the no-roles-exist message when there are no roles to assign", async () => {
    rolesApi.listRoles.mockResolvedValueOnce([]);
    render(<RoleManagement currentUser={admin} />);
    await waitFor(() => expect(screen.getByText(/No roles yet/)).toBeInTheDocument());
    fireEvent.click(screen.getByText("Assign to User"));
    rolesApi.getUserRoles.mockResolvedValueOnce({ user_id: 1, roles: [] });
    fireEvent.change(screen.getByPlaceholderText("e.g. 42"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() => expect(screen.getByText("No roles exist yet.")).toBeInTheDocument());
  });
});
