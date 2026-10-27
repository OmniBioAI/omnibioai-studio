import React from "react";
import { render, screen, waitFor, cleanup, fireEvent, within, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ listMyApiKeys: vi.fn(), createMyApiKey: vi.fn(), revokeMyApiKey: vi.fn() }));
const billing = vi.hoisted(() => ({ getUsageLimits: vi.fn() }));
const session = vi.hoisted(() => ({ getIdentity: vi.fn(), getSessionVersion: vi.fn(() => 0), onSessionChange: vi.fn(() => () => {}) }));
vi.mock("../../src/ui/lib/apiKeysApi", () => api);
vi.mock("../../src/ui/lib/billingApi", () => billing);
vi.mock("../../src/ui/lib/session", async original => ({ ...await original(), ...session }));
import Developer, { apiBaseUrl } from "../../src/ui/pages/Developer";

const user = { userId: 7, email: "developer@example.test", permissions: ["dataset.read"], orgId: "42" };
const KEY = "omni_sk_live_" + "fake".repeat(10);
const active = {
  id: 1, name: "notebook", key_prefix: "omni_sk_live_7f3a", scopes: ["literature:read"], status: "active",
  created_at: "2026-10-18T10:00:00", last_used_at: null, expires_at: "2027-10-18T10:00:00", test: false,
};
const revoked = { ...active, id: 2, name: null, key_prefix: "omni_sk_live_2a9c", status: "revoked", expires_at: null };
const createdMetadata = { ...active, id: 3, name: "ci", key_prefix: "omni_sk_live_fake", expires_at: null };
const createdResponse = { id: 3, name: "ci", key_prefix: "omni_sk_live_fake", scopes: ["literature:read"], expires_at: null, test: false, key: KEY };
const limits = { plan_name: "Free", as_of: "2026-10-21T12:00:00Z", limits: [
  { service: "api", action: "completed", resource: "literature.answer", unit: "answers", period: "monthly", included: 100, used: 0, remaining: 100, percentage_used: 0 },
] };
let writeText;

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  api.listMyApiKeys.mockReset().mockResolvedValue([active, revoked]);
  api.createMyApiKey.mockReset().mockResolvedValue(createdResponse);
  api.revokeMyApiKey.mockReset().mockResolvedValue(null);
  billing.getUsageLimits.mockReset().mockResolvedValue(limits);
  session.getIdentity.mockReset().mockResolvedValue({ organizations: [
    { organization_id: 99, organization_name: "Different organization" },
    { organization_id: 42, organization_name: "Northstar Research" },
  ] });
  session.getSessionVersion.mockReturnValue(0);
  session.onSessionChange.mockImplementation(() => () => {});
  writeText = vi.fn().mockResolvedValue();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.getSelection()?.removeAllRanges(); });

async function mount() {
  const view = render(<Developer currentUser={user} />);
  await screen.findByRole("rowheader", { name: "notebook" });
  return view;
}
async function createKey() {
  api.listMyApiKeys.mockResolvedValue([createdMetadata, active, revoked]);
  fireEvent.change(screen.getByLabelText("Key name"), { target: { value: "  ci  " } });
  fireEvent.click(screen.getByRole("button", { name: "Create key" }));
  await screen.findByTestId("new-key");
  await waitFor(() => expect(screen.getByLabelText("Key name")).toHaveValue(""));
}

