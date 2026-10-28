import React from "react";
vi.mock("../../src/ui/components/PreferencesProvider", () => ({ default: ({ children }) => <>{children}</> }));
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { getCurrentUser, getIdentity, onSessionChange, consumeOAuthRedirectParams, openExternal } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getIdentity: vi.fn().mockResolvedValue({ organizations: [] }),
  onSessionChange: vi.fn(() => () => {}),
  consumeOAuthRedirectParams: vi.fn(() => null),
  openExternal: vi.fn(),
}));

vi.mock("../../src/ui/lib/session", () => ({
  getCurrentUser, getIdentity, onSessionChange, consumeOAuthRedirectParams,
  isElectron: () => false, refresh: vi.fn(), getRefreshToken: () => null, logout: vi.fn(),
}));
vi.mock("../../src/ui/lib/externalLink", () => ({ openExternal }));

vi.mock("../../src/ui/components/LicenseGate", () => ({ default: ({ children }) => <>{children}</> }));
vi.mock("../../src/ui/components/Login", () => ({ default: () => <div>Login screen</div> }));
vi.mock("../../src/ui/components/BugReport", () => ({ default: () => null }));
vi.mock("../../src/ui/components/UpdateBanner", () => ({ default: () => null }));
vi.mock("../../src/ui/components/MobileNav", () => ({ default: () => null }));
vi.mock("../../src/ui/components/OAuthLinkConfirm", () => ({ default: () => null }));
vi.mock("../../src/ui/components/GrafanaViewer", () => ({ GrafanaViewer: () => <div>Grafana</div> }));

vi.mock("../../src/ui/pages/Mode", () => ({ default: () => <div>Mode page</div> }));
vi.mock("../../src/ui/pages/LLM", () => ({ default: () => <div>LLM page</div> }));
vi.mock("../../src/ui/pages/Cloud", () => ({ default: () => <div>Cloud page</div> }));
vi.mock("../../src/ui/pages/HPC", () => ({ default: () => <div>HPC page</div> }));
vi.mock("../../src/ui/pages/Launch", () => ({ default: () => <div>Launch page</div> }));
vi.mock("../../src/ui/pages/Services", () => ({ default: () => <div>Services page</div> }));
vi.mock("../../src/ui/pages/Logs", () => ({ default: () => <div>Logs page</div> }));
vi.mock("../../src/ui/pages/Studio", () => ({ default: () => <div>Studio page</div> }));
vi.mock("../../src/ui/pages/Settings", () => ({ default: () => <div>Settings page</div> }));
vi.mock("../../src/ui/pages/Jobs", () => ({ default: () => <div>Jobs page</div> }));
vi.mock("../../src/ui/pages/RoleManagement", () => ({ default: () => <div>Roles page</div> }));
vi.mock("../../src/ui/pages/ServiceViewer", () => ({ default: ({ url }) => <iframe title="Service page" src={url} /> }));
vi.mock("../../src/ui/pages/StandaloneAppLaunch", () => ({ default: () => <div>Standalone Admin launch page</div> }));
vi.mock("../../src/ui/pages/Videos", () => ({ default: () => <div>Videos page</div> }));
vi.mock("../../src/ui/pages/Profile", () => ({ default: () => <div>Profile page</div> }));
vi.mock("../../src/ui/pages/AccountSecurity", () => ({ default: () => <div>Security page</div> }));

import App from "../../src/ui/App";

describe("application shell", () => {
  it("waits for auth and shows the login entry point when signed out", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Login screen")).toBeInTheDocument());
    expect(screen.queryByText("Roles")).not.toBeInTheDocument();
  });

  it("renders the authorized shell and responds to application navigation events", async () => {
    getCurrentUser.mockResolvedValueOnce({ userId: 1, email: "admin@test", permissions: ["manage_roles"] });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    expect(screen.getByText("Roles")).toBeInTheDocument();
    window.dispatchEvent(new CustomEvent("navigate", { detail: 9 }));
    await waitFor(() => expect(screen.getByText("Jobs page")).toBeInTheDocument());
  });

  it("routes Admin Console open-service events to a new tab instead of ServiceViewer", async () => {
    getCurrentUser.mockResolvedValueOnce({ userId: 1, email: "admin@test", permissions: ["manage_roles"] });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());

    window.dispatchEvent(new CustomEvent("open-service", {
      detail: { url: "https://admin.omnibioai.org/iam/service-accounts", label: "API Keys & Service Accounts" },
    }));

    expect(openExternal).toHaveBeenCalledWith("https://admin.omnibioai.org/iam/service-accounts?obai_theme=dark");
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.queryByTitle("Service page")).not.toBeInTheDocument();
  });

  it("resolves /studio/admin to the standalone launch page, never an embedded service", async () => {
    const originalPath = window.location.pathname;
    window.history.replaceState({}, "", "/studio/admin");
    getCurrentUser.mockResolvedValueOnce({ userId: 1, email: "admin@test", permissions: ["manage_roles"] });
    try {
      render(<App />);
      await waitFor(() => expect(screen.getByText("Standalone Admin launch page")).toBeInTheDocument());
      expect(document.querySelector("iframe")).toBeNull();
    } finally {
      window.history.replaceState({}, "", originalPath);
    }
  });
});
