import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getPreferences: vi.fn(), updatePreferences: vi.fn() }));
const session = vi.hoisted(() => ({ version: 1, token: "TEST-A", listeners: new Set() }));
vi.mock("../../src/ui/lib/preferencesApi", async original => ({ ...await original(), ...api }));
vi.mock("../../src/ui/lib/session", () => ({
  getToken: () => session.token, getSessionVersion: () => session.version,
  onSessionChange: callback => { session.listeners.add(callback); return () => session.listeners.delete(callback); },
}));
import PreferencesProvider from "../../src/ui/components/PreferencesProvider";
import AccountPersonalization from "../../src/ui/pages/AccountPersonalization";
import AccountLayout from "../../src/ui/components/AccountLayout";
import { PERSONALIZATION_DEFAULTS } from "../../src/ui/lib/personalization";

const defaults = { timezone: "UTC", ...PERSONALIZATION_DEFAULTS };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save personalization" }));
const ready = () => screen.findByLabelText("Response style");
const switchSession = token => act(() => { session.token = token; session.version++; session.listeners.forEach(fn => fn()); });
function Tree({ user = { userId: 1 } }) { return <PreferencesProvider currentUser={user}><AccountLayout activeSection="personalization" onNavigate={vi.fn()}><AccountPersonalization /></AccountLayout></PreferencesProvider>; }
beforeEach(() => {
  vi.clearAllMocks(); session.version = 1; session.token = "TEST-A";
  api.getPreferences.mockResolvedValue(defaults);
  api.updatePreferences.mockImplementation(async changes => ({ ...defaults, ...changes }));
});
afterEach(cleanup);

