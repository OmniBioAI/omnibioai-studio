import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  startMfaEnrollment: vi.fn(), verifyMfaEnrollment: vi.fn(), removeMfaDevice: vi.fn(),
  getRecoveryCodeStatus: vi.fn(), generateRecoveryCodes: vi.fn(), regenerateRecoveryCodes: vi.fn(),
}));
const session = vi.hoisted(() => ({ version: 1, token: "TEST-TOKEN", listeners: new Set() }));
vi.mock("../../src/ui/lib/securityApi", () => api);
vi.mock("../../src/ui/lib/session", () => ({
  getToken: () => session.token, getSessionVersion: () => session.version,
  onSessionChange: callback => { session.listeners.add(callback); return () => session.listeners.delete(callback); },
}));
import MfaManagement from "../../src/ui/components/security/MfaManagement";

// jsdom does not implement the native dialog top layer. Browser qualification
// separately exercises real showModal(), focus trapping and Escape behavior.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

const secret = "TEST-MFA-SECRET-NOT-REAL";
const enrollment = { device_id: 7, otpauth_uri: `otpauth://totp/TEST?secret=${secret}&algorithm=SHA1&digits=6&period=30` };
const codes = ["TEST-RECOVERY-CODE-0001", "TEST-RECOVERY-CODE-0002"];
const verified = { id: 7, device_type: "totp", label: "Test authenticator", verified_at: "2026-01-01", created_at: "2026-01-01", last_used_at: null };
const user = { userId: 1, orgId: 1 };
const changed = vi.fn();
const clipboard = vi.fn();
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const click = name => fireEvent.click(screen.getByRole("button", { name }));
const mount = (devices = [verified]) => render(<MfaManagement currentUser={user} devices={devices} onChanged={changed} />);
const switchSession = token => act(() => { session.token = token; session.version++; session.listeners.forEach(callback => callback()); });
async function start() { click("Add authenticator"); await screen.findByText(secret); }
async function recovery() { click("Manage recovery codes"); await screen.findByText("2 unused recovery codes."); click("Regenerate recovery codes"); await screen.findByText(/TEST-RECOVERY-CODE-0001/, { selector: "pre" }); }

