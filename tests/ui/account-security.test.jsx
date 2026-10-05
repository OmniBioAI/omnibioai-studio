import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const securityApi = vi.hoisted(() => ({
  listMfaDevices: vi.fn(), listSessions: vi.fn(), revokeSession: vi.fn(),
}));
const apiKeysApi = vi.hoisted(() => ({
  listMyApiKeys: vi.fn(), createMyApiKey: vi.fn(), revokeMyApiKey: vi.fn(),
}));
vi.mock("../../src/ui/lib/securityApi", () => securityApi);
vi.mock("../../src/ui/lib/apiKeysApi", () => apiKeysApi);
vi.mock("../../src/ui/lib/session", () => ({
  getToken: () => "test-token", getSessionVersion: () => 0, onSessionChange: () => () => {},
}));

import AccountSecurity from "../../src/ui/pages/AccountSecurity";

const userA = { userId: 1, email: "a@example.org" };
const device = { id: 4, device_type: "totp", label: "Authenticator", created_at: "2026-01-01T10:00:00Z", verified_at: "2026-01-01T10:02:00Z", last_used_at: null };
const activeSession = { session_id: "session-a", status: "active", auth_method: "password", created_at: "2026-01-02T10:00:00Z", last_activity_at: "2026-01-03T10:00:00Z", user_agent: null, client_ip: null };
const apiKey = { id: 8, name: "Notebook", key_prefix: "omni_sk_live_ab", status: "active", created_at: "2026-01-04T10:00:00Z", last_used_at: null };