describe("Account personalization", () => {
  it("loads confirmed values with accessible labels and an honest consumption status", async () => {
    render(<Tree />); expect(screen.getByRole("status")).toHaveTextContent("Loading personalization");
    expect(await ready()).toHaveValue("balanced");
    expect(screen.getByRole("heading", { name: "Personalization" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Personalization" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Technical level")).toHaveValue("general");
    expect(screen.getByLabelText("Preferred language")).toHaveValue("");
    expect(screen.getByLabelText("Personal instructions")).toHaveValue("");
    expect(screen.getByText(/AI apps do not apply these settings yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save personalization" })).toBeDisabled();
    expect(api.getPreferences).toHaveBeenCalledOnce();
  });

  it("saves all four choices explicitly, retains timezone and reloads durable values", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const request = deferred(); api.updatePreferences.mockReturnValueOnce(request.promise);
    const { unmount } = render(<Tree />); await ready();
    change("Response style", "concise"); change("Technical level", "expert");
    change("Preferred language", "hi"); change("Personal instructions", "Define abbreviations.\nUse examples.");
    expect(api.updatePreferences).not.toHaveBeenCalled(); save();
    const choices = { response_style: "concise", technical_level: "expert", preferred_language: "hi", personal_instructions: "Define abbreviations.\nUse examples." };
    expect(api.updatePreferences).toHaveBeenCalledWith(choices);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Saving personalization");
    for (const label of ["Response style", "Technical level", "Preferred language", "Personal instructions"]) expect(screen.getByLabelText(label)).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Response style").closest("form")); expect(api.updatePreferences).toHaveBeenCalledOnce();
    await act(async () => request.resolve({ ...defaults, ...choices }));
    expect(screen.getByRole("status")).toHaveTextContent("Personalization saved.");
    expect(screen.getByRole("button", { name: "Save personalization" })).toBeDisabled();
    expect(storage).not.toHaveBeenCalled(); storage.mockRestore(); unmount();
    api.getPreferences.mockResolvedValue({ ...defaults, ...choices }); render(<Tree />);
    expect(await ready()).toHaveValue("concise"); expect(screen.getByLabelText("Personal instructions")).toHaveValue(choices.personal_instructions);
    change("Preferred language", ""); change("Personal instructions", ""); save();
    await screen.findByText("Personalization saved.");
    expect(api.updatePreferences).toHaveBeenLastCalledWith({ preferred_language: null, personal_instructions: "" });
  });

  it("uses keyboard-accessible native controls and clears the saved state on editing", async () => {
    const user = userEvent.setup(); render(<Tree />); await ready();
    screen.getByLabelText("Response style").focus(); await user.selectOptions(screen.getByLabelText("Response style"), "detailed");
    await user.tab(); expect(screen.getByLabelText("Technical level")).toHaveFocus();
    await user.selectOptions(screen.getByLabelText("Technical level"), "bioinformatics");
    await user.tab(); expect(screen.getByLabelText("Preferred language")).toHaveFocus();
    await user.selectOptions(screen.getByLabelText("Preferred language"), "ja");
    await user.tab(); expect(screen.getByLabelText("Personal instructions")).toHaveFocus();
    await user.type(screen.getByLabelText("Personal instructions"), "Use examples.");
    await user.tab(); await user.keyboard("{Enter}"); await screen.findByText("Personalization saved.");
    change("Response style", "balanced"); expect(screen.queryByText("Personalization saved.")).not.toBeInTheDocument();
  });

  it("validates Unicode character bounds and rejects unchanged or invalid submissions", async () => {
    render(<Tree />); await ready(); const input = screen.getByLabelText("Personal instructions");
    fireEvent.submit(input.closest("form")); expect(api.updatePreferences).not.toHaveBeenCalled();
    change("Personal instructions", "🧬".repeat(2001));
    expect(input).toHaveAttribute("aria-invalid", "true"); expect(input).toHaveAttribute("aria-describedby", expect.stringContaining("personalization-instructions-error"));
    expect(screen.getByRole("alert")).toHaveTextContent("Use no more than 2,000 characters.");
    expect(screen.getByRole("button", { name: "Save personalization" })).toBeDisabled();
    fireEvent.submit(input.closest("form")); expect(api.updatePreferences).not.toHaveBeenCalled();
    change("Personal instructions", "🧬".repeat(2000)); expect(input).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText("2000 / 2000 characters")).toBeInTheDocument(); save(); await screen.findByText("Personalization saved.");
  });

  it.each(["Response style", "Technical level", "Preferred language"])("rejects an invalid %s before saving", async label => {
    render(<Tree />); await ready(); const input = screen.getByLabelText(label);
    const option = document.createElement("option"); option.value = "invalid"; input.appendChild(option);
    change(label, "invalid"); expect(input).toHaveAttribute("aria-invalid", "true"); expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.submit(input.closest("form")); expect(api.updatePreferences).not.toHaveBeenCalled();
  });

  it("treats instruction markup as text", async () => {
    const instructions = '<img src=x onerror="alert(1)"><script>execute()</script>';
    api.getPreferences.mockResolvedValue({ ...defaults, personal_instructions: instructions });
    const { container } = render(<Tree />); await ready();
    expect(screen.getByLabelText("Personal instructions")).toHaveValue(instructions);
    expect(container.querySelector("img, script")).toBeNull();
  });

  it("retries a load error and avoids invented defaults on older IAM", async () => {
    api.getPreferences.mockRejectedValueOnce(new Error("sensitive server details")).mockResolvedValueOnce({ timezone: "UTC" }); render(<Tree />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load preferences.");
    expect(screen.queryByLabelText("Response style")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Personalization is not available");
    expect(screen.queryByRole("button", { name: "Save personalization" })).not.toBeInTheDocument();
    api.getPreferences.mockResolvedValue(defaults); fireEvent.click(screen.getByRole("button", { name: "Retry" })); await ready();
  });

  it.each([new TypeError("network"), { code: "PREFERENCES_VALIDATION" }])("retains drafts after save failure and retries without claiming success", async error => {
    api.updatePreferences.mockRejectedValueOnce(error); render(<Tree />); await ready();
    change("Personal instructions", "Keep this draft"); save(); await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent(error.code ? "Check your preference values" : "Unable to save preferences");
    expect(screen.getByLabelText("Personal instructions")).toHaveValue("Keep this draft");
    expect(screen.queryByText("Personalization saved.")).not.toBeInTheDocument();
    save(); await screen.findByText("Personalization saved.");
  });

  it.each(["resolve", "reject"])("rejects stale load %s after account switching", async outcome => {
    const request = deferred(); api.getPreferences.mockReturnValueOnce(request.promise); render(<Tree />);
    switchSession("TEST-B"); await ready();
    await act(async () => request[outcome](outcome === "resolve" ? { ...defaults, personal_instructions: "User A" } : new Error("User A")));
    expect(screen.getByLabelText("Personal instructions")).toHaveValue(""); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["resolve", "reject"])("rejects stale save %s after account switching", async outcome => {
    const request = deferred(); api.updatePreferences.mockReturnValueOnce(request.promise); render(<Tree />); await ready();
    change("Personal instructions", "User A"); save(); switchSession("TEST-B"); await ready();
    await act(async () => request[outcome](outcome === "resolve" ? { ...defaults, personal_instructions: "User A" } : new Error("User A")));
    expect(screen.getByLabelText("Personal instructions")).toHaveValue(""); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Personalization saved.")).not.toBeInTheDocument();
    change("Personal instructions", "User B"); save(); await screen.findByText("Personalization saved.");
  });

  it("clears private drafts on logout and ignores save completion after navigation", async () => {
    const { rerender, unmount } = render(<Tree />); await ready(); change("Personal instructions", "Private draft");
    switchSession(null); rerender(<Tree user={null} />);
    expect(screen.getByText("Sign in to manage your personalization.")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Private draft")).not.toBeInTheDocument(); unmount();
    session.token = "TEST-A"; const request = deferred(); api.updatePreferences.mockReturnValueOnce(request.promise);
    const next = render(<Tree />); await ready(); change("Personal instructions", "Pending"); save(); next.unmount();
    await act(async () => request.resolve({ ...defaults, personal_instructions: "Pending" }));
    expect(screen.queryByText("Personalization saved.")).not.toBeInTheDocument();
  });
});
