import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { loginWithPassword, loginWithLicenseKey, completePasswordLoginWithMfa, resendPasswordEmailOtp, getOAuthLoginUrl } = vi.hoisted(() => ({
  loginWithPassword: vi.fn(),
  loginWithLicenseKey: vi.fn(),
  completePasswordLoginWithMfa: vi.fn(),
  resendPasswordEmailOtp: vi.fn(),
  getOAuthLoginUrl: vi.fn((p) => `https://auth.test/${p}`),
}));
vi.mock("../../src/ui/lib/session", () => ({
  loginWithPassword, loginWithLicenseKey, completePasswordLoginWithMfa, resendPasswordEmailOtp, getOAuthLoginUrl,
  isElectron: () => false, oauthProviders: () => ["google", "github"],
  logout: vi.fn(),
}));

import Login from "../../src/ui/components/Login";
import RequirePermission from "../../src/ui/components/RequirePermission";

describe("authentication UI", () => {
  it("submits a trimmed license key and exposes API errors", async () => {
    loginWithLicenseKey.mockRejectedValueOnce(new Error("Invalid license key"));
    render(<Login title="Welcome" description="Sign in" />);
    fireEvent.change(screen.getByPlaceholderText("you@omnibioai"), { target: { value: "a@b.test" } });
    expect(document.querySelector('input[type="password"]')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("OMNI-XXXX-XXXX-XXXX-XXXX"), { target: { value: "  OMNI-1  " } });
    fireEvent.click(screen.getByRole("button", { name: /activate license/i }));
    await waitFor(() => expect(screen.getByText("Invalid license key")).toBeInTheDocument());
    expect(loginWithLicenseKey).toHaveBeenCalledWith("OMNI-1", "a@b.test", "web");
  });

  it("switches to password mode, handles success, and provides OAuth links", async () => {
    loginWithPassword.mockResolvedValueOnce({ userId: 1 });
    render(<Login title="Welcome" description="Sign in" />);
    fireEvent.click(screen.getByRole("button", { name: "Password Login" }));
    fireEvent.change(screen.getByPlaceholderText("you@omnibioai"), { target: { value: "a@b.test" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(loginWithPassword).toHaveBeenCalledWith("a@b.test", "secret"));
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(getOAuthLoginUrl).toHaveBeenCalledWith("google");
  });

  it("advances password login to a six-digit email OTP screen", async () => {
    const challenge = Object.assign(new Error("OTP required"), {
      code: "mfa_required", challengeToken: "challenge", methods: ["email"],
    });
    loginWithPassword.mockRejectedValueOnce(challenge);
    completePasswordLoginWithMfa
      .mockRejectedValueOnce(Object.assign(new Error("Authenticator required"), {
        code: "mfa_required", challengeToken: "totp-challenge", methods: ["totp", "recovery_code"],
      }))
      .mockResolvedValueOnce({ userId: 1 });
    render(<Login />);
    fireEvent.click(screen.getByRole("button", { name: "Password Login" }));
    fireEvent.change(screen.getByPlaceholderText("you@omnibioai"), { target: { value: "admin@omnibioai.org" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const otp = await screen.findByLabelText("Email OTP verification");
    expect(otp).toHaveAttribute("pattern", "[0-9]{6}");
    expect(document.querySelector('input[type="password"]')).toBeNull();
    fireEvent.change(otp, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify OTP" }));
    await waitFor(() => expect(completePasswordLoginWithMfa).toHaveBeenCalledWith("challenge", "123456", "email"));
    const authenticator = await screen.findByLabelText("Authenticator or recovery code");
    expect(authenticator).not.toHaveAttribute("pattern");
    fireEvent.change(authenticator, { target: { value: "AAAA-BBBB-CCCC" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify OTP" }));
    await waitFor(() => expect(completePasswordLoginWithMfa)
      .toHaveBeenLastCalledWith("totp-challenge", "AAAA-BBBB-CCCC", undefined));
  });

  it("gates protected content by permission and preserves loading state", () => {
    const { rerender } = render(<RequirePermission permission="manage_roles" currentUser={null}><div>secret</div></RequirePermission>);
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
    rerender(<RequirePermission permission="manage_roles" currentUser={{ permissions: [] }}><div>secret</div></RequirePermission>);
    expect(screen.getByText("Access denied")).toBeInTheDocument();
    rerender(<RequirePermission permission="manage_roles" currentUser={{ permissions: ["manage_roles"] }}><div>secret</div></RequirePermission>);
    expect(screen.getByText("secret")).toBeInTheDocument();
  });
});