describe("Developer page", () => {
  it("uses only the public production gateway URL", () => {
    expect(apiBaseUrl()).toBe("https://webstudio.omnibioai.org/_svc/gateway");
    expect(apiBaseUrl()).not.toMatch(/localhost|127\.0\.0\.1|192\.168\.|10\.|\.internal/i);
  });

  it("requires sign-in without API calls", () => {
    render(<Developer currentUser={null} />);
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
    expect(api.listMyApiKeys).not.toHaveBeenCalled();
    expect(billing.getUsageLimits).not.toHaveBeenCalled();
  });

  it("uses Billing's identity and usage source and lists all supported metadata", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-10-21T12:00:00Z").getTime());
    api.listMyApiKeys.mockResolvedValue([{ ...active, last_used_at: "2026-10-21T10:00:00" }, revoked]);
    await mount();
    expect(screen.getByRole("heading", { name: "API keys" })).toBeInTheDocument();
    expect(screen.getByText("Call the Literature AI API from scripts, notebooks and MCP clients.")).toBeInTheDocument();
    expect(screen.getByText("in Northstar Research · usage is billed to this organization")).toBeInTheDocument();
    expect(screen.queryByText(/Different organization/)).not.toBeInTheDocument();
    expect(screen.getByText("dataset.read")).toBeInTheDocument();
    expect(screen.getByText("omni_sk_live_7f3a…")).toBeInTheDocument();
    expect(screen.getAllByText("Oct 18, 2026")).toHaveLength(2);
    expect(screen.getByText("Oct 18, 2027")).toBeInTheDocument();
    expect(screen.getByText("2 hours ago")).toBeInTheDocument();
    expect(screen.getAllByText("Never")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Revoke key/ })).toHaveLength(1);
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map(node => node.textContent)).toEqual(["Name", "Key", "Created", "Last used", "Expires", "Actions"]);
    expect(billing.getUsageLimits).toHaveBeenCalledWith("42");
    const meter = screen.getByRole("link", { name: "Literature answers 0 / 100. View Usage" });
    expect(meter).toHaveClass("developer-usage");
    expect(meter).toHaveAttribute("href", "/studio/account/organization/usage");
  });

  it("sorts and dims revoked keys and hides more than three behind a toggle", async () => {
    const revokedKeys = Array.from({ length: 4 }, (_, index) => ({ ...revoked, id: 10 + index, name: `revoked-${index + 1}` }));
    api.listMyApiKeys.mockResolvedValue([revokedKeys[0], active, ...revokedKeys.slice(1)]);
    await mount();
    expect(screen.getAllByRole("rowheader").map(cell => cell.textContent)).toEqual(["notebook"]);
    const toggle = screen.getByRole("button", { name: "Show revoked (4)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getAllByRole("rowheader").map(cell => cell.textContent)).toEqual(["notebook", "revoked-1", "revoked-2", "revoked-3", "revoked-4"]);
    for (const name of ["revoked-1", "revoked-2", "revoked-3", "revoked-4"]) {
      expect(screen.getByRole("rowheader", { name }).closest("tr")).toHaveClass("developer-key-row-revoked");
    }
    fireEvent.click(screen.getByRole("button", { name: "Hide revoked" }));
    expect(screen.queryByRole("rowheader", { name: "revoked-1" })).not.toBeInTheDocument();
  });

  it("shows the key exactly once, gates Done, copies it, then permanently clears it", async () => {
    await mount(); await createKey();
    expect(api.createMyApiKey).toHaveBeenCalledWith("ci", { signal: expect.any(AbortSignal) });
    expect(screen.getAllByText(KEY, { exact: false })).toHaveLength(1);
    const panel = screen.getByRole("region", { name: "Your new API key" });
    expect(panel).toHaveClass("sentry-block");
    expect(panel).toHaveAttribute("data-sentry-block", "true");
    expect(within(panel).getByTestId("new-key")).toHaveTextContent(KEY);
    expect(screen.getByText("Copy it now. You won’t be able to see the full key again.")).toBeInTheDocument();
    expect(screen.getByText('export OMNIBIOAI_API_KEY="omni_sk_…"')).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create key" })).toBeDisabled();
    const done = screen.getByRole("button", { name: "Done" });
    expect(done).toBeDisabled(); fireEvent.click(done);
    expect(screen.getByTestId("new-key")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy key" })).toHaveTextContent("Copied"));
    expect(writeText).toHaveBeenCalledWith(KEY);
    fireEvent.click(screen.getByRole("checkbox", { name: "I’ve saved this key somewhere safe" }));
    expect(done).toBeEnabled(); fireEvent.click(done);
    expect(screen.queryByTestId("new-key")).not.toBeInTheDocument();
    for (const tab of ["Python", "MCP", "cURL"]) {
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      expect(document.body.innerHTML).not.toContain(KEY);
    }
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });

  it("never writes a secret to storage, URLs, console output or examples", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const log = vi.spyOn(console, "log"), warn = vi.spyOn(console, "warn"), error = vi.spyOn(console, "error");
    await mount();
    api.listMyApiKeys.mockResolvedValue([{ ...createdMetadata, key: KEY }, active]);
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByTestId("new-key");
    expect(screen.getAllByText(KEY, { exact: false })).toHaveLength(1);
    for (const tab of ["Python", "MCP", "cURL"]) {
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      expect(screen.getByRole("tabpanel").textContent).not.toContain(KEY);
    }
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
    expect(storage).not.toHaveBeenCalled(); expect(window.location.href).not.toContain(KEY);
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });

  it("clears the key on leaving and never restores it on remount", async () => {
    const view = await mount(); await createKey(); view.unmount();
    expect(document.body.textContent).not.toContain(KEY);
    render(<Developer currentUser={user} />);
    await screen.findByText("omni_sk_live_fake…");
    expect(document.body.innerHTML).not.toContain(KEY);
    expect(screen.queryByTestId("new-key")).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });

  it.each(["organization", "account", "session"])("clears the secret when the %s changes", async kind => {
    const view = await mount(); await createKey();
    if (kind === "session") session.getSessionVersion.mockReturnValue(1);
    const next = kind === "organization" ? { ...user, orgId: "84" } : kind === "account" ? { ...user, userId: 8, email: "next@example.test" } : user;
    view.rerender(<Developer currentUser={next} />);
    expect(document.body.textContent).not.toContain(KEY);
    await screen.findByText("omni_sk_live_fake…");
    expect(screen.queryByTestId("new-key")).not.toBeInTheDocument();
  });

  it("clears the secret on pagehide for history-cache navigations", async () => {
    await mount(); await createKey(); fireEvent(window, new Event("pagehide"));
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it.each(["unmount", "pagehide"])("ignores late creation after %s", async action => {
    let resolveCreate;
    api.createMyApiKey.mockReturnValue(new Promise(resolve => { resolveCreate = resolve; }));
    const view = await mount(); fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    if (action === "unmount") view.unmount(); else fireEvent(window, new Event("pagehide"));
    await act(async () => resolveCreate(createdResponse));
    expect(document.body.textContent).not.toContain(KEY);
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });

  it.each(["denied", "unavailable"])("selects only the panel's key when clipboard is %s", async reason => {
    if (reason === "denied") writeText.mockRejectedValue(new Error("denied"));
    else Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await mount(); await createKey(); fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
    await screen.findByText("Text selected. Press Ctrl+C or ⌘C to copy.");
    expect(window.getSelection().toString()).toBe(KEY);
    expect(screen.getAllByText(KEY, { exact: false })).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(window.getSelection().toString()).toBe("");
  });

  it("defaults an empty name and resets acknowledgement for the next key", async () => {
    await mount(); fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByTestId("new-key");
    expect(api.createMyApiKey).toHaveBeenCalledWith("API key", { signal: expect.any(AbortSignal) });
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Create key" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Create key" })); await screen.findByTestId("new-key");
    expect(screen.getByRole("checkbox")).not.toBeChecked(); expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
  });

  it("confirms revoke in the page, supports cancellation, then updates the row", async () => {
    const confirm = vi.spyOn(window, "confirm"); await mount();
    const button = screen.getByRole("button", { name: "Revoke key notebook" }); fireEvent.click(button);
    expect(screen.getByRole("heading", { name: "Revoke ‘notebook’?" })).toBeInTheDocument();
    expect(screen.getByText("Scripts using it will stop working.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(); expect(api.revokeMyApiKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(button).toHaveFocus();
    fireEvent.click(button); fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Escape" });
    expect(api.revokeMyApiKey).not.toHaveBeenCalled(); fireEvent.click(button);
    api.listMyApiKeys.mockResolvedValue([{ ...active, status: "revoked" }, revoked]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke key notebook" }));
    await waitFor(() => expect(api.revokeMyApiKey).toHaveBeenCalledWith(1, { signal: expect.any(AbortSignal) }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Revoke key notebook" })).not.toBeInTheDocument());
    expect(screen.getAllByText("Revoked")).toHaveLength(2); expect(confirm).not.toHaveBeenCalled();
  });

  it("keeps failed revoke confirmation open with a safe error and retry", async () => {
    api.revokeMyApiKey.mockRejectedValueOnce(new Error(`private server details ${KEY}`)); await mount();
    fireEvent.click(screen.getByRole("button", { name: "Revoke key notebook" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke key notebook" })); await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not revoke the key. Please try again.");
    expect(document.body.textContent).not.toContain(KEY);
    expect(screen.getByRole("button", { name: "Confirm revoke key notebook" })).toBeEnabled();
    api.listMyApiKeys.mockResolvedValue([{ ...active, status: "revoked" }]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke key notebook" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm revoke key notebook" })).not.toBeInTheDocument());
    expect(api.revokeMyApiKey).toHaveBeenCalledTimes(2);
  });

  it("clears the new secret when its key is revoked", async () => {
    await mount(); await createKey(); fireEvent.click(screen.getByRole("button", { name: "Revoke key ci" }));
    api.listMyApiKeys.mockResolvedValue([{ ...createdMetadata, status: "revoked" }, active]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke key ci" }));
    await waitFor(() => expect(screen.queryByTestId("new-key")).not.toBeInTheDocument()); expect(document.body.innerHTML).not.toContain(KEY);
  });

  it("shows the helpful empty state", async () => {
    api.listMyApiKeys.mockResolvedValue([]); render(<Developer currentUser={user} />); await screen.findByText("No API keys yet.");
    expect(screen.getByText("Create a key to call the API from scripts, notebooks or MCP clients.")).toBeInTheDocument(); expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it.each([403, 500])("silently hides usage when billing fails with %s", async status => {
    billing.getUsageLimits.mockRejectedValue(Object.assign(new Error("Billing unavailable"), { status })); await mount();
    expect(screen.queryByRole("link", { name: /Literature answers/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Billing unavailable")).not.toBeInTheDocument(); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([null, { limits: [] }, { limits: [{ ...limits.limits[0], included: null }] }, { limits: [{ ...limits.limits[0], used: "invalid" }] }])("does not invent usage from missing or invalid limits", async response => {
    billing.getUsageLimits.mockResolvedValue(response); await mount(); expect(screen.queryByRole("link", { name: /Literature answers/ })).not.toBeInTheDocument();
  });

  it.each([null, "", "   "])("omits unavailable organization names (%s)", async name => {
    session.getIdentity.mockResolvedValue({ organizations: [{ organization_id: 42, organization_name: name }] }); await mount();
    expect(screen.getByText("usage is billed to this organization", { exact: true })).toBeInTheDocument(); expect(screen.queryByText(/unavailable|loading|in null/i)).not.toBeInTheDocument();
  });

  it("keeps key management working when identity lookup fails", async () => {
    session.getIdentity.mockRejectedValue(new Error("identity unavailable")); await mount();
    expect(screen.getByText("usage is billed to this organization", { exact: true })).toBeInTheDocument(); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers retry for a list failure without pretending the list is empty", async () => {
    api.listMyApiKeys.mockRejectedValueOnce(new Error(KEY)); render(<Developer currentUser={user} />); await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load API keys. Please try again.");
    expect(screen.queryByText("No API keys yet.")).not.toBeInTheDocument(); expect(document.body.textContent).not.toContain(KEY);
    fireEvent.click(screen.getByRole("button", { name: "Retry" })); await screen.findByRole("rowheader", { name: "notebook" });
  });

  it("keeps the secret available if reloading its metadata fails", async () => {
    await mount(); api.listMyApiKeys.mockRejectedValue(new Error("reload failed"));
    fireEvent.click(screen.getByRole("button", { name: "Create key" })); await screen.findByTestId("new-key"); await screen.findByRole("alert");
    expect(screen.getByTestId("new-key")).toHaveTextContent(KEY); expect(screen.getByText("New")).toBeInTheDocument();
  });

  it.each([409, 402, 500])("handles create failure %s without raw errors", async status => {
    api.createMyApiKey.mockRejectedValue(Object.assign(new Error(KEY), { status })); await mount();
    fireEvent.click(screen.getByRole("button", { name: "Create key" })); await screen.findByRole("alert");
    expect(document.body.textContent).not.toContain(KEY); expect(screen.queryByTestId("new-key")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create key" })).toBeEnabled();
  });

  it("retains the no-organization notice and skips billing without an org", async () => {
    api.listMyApiKeys.mockRejectedValueOnce(Object.assign(new Error("Your session is not in an organization"), { status: 400 }));
    render(<Developer currentUser={{ ...user, orgId: null }} />); await screen.findByText("No organization context");
    expect(screen.queryByText("Create a key")).not.toBeInTheDocument(); expect(billing.getUsageLimits).not.toHaveBeenCalled();
  });

  it("switches tabs by click and keyboard and copies the current example and base URL", async () => {
    await mount(); fireEvent.click(screen.getByRole("button", { name: "Copy base URL" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(apiBaseUrl()));
    for (const name of ["Python", "MCP", "cURL"]) {
      fireEvent.click(screen.getByRole("tab", { name })); expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
      const panel = screen.getByRole("tabpanel", { name }); expect(panel.textContent).toContain("OMNIBIOAI_API_KEY");
      if (name === "Python") expect(panel.textContent).toContain("import os");
      const code = panel.querySelector("pre").textContent;
      fireEvent.click(screen.getByRole("button", { name: `Copy ${name} example` })); await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(code));
      expect(code).toContain(name === "Python" ? "import os" : "OMNIBIOAI_API_KEY");
    }
    for (const [from, key, to] of [["cURL", "ArrowRight", "Python"], ["Python", "End", "MCP"], ["MCP", "ArrowRight", "cURL"], ["cURL", "ArrowLeft", "MCP"], ["MCP", "Home", "cURL"]]) {
      fireEvent.keyDown(screen.getByRole("tab", { name: from }), { key });
      expect(screen.getByRole("tab", { name: to })).toHaveFocus(); expect(screen.getByRole("tabpanel", { name: to })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /API docs/ })).toHaveAttribute("href", "https://docs.omnibioai.org/developer/api/");
    expect(screen.getByText("Each answer is billed once. Send the same Idempotency-Key to retry safely: you get the stored answer and aren’t billed again.")).toBeInTheDocument();
  });

  it("falls back to selecting the active example when Copy is denied", async () => {
    writeText.mockRejectedValue(new Error("denied")); await mount(); fireEvent.click(screen.getByRole("tab", { name: "Python" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Python example" })); await screen.findByText("Text selected. Press Ctrl+C or ⌘C to copy.");
    expect(window.getSelection().toString()).toContain('os.environ["OMNIBIOAI_API_KEY"]');
  });
});
