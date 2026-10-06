import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getPreferences: vi.fn(), updatePreferences: vi.fn() }));
const session = vi.hoisted(() => ({ version: 1, token: "TEST-A", listeners: new Set() }));
vi.mock("../../src/ui/lib/preferencesApi", async original => ({ ...await original(), ...api }));
vi.mock("../../src/ui/lib/session", () => ({
  getToken: () => session.token, getSessionVersion: () => session.version,
  onSessionChange: callback => { session.listeners.add(callback); return () => session.listeners.delete(callback); },
}));
import PreferencesProvider, { useAccountDateTime, usePreferences } from "../../src/ui/components/PreferencesProvider";
import AccountPreferences from "../../src/ui/pages/AccountPreferences";
import AccountLayout from "../../src/ui/components/AccountLayout";

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function Consumer() {
  const format = useAccountDateTime();
  const state = usePreferences();
  return <><output aria-label="formatted">{format("2026-01-01T12:00:00")}</output>
    <output aria-label="time-only">{format(1767268800000, true)}</output>
    {[null, undefined, "", "bad"].map((value, i) => <span key={i}>{format(value)}</span>)}
    <button onClick={() => state.save({ timezone: "UTC" })}>Programmatic save</button></>;
}
function Tree({ user = { userId: 1 } }) { return <PreferencesProvider currentUser={user}><AccountLayout activeSection="preferences" onNavigate={vi.fn()}><AccountPreferences /><Consumer /></AccountLayout></PreferencesProvider>; }
const change = value => fireEvent.change(screen.getByLabelText("Time zone"), { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
const switchSession = token => act(() => { session.token = token; session.version++; session.listeners.forEach(fn => fn()); });
beforeEach(() => { vi.clearAllMocks(); session.version = 1; session.token = "TEST-A"; api.getPreferences.mockResolvedValue({ timezone: null }); api.updatePreferences.mockImplementation(async changes => changes); });
afterEach(cleanup);

describe("account preferences", () => {
  it("refreshes preference ownership without remounting unrelated Studio content", async () => {
    const mounted = vi.fn();
    function StudioContent() { React.useEffect(() => { mounted(); }, []); return <AccountPreferences />; }
    render(<PreferencesProvider currentUser={{ userId: 1 }}><StudioContent /></PreferencesProvider>);
    await screen.findByLabelText("Time zone"); change("America/Chicago");
    switchSession("TEST-REFRESH"); await screen.findByLabelText("Time zone");
    expect(screen.getByLabelText("Time zone")).toHaveValue(""); expect(mounted).toHaveBeenCalledOnce();
  });
  it("loads canonical defaults, provides accessible input and hides unsupported settings", async () => {
    render(<Tree />); expect(screen.getByText("Loading preferences…")).toBeInTheDocument();
    expect(await screen.findByLabelText("Time zone")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Preferences" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Save preferences" })).toBeDisabled();
    // Appearance is dropped from this guard — it's now a real sibling Account section
    // (see AccountAppearance.jsx), not an unsupported setting; its sidebar nav entry
    // legitimately appears here. Language/editor/workspace defaults remain unbuilt.
    expect(screen.queryByText(/Language|Default editor|Default workspace/)).not.toBeInTheDocument();
    expect(api.getPreferences).toHaveBeenCalledOnce();
  });
  it("saves explicitly, consumes the confirmed timezone and reloads durable state", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const { unmount } = render(<Tree />); await screen.findByLabelText("Time zone"); change("Asia/Kolkata");
    expect(api.updatePreferences).not.toHaveBeenCalled(); save(); await screen.findByText("Preferences saved.");
    expect(api.updatePreferences).toHaveBeenCalledWith({ timezone: "Asia/Kolkata" });
    const expected = new Date("2026-01-01T12:00:00Z").toLocaleString(undefined, { timeZone: "Asia/Kolkata", timeZoneName: "short" });
    expect(screen.getByLabelText("formatted")).toHaveTextContent(expected);
    expect(storage).not.toHaveBeenCalled(); storage.mockRestore(); unmount();
    api.getPreferences.mockResolvedValue({ timezone: "Asia/Kolkata" }); render(<Tree />);
    expect(await screen.findByLabelText("Time zone")).toHaveValue("Asia/Kolkata");
    change(""); save(); await screen.findByText("Preferences saved."); expect(api.updatePreferences).toHaveBeenLastCalledWith({ timezone: null });
  });
  it("validates input and prevents invalid/unchanged form submissions", async () => {
    render(<Tree />); const input = await screen.findByLabelText("Time zone");
    fireEvent.submit(input.closest("form")); expect(api.updatePreferences).not.toHaveBeenCalled();
    change("CST"); expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "timezone-help timezone-validation");
    fireEvent.submit(input.closest("form")); expect(api.updatePreferences).not.toHaveBeenCalled();
  });
  it("isolates load errors and retries safely", async () => {
    api.getPreferences.mockRejectedValueOnce(new Error("internal")); render(<Tree />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load preferences.");
    fireEvent.click(screen.getByText("Programmatic save")); expect(api.updatePreferences).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" })); await screen.findByLabelText("Time zone");
  });
  it("does not apply failed or pending saves and prevents double submission", async () => {
    api.getPreferences.mockResolvedValue({ timezone: "UTC" }); const request = deferred(); api.updatePreferences.mockReturnValue(request.promise);
    render(<Tree />); await screen.findByLabelText("Time zone"); const original = screen.getByLabelText("formatted").textContent;
    change("Asia/Kolkata"); save(); expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Time zone").closest("form")); fireEvent.click(screen.getByText("Programmatic save")); expect(api.updatePreferences).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("formatted")).toHaveTextContent(original);
    await act(async () => request.reject(new Error("internal"))); expect(screen.getByRole("alert")).toHaveTextContent("Unable to save");
    expect(screen.getByLabelText("formatted")).toHaveTextContent(original); expect(screen.queryByText("Preferences saved.")).not.toBeInTheDocument();
  });
  it("does not fetch for signed-out accounts", () => {
    render(<Tree user={null} />); expect(screen.getByText("Sign in to manage your preferences.")).toBeInTheDocument(); expect(api.getPreferences).not.toHaveBeenCalled();
  });
  it.each(["resolve", "reject"])("discards stale User A load %s after switching to B", async outcome => {
    const request = deferred(); api.getPreferences.mockReturnValueOnce(request.promise).mockResolvedValue({ timezone: "UTC" });
    render(<Tree />); switchSession("TEST-B"); await screen.findByLabelText("Time zone");
    await act(async () => request[outcome](outcome === "resolve" ? { timezone: "Asia/Kolkata" } : new Error("A")));
    expect(screen.getByLabelText("Time zone")).toHaveValue("UTC"); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it.each(["resolve", "reject"])("discards stale User A save %s after switching to B", async outcome => {
    const request = deferred(); api.updatePreferences.mockReturnValue(request.promise);
    render(<Tree />); await screen.findByLabelText("Time zone"); change("Asia/Kolkata"); save();
    api.getPreferences.mockResolvedValue({ timezone: "UTC" }); switchSession("TEST-B"); await screen.findByLabelText("Time zone");
    await act(async () => request[outcome](outcome === "resolve" ? { timezone: "Asia/Kolkata" } : new Error("A")));
    expect(screen.getByLabelText("Time zone")).toHaveValue("UTC"); expect(screen.queryByText("Preferences saved.")).not.toBeInTheDocument(); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("clears values on logout and rejects pending responses after navigation", async () => {
    api.getPreferences.mockResolvedValue({ timezone: "Asia/Kolkata" }); const { rerender, unmount } = render(<Tree />);
    await screen.findByLabelText("Time zone"); switchSession(null); rerender(<Tree user={null} />);
    expect(screen.queryByLabelText("Time zone")).not.toBeInTheDocument(); expect(screen.queryByDisplayValue("Asia/Kolkata")).not.toBeInTheDocument();
    unmount(); session.token = "TEST-A"; const request = deferred(); api.updatePreferences.mockReturnValue(request.promise);
    const next = render(<Tree />); await screen.findByLabelText("Time zone"); change("UTC"); save(); next.unmount();
    await act(async () => request.resolve({ timezone: "UTC" })); expect(screen.queryByText("Preferences saved.")).not.toBeInTheDocument();
  });
});
