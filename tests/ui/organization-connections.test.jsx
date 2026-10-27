import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrganizationConnections from "../../src/ui/pages/OrganizationConnections";
import AppearanceProvider from "../../src/ui/components/AppearanceProvider";
import { saveAppearance } from "../../src/ui/lib/appearanceApi";
import { setSession } from "../../src/ui/lib/session";

const user = { userId: 7, orgId: 11 };
const secret = "sk-test-NEVER-PERSIST";
const metadata = (provider = null) => ({ provider, has_key: !!provider, updated_at: null, updated_by_email: null });
const response = (body, status = 200) => ({ ok: status < 400, status, json: vi.fn().mockResolvedValue(body) });
function setup(provider = null) {
  let state = metadata(provider);
  const fetcher = vi.fn(async (_url, options) => {
    if (options.method === "PUT") state = metadata(_url.endsWith("openai") ? "openai" : "claude");
    if (options.method === "DELETE") state = metadata(null);
    return response(state);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
async function open(provider = null) {
  render(<OrganizationConnections currentUser={user} />);
  fireEvent.click(await screen.findByRole("button", { name: provider ? "Replace credential or switch provider" : "Connect provider" }));
}
function enter() { fireEvent.change(screen.getByLabelText(/API key/), { target: { value: secret } }); }
function assertSecretAbsent() {
  expect(document.body.innerHTML).not.toContain(secret);
  expect(JSON.stringify(localStorage)).not.toContain(secret);
  expect(JSON.stringify(sessionStorage)).not.toContain(secret);
  expect(location.href).not.toContain(secret);
}
beforeEach(() => { localStorage.setItem("omnibioai_access_token", "test-token"); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Organization Connections", () => {
  it("keeps all three cards visible while connection state is loading", () => {
    const fetcher = setup(); fetcher.mockImplementationOnce(() => new Promise(() => {}));
    render(<OrganizationConnections currentUser={user} />);
    expect(document.querySelectorAll("[data-connection-card]")).toHaveLength(3);
    expect(screen.getAllByText("Checking status")).toHaveLength(3);
    expect(screen.getAllByText("Execution status pending")).toHaveLength(2);
    expect(screen.queryByText("Not configured")).toBeNull();
  });
  it("loads the disconnected shared slot without fabricated metadata", async () => {
    const fetcher = setup(); render(<OrganizationConnections currentUser={user} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(await screen.findByText("No organization AI provider connected.")).toBeVisible();
    const cards = document.querySelectorAll("[data-connection-card]");
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByRole("heading", { name: "OpenAI" })).toBeVisible();
    expect(within(cards[1]).getByRole("heading", { name: "Anthropic Claude" })).toBeVisible();
    expect(within(cards[2]).getByRole("heading", { name: "AI provider" })).toBeVisible();
    expect(screen.getAllByText("Not configured")).toHaveLength(2);
    expect(screen.getAllByText("Execution disabled")).toHaveLength(2);
    expect(screen.getByText(/One shared AI provider/)).toBeVisible();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/\/orgs\/11\/provider-keys$/), expect.objectContaining({
      method: "GET", headers: { Accept: "application/json", Authorization: "Bearer test-token" },
    }));
    expect(screen.queryByText(/internal-version|Last used|Last updated/)).toBeNull();
  });
  it.each(["openai", "claude"])("shows %s from canonical safe metadata after server authorization", async provider => {
    setup(provider); render(<OrganizationConnections currentUser={user} />);
    expect(await screen.findByText("Credential stored securely")).toBeVisible();
    expect(screen.getByText("Provided by your organization.")).toBeVisible();
    expect(within(document.querySelector('[data-connection-card="shared"]')).getByText("Connected")).toBeVisible();
    expect(screen.getByRole("button", { name: "Replace credential or switch provider" })).toBeVisible();
    const active = document.querySelector(`[data-connection-card="${provider}"]`);
    const inactive = document.querySelector(`[data-connection-card="${provider === "openai" ? "claude" : "openai"}"]`);
    expect(within(active).getByText("Connected")).toBeVisible();
    expect(within(active).getByText("Available to authorized workloads")).toBeVisible();
    expect(within(inactive).getByText("Not configured")).toBeVisible();
    expect(within(inactive).getByText("Execution disabled")).toBeVisible();
    expect(document.querySelectorAll("[data-connection-card]")).toHaveLength(3);
    expect(document.body.textContent).not.toContain("internal-version");
  });
  it.each(["openai", "claude"])("connects %s with no persisted or displayed secret", async provider => {
    const fetcher = setup(); await open();
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: provider } }); enter();
    expect(screen.getByLabelText(/API key/)).toHaveAttribute("type", "password");
    expect(screen.getByRole("dialog")).toHaveAttribute("data-sentry-block", "true");
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    await screen.findByText("Credential stored securely"); assertSecretAbsent();
    const mutation = fetcher.mock.calls.find(([, options]) => options.method === "PUT");
    expect(mutation[0]).toContain(`/orgs/11/provider-keys/${provider}`);
    expect(JSON.parse(mutation[1].body)).toEqual({ api_key: secret });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it.each([["openai", "openai"], ["openai", "claude"], ["claude", "openai"]])("confirms replacement %s to %s", async (from, to) => {
    const fetcher = setup(from); await open(from);
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: to } }); enter();
    expect(screen.getByRole("button", { name: "Confirm replacement" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Confirm replacement" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetcher.mock.calls.find(([, o]) => o.method === "PUT")[0]).toContain(to);
    assertSecretAbsent();
  });
  it("removes only after explicit confirmation and refreshes metadata", async () => {
    const fetcher = setup("openai"); render(<OrganizationConnections currentUser={user} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove connection" }));
    expect(screen.getByText(/does not revoke/)).toBeVisible();
    expect(fetcher.mock.calls.some(([, o]) => o.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    await screen.findByText("No organization AI provider connected."); assertSecretAbsent();
  });
  it("clears on close/provider change; traps focus and restores it", async () => {
    setup(); await open(); const provider = screen.getByLabelText("Provider");
    expect(provider).toHaveFocus(); enter();
    const save = screen.getByRole("button", { name: "Save connection" });
    save.focus(); fireEvent.keyDown(save, { key: "Tab" }); expect(provider).toHaveFocus();
    fireEvent.keyDown(provider, { key: "Tab", shiftKey: true }); expect(save).toHaveFocus();
    fireEvent.change(provider, { target: { value: "claude" } }); expect(screen.getByLabelText(/API key/)).toHaveValue("");
    enter(); fireEvent.keyDown(provider, { key: "Escape" }); assertSecretAbsent();
    expect(screen.getByRole("button", { name: "Connect provider" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Connect provider" })); expect(screen.getByLabelText(/API key/)).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" })); assertSecretAbsent();
  });
  it.each([403, 422, 503])("sanitizes mutation failure %s, clears secret, and permits retry", async status => {
    const fetcher = setup(); await open(); enter();
    fetcher.mockResolvedValueOnce(response({ detail: secret }, status));
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    await screen.findByRole("alert"); assertSecretAbsent();
    expect(screen.getByLabelText(/API key/)).toHaveValue("");
    enter(); fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    await screen.findByText("Credential stored securely");
  });
  it("handles deletion failure without claiming removal", async () => {
    const fetcher = setup("claude"); render(<OrganizationConnections currentUser={user} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove connection" }));
    fetcher.mockRejectedValueOnce(new Error(secret)); fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    await screen.findByRole("alert");
    expect(within(document.querySelector('[data-connection-card="shared"]')).getByText("Connected")).toBeVisible();
    assertSecretAbsent();
  });
  it.each([401, 403, 405, 503, "network"])("handles loading failure %s and retries", async status => {
    const fetcher = setup();
    if (status === "network") fetcher.mockRejectedValueOnce(new Error(secret)); else fetcher.mockResolvedValueOnce(response({ detail: secret }, status));
    render(<OrganizationConnections currentUser={user} />); const alert = await screen.findByRole("alert"); assertSecretAbsent();
    expect(alert).toHaveTextContent([401, 403].includes(status) ? "You do not have permission" : "Connections are unavailable");
    expect(document.querySelectorAll("[data-connection-card]")).toHaveLength(3);
    expect(screen.getAllByText("Status unavailable")).toHaveLength(2);
    expect(screen.getAllByText("Execution unavailable")).toHaveLength(2);
    expect(screen.queryByText("Not configured")).toBeNull();
    expect(screen.getByText(/No credential status has been inferred/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Connect provider" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry connection" })); await screen.findByText("No organization AI provider connected.");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe(fetcher.mock.calls[0][0]);
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe("Bearer test-token");
  });
  it("immediately clears dialog and org A metadata on organization switch, ignoring late responses", async () => {
    const fetcher = setup("openai"); const { rerender } = render(<OrganizationConnections currentUser={user} />);
    fireEvent.click(await screen.findByRole("button", { name: /Replace credential/ })); enter();
    let finish; fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Confirm replacement" }));
    fetcher.mockResolvedValue(response(metadata("claude")));
    rerender(<OrganizationConnections currentUser={{ ...user, orgId: 22 }} />);
    expect(within(document.querySelector('[data-connection-card="shared"]')).queryByText("Credential stored securely")).toBeNull();
    expect(document.querySelectorAll("[data-connection-card]")).toHaveLength(3);
    expect(screen.queryByRole("dialog")).toBeNull(); assertSecretAbsent();
    await screen.findByText("Anthropic");
    await act(async () => finish(response({ detail: secret }, 403)));
    expect(screen.queryByRole("alert")).toBeNull(); expect(screen.getByText("Anthropic")).toBeVisible();
  });
  it("ignores stale metadata and clears secret on session and user changes", async () => {
    let resolveA; const fetcher = setup(); fetcher.mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; }));
    const { rerender } = render(<OrganizationConnections currentUser={user} />);
    fetcher.mockResolvedValue(response(metadata(null)));
    rerender(<OrganizationConnections currentUser={{ userId: 8, orgId: 22 }} />);
    await screen.findByText("No organization AI provider connected.");
    await act(async () => resolveA(response(metadata("openai"))));
    expect(within(document.querySelector('[data-connection-card="shared"]')).queryByText("OpenAI")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Connect provider" })); enter();
    act(() => setSession("new-token")); expect(screen.queryByRole("dialog")).toBeNull(); assertSecretAbsent();
    await screen.findByText("No organization AI provider connected.");
  });
  it("aborts an outstanding read on unmount", async () => {
    const fetcher = setup(); fetcher.mockImplementationOnce(() => new Promise(() => {}));
    const { unmount } = render(<OrganizationConnections currentUser={user} />); const signal = fetcher.mock.calls[0][1].signal;
    unmount(); expect(signal.aborted).toBe(true);
  });
  it("requires an authenticated organization without inferring one", () => {
    const fetcher = setup(); const { rerender } = render(<OrganizationConnections currentUser={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Sign in");
    rerender(<OrganizationConnections currentUser={{ userId: 7 }} />); expect(screen.getByRole("status")).toHaveTextContent("organization context");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["system", "light", "dark"])("renders under %s with every accent and reduced motion", async mode => {
    setup("openai");
    for (const accent of ["teal", "blue", "orange", "purple"]) {
      saveAppearance(7, { mode, accent, reducedMotion: "reduce" });
      const { unmount } = render(<AppearanceProvider userId={7}><OrganizationConnections currentUser={user} /></AppearanceProvider>);
      await screen.findByText("Credential stored securely");
      expect(document.documentElement.dataset.accent).toBe(accent); expect(document.documentElement.dataset.motion).toBe("reduce");
      expect(document.documentElement.dataset.theme).toBe(mode === "light" ? "light" : "dark"); unmount();
    }
  });
});

it("does not double submit and ignores aborted read failures", async () => {
  const fetcher = setup(); await open(); enter();
  let finish;
  fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const form = screen.getByLabelText(/API key/).closest("form");
  fireEvent.submit(form); fireEvent.submit(form);
  expect(fetcher.mock.calls.filter(([, options]) => options.method === "PUT")).toHaveLength(1);
  fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "ArrowRight" });
  fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Tab" });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await act(async () => finish(response()));
  cleanup();
  let reject;
  fetcher.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const { unmount } = render(<OrganizationConnections currentUser={user} />); unmount();
  await act(async () => reject(Error(secret)));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("never renders secret or private metadata returned in unexpected fields", async () => {
  const fetcher = setup("openai");
  fetcher.mockResolvedValue(response({ ...metadata("openai"), api_key: secret, access_token: secret, refresh_token: secret, password: secret, client_secret: secret, updated_by_email: secret }));
  render(<OrganizationConnections currentUser={user} />);
  await screen.findByText("Credential stored securely"); assertSecretAbsent();
  expect(fetcher.mock.calls.every(([url]) => !/internal|reveal/.test(url))).toBe(true);
});
