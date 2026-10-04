import React from "react";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listMyApiKeys: vi.fn(),
  createMyApiKey: vi.fn(),
  revokeMyApiKey: vi.fn(),
}));
vi.mock("../../src/ui/lib/apiKeysApi", () => api);

import Developer, { apiBaseUrl } from "../../src/ui/pages/Developer";

const user = { email: "u@test", permissions: ["dataset.read"], orgId: "42" };
const KEY = "omni_sk_" + "a".repeat(40);
const active = { id: 1, name: "notebook", key_prefix: "omni_sk_abcd", scopes: ["dataset.read"], status: "active",
  created_at: "2026-10-01T10:00:00", last_used_at: null };
const revoked = { ...active, id: 2, name: null, key_prefix: "omni_sk_zzzz", status: "revoked" };

beforeEach(() => {
  api.listMyApiKeys.mockReset().mockResolvedValue([active, revoked]);
  api.createMyApiKey.mockReset();
  api.revokeMyApiKey.mockReset().mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Developer page", () => {
  it("requires sign-in", () => {
    render(<Developer currentUser={null} />);
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
  });

  it("lists keys by prefix only, with revoke for active keys", async () => {
    render(<Developer currentUser={user} />);
    await waitFor(() => expect(screen.getByText("notebook")).toBeInTheDocument());
    expect(screen.getByText("omni_sk_abcd…")).toBeInTheDocument();
    expect(screen.getAllByText("2026-10-01 10:00")).toHaveLength(2);
    expect(screen.getAllByText("Revoke")).toHaveLength(1);
    expect(screen.getByText("revoked")).toBeInTheDocument();
    expect(screen.getAllByText(apiBaseUrl(), { exact: false }).length).toBeGreaterThan(0);
  });

  it("shows a new key once with copy, then hides it", async () => {
    api.createMyApiKey.mockResolvedValue({ id: 3, name: "ci", key_prefix: "omni_sk_aaaa", scopes: [], key: KEY });
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<Developer currentUser={user} />);
    await waitFor(() => expect(screen.getByText("notebook")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Key name/), { target: { value: "  ci  " } });
    fireEvent.click(screen.getByText("Create key"));

    await waitFor(() => expect(screen.getByTestId("new-key").textContent).toBe(KEY));
    expect(api.createMyApiKey).toHaveBeenCalledWith("ci");
    expect(screen.getByText(/will not be shown again/)).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(KEY)).length).toBeGreaterThan(1);

    fireEvent.click(screen.getByText("Copy key"));
    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(KEY);

    fireEvent.click(screen.getByText("Done"));
    expect(screen.queryByTestId("new-key")).not.toBeInTheDocument();
  });

  it("defaults an empty name and tolerates a failing clipboard", async () => {
    api.createMyApiKey.mockResolvedValue({ id: 3, name: "API key", key_prefix: "p", scopes: [], key: KEY });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true,
    });
    render(<Developer currentUser={user} />);
    await waitFor(() => expect(screen.getByText("notebook")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Create key"));
    await waitFor(() => expect(screen.getByTestId("new-key")).toBeInTheDocument());
    expect(api.createMyApiKey).toHaveBeenCalledWith("API key");
    fireEvent.click(screen.getByText("Copy key"));
    await waitFor(() => expect(screen.getByText("Copy key")).toBeInTheDocument());
  });

  it("revokes after confirmation and clears a just-created key", async () => {
    api.createMyApiKey.mockResolvedValue({ id: 1, name: "notebook", key_prefix: "p", scopes: [], key: KEY });
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<Developer currentUser={user} />);
    await waitFor(() => expect(screen.getByText("notebook")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Create key"));
    await waitFor(() => expect(screen.getByTestId("new-key")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Revoke"));
    expect(api.revokeMyApiKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Revoke"));
    await waitFor(() => expect(api.revokeMyApiKey).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByTestId("new-key")).not.toBeInTheDocument());
  });

  it("shows errors from listing, creating and revoking", async () => {
    api.listMyApiKeys.mockRejectedValueOnce(new Error("Your session is not in an organization"));
    render(<Developer currentUser={user} />);
    await waitFor(() => expect(screen.getByText("Your session is not in an organization")).toBeInTheDocument());
    expect(screen.getByText("No API keys yet.")).toBeInTheDocument();
    cleanup();

    api.listMyApiKeys.mockResolvedValue([active]);
    api.createMyApiKey.mockRejectedValue(new Error("At most 10 active keys; revoke one first"));
    api.revokeMyApiKey.mockRejectedValue(new Error(""));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Developer currentUser={user} />);
    await waitFor(() => expect(screen.getByText("notebook")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Create key"));
    await waitFor(() => expect(screen.getByText(/At most 10 active keys/)).toBeInTheDocument());
    fireEvent.click(screen.getByText("Revoke"));
    await waitFor(() => expect(screen.getByText("Could not revoke the key")).toBeInTheDocument());
  });

  it("shows a no-org notice instead of the key-management cards when the session has no org context", async () => {
    const err = new Error("Your session is not in an organization");
    err.status = 400;
    api.listMyApiKeys.mockRejectedValueOnce(err);

    render(<Developer currentUser={user} />);

    await waitFor(() => expect(screen.getByText("No organization context")).toBeInTheDocument());
    expect(screen.queryByText("Create a key")).not.toBeInTheDocument();
    expect(screen.queryByText("Your session is not in an organization")).not.toBeInTheDocument();
  });

  it("falls back to generic messages", async () => {
    api.listMyApiKeys.mockRejectedValueOnce({});
    render(<Developer currentUser={user} />);
    await waitFor(() => expect(screen.getByText("Failed to load API keys")).toBeInTheDocument());
    api.createMyApiKey.mockRejectedValue({});
    fireEvent.click(screen.getByText("Create key"));
    await waitFor(() => expect(screen.getByText("Could not create the key")).toBeInTheDocument());
  });
});
