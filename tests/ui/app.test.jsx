import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { getCurrentUser, onSessionChange, consumeOAuthRedirectParams } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  onSessionChange: vi.fn(() => () => {}),
  consumeOAuthRedirectParams: vi.fn(() => null),
}));

vi.mock("../../src/ui/lib/session", () => ({
  getCurrentUser, onSessionChange, consumeOAuthRedirectParams,
  isElectron: () => false, refresh: vi.fn(), getRefreshToken: () => null,
}));

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
vi.mock("../../src/ui/pages/Workbench", () => ({ default: () => <div>Workbench page</div> }));
vi.mock("../../src/ui/pages/Settings", () => ({ default: () => <div>Settings page</div> }));
vi.mock("../../src/ui/pages/Jobs", () => ({ default: () => <div>Jobs page</div> }));
vi.mock("../../src/ui/pages/IdeServices", () => ({ default: () => <div>IDE page</div> }));
vi.mock("../../src/ui/pages/RoleManagement", () => ({ default: () => <div>Roles page</div> }));
vi.mock("../../src/ui/pages/ServiceViewer", () => ({ default: () => <div>Service page</div> }));
vi.mock("../../src/ui/pages/Videos", () => ({ default: () => <div>Videos page</div> }));

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
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());
    expect(screen.getByText("Roles")).toBeInTheDocument();
    window.dispatchEvent(new CustomEvent("navigate", { detail: 9 }));
    await waitFor(() => expect(screen.getByText("Jobs page")).toBeInTheDocument());
  });
});