let confirms;
beforeEach(() => {
  securityApi.listMfaDevices.mockResolvedValue([]);
  securityApi.listSessions.mockResolvedValue([]);
  securityApi.revokeSession.mockResolvedValue({ status: "revoked" });
  apiKeysApi.listMyApiKeys.mockResolvedValue([]);
  apiKeysApi.createMyApiKey.mockResolvedValue({ id: 9, key: "omni_sk_once", name: "CLI" });
  apiKeysApi.revokeMyApiKey.mockResolvedValue(null);
  confirms = vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("Account Security", () => {
  it("renders independent loading states without false empty values", () => {
    securityApi.listMfaDevices.mockReturnValue(new Promise(() => {}));
    securityApi.listSessions.mockReturnValue(new Promise(() => {}));
    apiKeysApi.listMyApiKeys.mockReturnValue(new Promise(() => {}));
    render(<AccountSecurity currentUser={userA} />);
    expect(screen.getByText("Loading MFA status…")).toBeInTheDocument();
    expect(screen.getByText("Loading sessions…")).toBeInTheDocument();
    expect(screen.getByText("Loading API keys…")).toBeInTheDocument();
    expect(screen.queryByText("No active sessions.")).not.toBeInTheDocument();
  });

  it("shows canonical MFA state and only returned device metadata", async () => {
    securityApi.listMfaDevices.mockResolvedValue([device, { ...device, id: 5, label: "Pending", verified_at: null }]);
    render(<AccountSecurity currentUser={userA} />);
    expect(await screen.findByText("1 verified device")).toBeInTheDocument();
    expect(screen.getByText("Authenticator")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText(/Awaiting verification/)).toBeInTheDocument();
    expect(screen.getAllByText("Enabled").length).toBeGreaterThan(0);
  });

  it("renders only optional metadata returned by IAM and neutral date fallbacks", async () => {
    securityApi.listMfaDevices.mockResolvedValue([{ ...device, label: null, created_at: "bad-date", last_used_at: "2026-01-05T10:00:00Z" }]);
    securityApi.listSessions.mockResolvedValue([{ ...activeSession, auth_method: null, created_at: null, user_agent: "Agent/1", client_ip: "127.0.0.1" }]);
    apiKeysApi.listMyApiKeys.mockResolvedValue([{ ...apiKey, name: null, created_at: null, last_used_at: "2026-01-06T10:00:00Z" }]);
    render(<AccountSecurity currentUser={userA} />);
    expect(await screen.findByText("totp")).toBeInTheDocument();
    expect(screen.getByText("Authentication method unavailable")).toBeInTheDocument();
    expect(screen.getByText("Agent/1")).toBeInTheDocument();
    expect(screen.getByText("IP 127.0.0.1")).toBeInTheDocument();
    expect(screen.getByText("omni_sk_live_ab", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getAllByText(/Unavailable/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Last used/).length).toBeGreaterThan(1);
  });

  it("shows disabled, empty, and safe API-key metadata states", async () => {
    apiKeysApi.listMyApiKeys.mockResolvedValue([{ ...apiKey, status: "revoked" }]);
    render(<AccountSecurity currentUser={userA} />);
    expect((await screen.findAllByText("Not enabled")).length).toBe(2);
    expect(screen.getByText("No active sessions.")).toBeInTheDocument();
    expect(screen.getByText("Notebook")).toBeInTheDocument();
    expect(screen.getByText("omni_sk_live_ab…")).toBeInTheDocument();
    expect(screen.queryByText(/browser|macOS|location/i)).not.toBeInTheDocument();
  });

  it("lists only active sessions and revokes after confirmation", async () => {
    securityApi.listSessions
      .mockResolvedValueOnce([activeSession, { ...activeSession, session_id: "old", status: "revoked" }])
      .mockResolvedValueOnce([]);
    render(<AccountSecurity currentUser={userA} />);
    expect(await screen.findByText("password")).toBeInTheDocument();
    expect(screen.queryByText("old")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(confirms).toHaveBeenCalledWith(expect.stringContaining("session-a"));
    await waitFor(() => expect(securityApi.revokeSession).toHaveBeenCalledWith("session-a"));
    await waitFor(() => expect(screen.getByText("No active sessions.")).toBeInTheDocument());
  });

  it("keeps a session when revocation is cancelled and isolates a revoke failure", async () => {
    confirms.mockReturnValue(false);
    securityApi.listSessions.mockResolvedValue([activeSession]);
    render(<AccountSecurity currentUser={userA} />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(securityApi.revokeSession).not.toHaveBeenCalled();
    confirms.mockReturnValue(true);
    securityApi.revokeSession.mockRejectedValue(new Error("network"));
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(await screen.findByText("Unable to revoke this session.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Multi-factor authentication" })).toBeInTheDocument();
  });

  it("creates a one-time API key, copies it, and removes the secret on dismissal", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<AccountSecurity currentUser={userA} />);
    await screen.findByText("No personal API keys.");
    fireEvent.change(screen.getByLabelText("Key name"), { target: { value: "CLI" } });
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    expect(await screen.findByText("omni_sk_once")).toBeInTheDocument();
    expect(apiKeysApi.createMyApiKey).toHaveBeenCalledWith("CLI");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("omni_sk_once"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("omni_sk_once")).not.toBeInTheDocument();
  });

  it("never persists or routes a one-time key and clears it on account switch", async () => {
    const localWrite = vi.spyOn(window.localStorage, "setItem");
    const sessionWrite = vi.spyOn(window.sessionStorage, "setItem");
    const { rerender } = render(<AccountSecurity currentUser={userA} />);
    await screen.findByText("No personal API keys.");
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    expect(await screen.findByText("omni_sk_once")).toBeInTheDocument();
    expect(localWrite).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining("omni_sk_once"));
    expect(sessionWrite).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining("omni_sk_once"));
    expect(window.location.href).not.toContain("omni_sk_once");
    rerender(<AccountSecurity currentUser={{ userId: 2, email: "b@example.org" }} />);
    await waitFor(() => expect(screen.queryByText("omni_sk_once")).not.toBeInTheDocument());
  });

  it("uses the default key name and safely handles clipboard failure", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<AccountSecurity currentUser={userA} />);
    await screen.findByText("No personal API keys.");
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    expect(await screen.findByText("omni_sk_once")).toBeInTheDocument();
    expect(apiKeysApi.createMyApiKey).toHaveBeenCalledWith("Account key");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
  });

  it("revokes an API key and handles create/revoke failures independently", async () => {
    apiKeysApi.listMyApiKeys.mockResolvedValue([apiKey]);
    apiKeysApi.revokeMyApiKey.mockRejectedValueOnce(new Error("no"));
    apiKeysApi.createMyApiKey.mockRejectedValueOnce(new Error("no"));
    render(<AccountSecurity currentUser={userA} />);
    const revoke = await screen.findByRole("button", { name: "Revoke" });
    fireEvent.click(revoke);
    expect(await screen.findByText("Unable to revoke this API key.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    expect(await screen.findByText("Unable to create an API key.")).toBeInTheDocument();
  });

  it("revokes an API key successfully and honors cancellation", async () => {
    apiKeysApi.listMyApiKeys.mockResolvedValueOnce([apiKey]).mockResolvedValueOnce([]);
    render(<AccountSecurity currentUser={userA} />);
    const revoke = await screen.findByRole("button", { name: "Revoke" });
    confirms.mockReturnValueOnce(false);
    fireEvent.click(revoke);
    expect(apiKeysApi.revokeMyApiKey).not.toHaveBeenCalled();
    confirms.mockReturnValueOnce(true);
    fireEvent.click(revoke);
    await waitFor(() => expect(apiKeysApi.revokeMyApiKey).toHaveBeenCalledWith(8));
    expect(await screen.findByText("No personal API keys.")).toBeInTheDocument();
  });

  it("isolates section failures and retries only the failed section", async () => {
    securityApi.listSessions.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([activeSession]);
    render(<AccountSecurity currentUser={userA} />);
    expect(await screen.findByText("Unable to load sessions.")).toBeInTheDocument();
    expect(screen.getAllByText("Not enabled").length).toBe(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    expect(await screen.findByText("password")).toBeInTheDocument();
  });

  it("retries an isolated MFA failure", async () => {
    securityApi.listMfaDevices.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([device]);
    render(<AccountSecurity currentUser={userA} />);
    expect(await screen.findByText("Unable to load multi-factor authentication.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Authenticator")).toBeInTheDocument();
  });

  it("ignores aborts and stale null responses without showing false errors", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    securityApi.listMfaDevices.mockRejectedValue(abort);
    securityApi.listSessions.mockResolvedValue(null);
    apiKeysApi.listMyApiKeys.mockResolvedValue(null);
    render(<AccountSecurity currentUser={userA} />);
    await waitFor(() => expect(securityApi.listMfaDevices).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears data and one-time secrets on logout", async () => {
    apiKeysApi.listMyApiKeys.mockResolvedValue([apiKey]);
    const { rerender } = render(<AccountSecurity currentUser={userA} />);
    expect(await screen.findByText("Notebook")).toBeInTheDocument();
    rerender(<AccountSecurity currentUser={null} />);
    await waitFor(() => expect(screen.queryByText("Notebook")).not.toBeInTheDocument());
    expect(securityApi.listSessions).toHaveBeenCalledTimes(1);
  });

  it("rejects stale User A MFA, session, and API-key responses after an account switch", async () => {
    let resolveMfaA;
    let resolveSessionsA;
    let resolveKeysA;
    securityApi.listMfaDevices.mockReturnValueOnce(new Promise(resolve => { resolveMfaA = resolve; })).mockResolvedValueOnce([]);
    securityApi.listSessions.mockReturnValueOnce(new Promise(resolve => { resolveSessionsA = resolve; })).mockResolvedValueOnce([{ ...activeSession, session_id: "session-b", auth_method: "oauth" }]);
    apiKeysApi.listMyApiKeys.mockReturnValueOnce(new Promise(resolve => { resolveKeysA = resolve; })).mockResolvedValueOnce([]);
    const { rerender } = render(<AccountSecurity currentUser={userA} />);
    rerender(<AccountSecurity currentUser={{ userId: 2, email: "b@example.org" }} />);
    expect(await screen.findByText("oauth")).toBeInTheDocument();
    resolveMfaA([{ ...device, label: "User A authenticator" }]);
    resolveSessionsA([activeSession]);
    resolveKeysA([{ ...apiKey, name: "User A key" }]);
    await Promise.resolve();
    expect(screen.queryByText("password")).not.toBeInTheDocument();
    expect(screen.queryByText("User A authenticator")).not.toBeInTheDocument();
    expect(screen.queryByText("User A key")).not.toBeInTheDocument();
  });

  it("does not publish failed mutations after an account switch", async () => {
    let rejectSession;
    let rejectCreate;
    let rejectKey;
    securityApi.listSessions.mockResolvedValue([activeSession]);
    apiKeysApi.listMyApiKeys.mockResolvedValue([apiKey]);
    securityApi.revokeSession.mockReturnValue(new Promise((_, reject) => { rejectSession = reject; }));
    apiKeysApi.createMyApiKey.mockReturnValue(new Promise((_, reject) => { rejectCreate = reject; }));
    apiKeysApi.revokeMyApiKey.mockReturnValue(new Promise((_, reject) => { rejectKey = reject; }));
    const { rerender } = render(<AccountSecurity currentUser={userA} />);
    const revokes = await screen.findAllByRole("button", { name: "Revoke" });
    fireEvent.click(revokes[0]);
    fireEvent.click(revokes[1]);
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    rerender(<AccountSecurity currentUser={{ userId: 2, email: "b@example.org" }} />);
    rejectSession(new Error("late session"));
    rejectKey(new Error("late key"));
    rejectCreate(new Error("late create"));
    await Promise.resolve();
    expect(screen.queryByText(/Unable to revoke|Unable to create/)).not.toBeInTheDocument();
  });

  it("clears a newly-created secret when that same key is revoked", async () => {
    const created = { id: 9, key: "omni_sk_once", name: null, key_prefix: "omni_sk_once_prefix", status: "active", created_at: null, last_used_at: null };
    apiKeysApi.createMyApiKey.mockResolvedValue(created);
    apiKeysApi.listMyApiKeys.mockResolvedValueOnce([]).mockResolvedValueOnce([created]).mockResolvedValueOnce([]);
    render(<AccountSecurity currentUser={userA} />);
    await screen.findByText("No personal API keys.");
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    expect(await screen.findByText("omni_sk_once")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(screen.queryByText("omni_sk_once")).not.toBeInTheDocument());
    expect(confirms).toHaveBeenCalledWith(expect.stringContaining("omni_sk_once_prefix"));
  });
});