beforeEach(() => {
  vi.resetAllMocks(); session.version = 1; session.token = "TEST-TOKEN";
  api.startMfaEnrollment.mockResolvedValue(enrollment);
  api.verifyMfaEnrollment.mockResolvedValue(verified);
  api.removeMfaDevice.mockResolvedValue(null);
  api.getRecoveryCodeStatus.mockResolvedValue({ remaining: 2 });
  api.generateRecoveryCodes.mockResolvedValue({ codes });
  api.regenerateRecoveryCodes.mockResolvedValue({ codes });
  clipboard.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard } });
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function () { this.setAttribute("open", ""); });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function () { this.removeAttribute("open"); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("MFA enrollment", () => {
  it("uses a titled modal, manual setup, replay exclusion and canonical verification", async () => {
    mount(); await start();
    const dialog = screen.getByRole("dialog", { name: "Add authenticator" });
    expect(dialog).toHaveAttribute("aria-describedby", "mfa-dialog-description");
    expect(dialog).toHaveAttribute("data-sentry-block", "true");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    click("Copy setup key"); await screen.findByText("Copied");
    expect(clipboard).toHaveBeenCalledWith(secret);
    expect(api.verifyMfaEnrollment).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "000000" } });
    click("Verify authenticator");
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(api.verifyMfaEnrollment).toHaveBeenCalledWith(7, "000000");
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("clears code after invalid verification and never retries automatically", async () => {
    api.verifyMfaEnrollment.mockRejectedValue({ mfaMessage: "Invalid verification code. Try a new code from your authenticator." });
    mount(); await start();
    expect(screen.getByRole("button", { name: "Verify authenticator" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "000000" } });
    click("Verify authenticator");
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Verification code")).toHaveValue("");
    expect(api.verifyMfaEnrollment).toHaveBeenCalledOnce();
    expect(screen.getByText(secret)).toBeInTheDocument();
  });
  it("handles start failure with safe retry and malformed responses without leaking payloads", async () => {
    api.startMfaEnrollment.mockRejectedValueOnce(new Error(secret)).mockResolvedValueOnce({ device_id: 1, otpauth_uri: "https://example.test/?secret=x" });
    mount(); click("Add authenticator"); await screen.findByRole("alert");
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    click("Retry enrollment"); await screen.findByRole("alert");
    expect(screen.queryByText("x", { selector: "code" })).not.toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  });
  it("clears secrets on cancel, removes known pending enrollment and restores focus", async () => {
    mount(); const trigger = screen.getByRole("button", { name: "Add authenticator" }); trigger.focus();
    await start(); fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "000000" } });
    click("Cancel");
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
    await waitFor(() => expect(api.removeMfaDevice).toHaveBeenCalledWith(7));
    expect(trigger).toHaveFocus();
  });
  it("clears setup on Escape and reports pending cleanup failure safely", async () => {
    api.removeMfaDevice.mockRejectedValue(new Error(secret)); mount(); await start();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: false, cancelable: true }));
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).not.toHaveTextContent(secret);
  });
  it("discards start responses after cancellation and prevents double start", async () => {
    const request = deferred(); api.startMfaEnrollment.mockReturnValue(request.promise);
    mount(); click("Add authenticator");
    expect(screen.getByText("Updating MFA…")).toBeInTheDocument();
    click("Add authenticator"); expect(api.startMfaEnrollment).toHaveBeenCalledOnce();
    click("Cancel"); await act(async () => request.resolve(enrollment));
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(api.removeMfaDevice).not.toHaveBeenCalled();
  });
  it("prevents double verification and handles ambiguous verification response", async () => {
    const request = deferred(); api.verifyMfaEnrollment.mockReturnValue(request.promise);
    mount(); await start(); fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "000000" } });
    const submit = screen.getByRole("button", { name: "Verify authenticator" }); click("Verify authenticator");
    expect(submit).toBeDisabled(); fireEvent.submit(submit.closest("form"));
    expect(api.verifyMfaEnrollment).toHaveBeenCalledOnce();
    await act(async () => request.resolve({})); expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  });
  it("supports clipboard failure without disclosing content", async () => {
    clipboard.mockRejectedValue(new Error(secret)); mount(); await start(); click("Copy setup key");
    expect(await screen.findByText("Copy unavailable. Select and copy the text manually.")).toBeInTheDocument();
  });
  it("does not silently remove an authenticator after an uncertain verification", async () => {
    api.verifyMfaEnrollment.mockRejectedValue(new TypeError("Network failure"));
    mount(); await start();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "000000" } });
    click("Verify authenticator"); await screen.findByRole("alert"); click("Cancel");
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(api.removeMfaDevice).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledOnce();
  });
  it("destroys obsolete enrollment material after a terminal IAM verification error", async () => {
    api.verifyMfaEnrollment.mockRejectedValue({ mfaTerminal: true, mfaMessage: "This enrollment is no longer active. Start again." });
    mount(); await start(); fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "000000" } });
    click("Verify authenticator"); await screen.findByRole("alert");
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
    expect(changed).toHaveBeenCalledOnce();
    api.startMfaEnrollment.mockResolvedValue({ ...enrollment, device_id: 8 });
    click("Retry enrollment"); await screen.findByText(secret); click("Cancel");
    await waitFor(() => expect(api.removeMfaDevice).toHaveBeenCalledWith(8));
  });
  it("discards a missing enrollment response without displaying setup material", async () => {
    api.startMfaEnrollment.mockResolvedValue(null); mount(); click("Add authenticator");
    await screen.findByRole("button", { name: "Retry enrollment" });
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  });
  it("does not restore clipboard error state after dismissal", async () => {
    const request = deferred(); clipboard.mockReturnValue(request.promise);
    mount(); await start(); click("Copy setup key"); click("Cancel");
    await act(async () => request.reject(new Error("Clipboard unavailable")));
    expect(screen.queryByText(/Copy unavailable/)).not.toBeInTheDocument();
  });
  it("cycles keyboard focus through available dialog controls in both directions", async () => {
    mount(); await start();
    const dialog = screen.getByRole("dialog"), first = screen.getByRole("button", { name: "Copy setup key" }), last = screen.getByRole("button", { name: "Cancel" });
    last.focus(); fireEvent.keyDown(dialog, { key: "Tab" }); expect(first).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true }); expect(last).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true }); expect(last).toHaveFocus();
    first.focus(); fireEvent.keyDown(dialog, { key: "Tab" }); expect(first).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Enter" }); expect(first).toHaveFocus();
  });
  it("restores focus to the MFA section when the original trigger is gone", async () => {
    const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
    const { container } = mount(); await start(); trigger.remove(); click("Cancel");
    expect(container.querySelector(".mfa-management")).toHaveFocus();
  });
});

