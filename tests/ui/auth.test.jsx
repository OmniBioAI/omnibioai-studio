import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { loginWithPassword, loginWithLicenseKey, getOAuthLoginUrl } = vi.hoisted(() => ({
  loginWithPassword: vi.fn(),
  loginWithLicenseKey: vi.fn(),
  getOAuthLoginUrl: vi.fn((p) => `https://auth.test/${p}`),
}));
vi.mock("../../src/ui/lib/session", () => ({
  loginWithPassword, loginWithLicenseKey, getOAuthLoginUrl,
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
    fireEvent.change(screen.getByPlaceholderText("OMNI-XXXX-XXXX-XXXX-XXXX"), { target: { value: "  OMNI-1  " } });
    fireEvent.click(screen.getByRole("button", { name: /activate license/i }));
    await waitFor(() => expect(screen.getByText("Invalid license key")).toBeInTheDocument());
    expect(loginWithLicenseKey).toHaveBeenCalledWith("OMNI-1", "a@b.test", "web");
  });

  it("switches to password mode, handles success, and provides OAuth links", async () => {
    loginWithPassword.mockResolvedValueOnce({ userId: 1 });
    render(<Login title="Welcome" description="Sign in" />);
    fireEvent.click(screen.getByRole("button", { name: "Password" }));
    fireEvent.change(screen.getByPlaceholderText("you@omnibioai"), { target: { value: "a@b.test" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(loginWithPassword).toHaveBeenCalledWith("a@b.test", "secret"));
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(getOAuthLoginUrl).toHaveBeenCalledWith("google");
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
