import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null, identity: { organizations: [] } }));
vi.mock("../../src/ui/lib/session", () => ({
  getCurrentUser: vi.fn(async () => session.user), getIdentity: vi.fn(async () => session.identity),
  getCurrentUserSync: () => session.user, getSessionVersion: () => 1,
  onSessionChange: vi.fn(() => vi.fn()), consumeOAuthRedirectParams: vi.fn(() => null),
  isElectron: vi.fn(() => true), refresh: vi.fn(), getRefreshToken: vi.fn(() => null), getToken: vi.fn(() => "token"),
  logout: vi.fn(),
}));
vi.mock("../../src/ui/lib/web/webApi", () => ({ loadConfig: vi.fn(async () => ({ mode: "beta" })) }));
vi.mock("../../src/ui/components/LicenseGate", () => ({ default: ({ children }) => <>{children}</> }));
vi.mock("../../src/ui/components/PreferencesProvider", () => ({ default: ({ children }) => <>{children}</>, usePreferences: () => ({ owner: "test", authenticated: true, status: "success", data: { timezone: null } }), useAccountDateTime: () => value => value || "Not provided" }));
vi.mock("../../src/ui/components/AppearanceProvider", () => ({ default: ({ children }) => <>{children}</> }));
vi.mock("../../src/ui/components/BugReport", () => ({ default: () => null }));
vi.mock("../../src/ui/components/UpdateBanner", () => ({ default: () => null }));
vi.mock("../../src/ui/components/MobileNav", () => ({ default: () => null }));
vi.mock("../../src/ui/components/Login", () => ({ default: () => <div>Login</div> }));
vi.mock("../../src/ui/components/WorkbenchModuleHeader", () => ({ default: () => null }));
vi.mock("../../src/ui/components/OAuthLinkConfirm", () => ({ default: () => null }));
vi.mock("../../src/ui/components/GrafanaViewer", () => ({ GrafanaViewer: () => null }));

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
vi.mock("../../src/ui/pages/RoleManagement", () => ({ default: () => <div>Members &amp; roles page</div> }));
vi.mock("../../src/ui/pages/Billing", () => ({ default: ({ view }) => <div>{view === "usage" ? "Usage page" : "Billing page"}</div> }));
vi.mock("../../src/ui/pages/Workbench", () => ({ default: () => <div>Workbench page</div> }));
vi.mock("../../src/ui/pages/Developer", () => ({ default: () => <div>API keys page</div> }));
vi.mock("../../src/ui/pages/Profile", () => ({ default: () => <div>Profile page</div> }));
vi.mock("../../src/ui/pages/AccountSecurity", () => ({ default: () => <div>Security page</div> }));
vi.mock("../../src/ui/pages/AccountPreferences", () => ({ default: () => <div>Preferences page</div> }));
vi.mock("../../src/ui/pages/AccountPersonalization", () => ({ default: () => <div>Personalization section</div> }));
vi.mock("../../src/ui/pages/AccountAppearance", () => ({ default: () => <div>Appearance section</div> }));
vi.mock("../../src/ui/pages/AccountNotifications", () => ({ default: () => <div>Notifications section</div> }));
vi.mock("../../src/ui/pages/OrganizationConnections", () => ({ default: () => <div>Connections page</div> }));
vi.mock("../../src/ui/pages/AccountPrivacy", () => ({ default: () => <div>Privacy page</div> }));
vi.mock("../../src/ui/pages/AccountPlan", () => ({ default: () => <div>Old plan page</div> }));
vi.mock("../../src/ui/pages/AccountStorage", () => ({ default: () => <div>Old storage page</div> }));
vi.mock("../../src/ui/pages/AccountMembershipStorage", () => ({ default: () => <div>Membership storage page</div> }));
vi.mock("../../src/ui/pages/AccountHelp", () => ({ default: () => <div>Help page</div> }));
vi.mock("../../src/ui/pages/Projects", () => ({ default: () => <div>Projects page</div> }));
vi.mock("../../src/ui/pages/Artifacts", () => ({ default: () => <div>Artifacts page</div> }));
vi.mock("../../src/ui/pages/Explore", () => ({ default: () => <div>Explore page</div> }));
vi.mock("../../src/ui/pages/Integrations", () => ({ default: () => <div>Integrations page</div> }));

import App, { LEGACY_ACCOUNT_REDIRECTS, resolveInitialPage } from "../../src/ui/App";

const admin = { userId: 1, email: "alex@example.org", orgId: 1, permissions: ["manage_roles"] };

beforeEach(() => {
  cleanup();
  session.user = admin;
  session.identity = { organizations: [{ organization_id: 1, organization_name: "Genome Lab" }] };
  window.history.replaceState({}, "", "/studio");
});
afterEach(cleanup);

describe("Account route migration", () => {
  it("redirects legacy URLs while preserving query strings", () => {
    for (const [legacy, destination] of Object.entries(LEGACY_ACCOUNT_REDIRECTS)) {
      window.history.replaceState({}, "", `${legacy}?checkout=success&organization_id=7`);
      resolveInitialPage();
      expect(window.location.pathname).toBe(destination);
      expect(window.location.search).toBe("?checkout=success&organization_id=7");
    }
  });

  it("keeps Runtime to Launch, Services and Logs and opens Account from the footer button", async () => {
    render(<App />);
    await screen.findByText("Studio page");
    const runtime = document.querySelector('[data-nav-section="Runtime"]');
    expect([...runtime.querySelectorAll("[data-nav-item]")].map(item => item.textContent.trim())).toEqual(["Launch", "Services", "Logs"]);
    expect(screen.queryByText("Billing", { selector: "[data-nav-item]" })).not.toBeInTheDocument();
    expect(screen.queryByText("Developer", { selector: "[data-nav-item]" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Account" }));
    await screen.findByText("Profile page");
    expect(window.location.pathname).toBe("/studio/account/profile");
  });

  it.each([
    ["/studio/account/organization/billing", "Billing page"],
    ["/studio/account/organization/usage", "Usage page"],
    ["/studio/account/organization/api-keys", "API keys page"],
    ["/studio/account/membership-storage", "Membership storage page"],
    ["/studio/account/preferences", "Preferences page"],
  ])("loads %s in the Account shell", async (path, content) => {
    window.history.replaceState({}, "", path);
    render(<App />);
    await screen.findByText(content);
    expect(screen.getByRole("navigation", { name: "Account settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/studio/account/profile");
  });
});