describe("device removal and recovery codes", () => {
  it("lists pending and verified devices and confirms last-device semantics", async () => {
    mount([{ ...verified, label: null, verified_at: null, created_at: null, last_used_at: "2026-01-02" }]);
    expect(screen.getByText(/Awaiting verification/)).toBeInTheDocument();
    click("Remove"); expect(screen.getByText("Removing the last verified authenticator disables personal MFA.")).toBeInTheDocument();
    click("Cancel"); expect(api.removeMfaDevice).not.toHaveBeenCalled();
    click("Remove"); click("Confirm removal"); await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(api.removeMfaDevice).toHaveBeenCalledWith(7);
  });
  it.each([403, 404, 422, 429, 500])("handles removal HTTP %s without an optimistic update", async status => {
    api.removeMfaDevice.mockRejectedValue({ status }); mount(); click("Remove"); click("Confirm removal");
    await screen.findByRole("alert"); expect(changed).not.toHaveBeenCalled();
  });
  it("prevents double removal while pending", async () => {
    const request = deferred(); api.removeMfaDevice.mockReturnValue(request.promise);
    mount(); click("Remove"); click("Confirm removal"); click("Confirm removal");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.getByText("Wait for this update to finish.")).toBeInTheDocument();
    expect(api.removeMfaDevice).toHaveBeenCalledOnce();
    await act(async () => request.resolve(null)); expect(changed).toHaveBeenCalledOnce();
  });
  it("only reads recovery status on open; requires explicit replacement then acknowledgement", async () => {
    mount(); click("Manage recovery codes"); await screen.findByText("2 unused recovery codes.");
    expect(api.regenerateRecoveryCodes).not.toHaveBeenCalled();
    expect(screen.getByText(/invalidates all previous unused codes/)).toBeInTheDocument();
    click("Regenerate recovery codes"); await screen.findByText(/Save these recovery codes now/);
    click("Copy all"); await screen.findByText("Copied"); expect(clipboard).toHaveBeenCalledWith(codes.join("\n"));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Save your codes, then choose/)).toBeInTheDocument();
    click("I have saved my codes"); expect(screen.queryByText(/TEST-RECOVERY/)).not.toBeInTheDocument();
    click("Manage recovery codes"); await screen.findByText("2 unused recovery codes.");
    expect(screen.queryByText(/TEST-RECOVERY/)).not.toBeInTheDocument();
  });
  it("generates codes when no unused codes remain, with double-submit protection", async () => {
    api.getRecoveryCodeStatus.mockResolvedValue({ remaining: 0 }); const request = deferred(); api.generateRecoveryCodes.mockReturnValue(request.promise);
    mount(); click("Manage recovery codes"); await screen.findByText("0 unused recovery codes.");
    click("Generate recovery codes"); click("Generate recovery codes"); expect(api.generateRecoveryCodes).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.getByText("Wait for this update to finish.")).toBeInTheDocument();
    await act(async () => request.resolve({ codes })); expect(screen.getByText(/Save these recovery codes/)).toBeInTheDocument();
  });
  it("retries recovery status and handles malformed status and code responses", async () => {
    api.getRecoveryCodeStatus.mockResolvedValueOnce({ remaining: -1 }).mockResolvedValueOnce({ remaining: 2 });
    api.regenerateRecoveryCodes.mockResolvedValueOnce({ codes: [null] });
    mount(); click("Manage recovery codes"); await screen.findByRole("alert"); click("Retry recovery status");
    await screen.findByText("2 unused recovery codes."); click("Regenerate recovery codes"); await screen.findByRole("alert");
    expect(screen.queryByText(/Save these recovery codes/)).not.toBeInTheDocument();
  });
  it("handles recovery generation failure without presenting stale codes", async () => {
    api.regenerateRecoveryCodes.mockRejectedValue(new Error(codes[0])); mount(); click("Manage recovery codes");
    await screen.findByText("2 unused recovery codes."); click("Regenerate recovery codes"); await screen.findByRole("alert");
    expect(screen.queryByText(/TEST-RECOVERY/)).not.toBeInTheDocument();
  });
});

describe("secret lifetime and session races", () => {
  it.each(["enrollment", "recovery"])("never persists %s secrets or adds them to history", async flow => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const push = vi.spyOn(history, "pushState"); const replace = vi.spyOn(history, "replaceState");
    const url = location.href; const { unmount } = mount();
    if (flow === "enrollment") await start(); else await recovery();
    expect(storage).not.toHaveBeenCalled(); expect(push).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
    expect(location.href).toBe(url); unmount();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    mount(); expect(screen.queryByText(/TEST-MFA|TEST-RECOVERY/)).not.toBeInTheDocument();
  });
  it.each(["enrollment", "recovery"])("destroys %s secrets on token refresh, logout and account switch", async flow => {
    const { rerender } = mount(); if (flow === "enrollment") await start(); else await recovery();
    switchSession("TEST-TOKEN-REFRESHED"); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    if (flow === "enrollment") await start(); else await recovery();
    rerender(<MfaManagement currentUser={{ userId: 2 }} devices={[]} onChanged={changed} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    if (flow === "enrollment") await start(); else await recovery();
    switchSession(null); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/TEST-MFA|TEST-RECOVERY/)).not.toBeInTheDocument();
  });
  it("CASE A: rejects User A enrollment after switching to B", async () => {
    const request = deferred(); api.startMfaEnrollment.mockReturnValue(request.promise);
    mount(); click("Add authenticator"); switchSession("TEST-B"); await act(async () => request.resolve(enrollment));
    expect(screen.queryByText(secret)).not.toBeInTheDocument(); expect(changed).not.toHaveBeenCalled();
  });
  it("CASE B: rejects recovery regeneration after logout", async () => {
    const request = deferred(); api.regenerateRecoveryCodes.mockReturnValue(request.promise);
    mount(); click("Manage recovery codes"); await screen.findByText("2 unused recovery codes."); click("Regenerate recovery codes");
    switchSession(null); await act(async () => request.resolve({ codes }));
    expect(screen.queryByText(/TEST-RECOVERY/)).not.toBeInTheDocument();
  });
  it("CASE C: removal response cannot refresh User B state", async () => {
    const request = deferred(); api.removeMfaDevice.mockReturnValue(request.promise);
    mount(); click("Remove"); click("Confirm removal"); switchSession("TEST-B");
    await act(async () => request.resolve(null)); expect(changed).not.toHaveBeenCalled();
  });
  it("CASE D: verification response cannot restore state after logout", async () => {
    const request = deferred(); api.verifyMfaEnrollment.mockReturnValue(request.promise);
    mount(); await start(); fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "000000" } });
    click("Verify authenticator"); switchSession(null); await act(async () => request.resolve(verified));
    expect(changed).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("ignores late errors and clipboard results after flow dismissal", async () => {
    const request = deferred(); api.startMfaEnrollment.mockReturnValueOnce(request.promise);
    mount(); click("Add authenticator"); click("Cancel"); await act(async () => request.reject(new Error(secret)));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await start(); const copied = deferred(); clipboard.mockReturnValueOnce(copied.promise); click("Copy setup key"); click("Cancel");
    await act(async () => copied.resolve()); expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });
});
