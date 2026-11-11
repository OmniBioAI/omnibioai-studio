import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null, identity: { organizations: [] }, crashJobs: false }));
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
vi.mock("../../src/ui/components/AppearanceProvider", () => ({
  default: ({ children }) => <>{children}</>,
  useAppearance: () => ({ resolvedTheme: "light", accent: "purple", density: "compact", resolvedMotion: "reduce" }),
}));
vi.mock("../../src/ui/components/BugReport", () => ({ default: () => null }));
vi.mock("../../src/ui/components/UpdateBanner", () => ({ default: () => null }));
vi.mock("../../src/ui/components/MobileNav", () => ({ default: () => null }));
vi.mock("../../src/ui/components/Login", () => ({ default: () => <div>Login</div> }));
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
vi.mock("../../src/ui/pages/Home", () => ({ default: () => <div>Studio page</div> }));
vi.mock("../../src/ui/pages/Tools", () => ({ default: () => <div>Tools page</div> }));
vi.mock("../../src/ui/pages/DataHub", () => ({ default: () => <div>Data page</div> }));
vi.mock("../../src/ui/pages/SettingsHub", () => ({ default: () => <div>Settings hub page</div> }));
vi.mock("../../src/ui/pages/AllServices", () => ({ default: () => <div>All services page</div> }));
vi.mock("../../src/ui/pages/Settings", () => ({ default: () => <div>Settings page</div> }));
vi.mock("../../src/ui/pages/Jobs", () => ({ default: () => { if (session.crashJobs) throw new Error("private crash detail"); return <div>Jobs page</div>; } }));
vi.mock("../../src/ui/pages/RoleManagement", () => ({ default: () => <div>Members &amp; roles page</div> }));
vi.mock("../../src/ui/pages/Billing", () => ({ default: ({ view }) => <div>{view === "usage" ? "Usage page" : "Billing page"}</div> }));
vi.mock("../../src/ui/pages/Workbench", () => ({ default: ({ view }) => <div>{view === "agentic" ? "Agentic catalog page" : view === "omics" ? "Omics & Analysis catalog page" : ["plugins", "plugins-integrations", "integrations"].includes(view) ? "Plugins catalog page" : "Workbench page"}</div> }));
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

import App, {
  LEGACY_ACCOUNT_REDIRECTS,
  pluginSlugFromStudioPath,
  resolveInitialPage,
  studioPluginPath,
} from "../../src/ui/App";

const admin = { userId: 1, email: "alex@example.org", orgId: 1, permissions: ["manage_roles", "manage_config", "manage_org"] };

beforeEach(() => {
  cleanup();
  session.user = admin;
  session.identity = { organizations: [{ organization_id: 1, organization_name: "Genome Lab" }] };
  session.crashJobs = false;
  window.history.replaceState({}, "", "/studio");
});
afterEach(cleanup);

describe("Account route migration", () => {
  it("requires an identity login in Electron after the license gate", async () => {
    session.user = null;
    render(<App />);
    expect(await screen.findByText("Login")).toBeInTheDocument();
    expect(screen.queryByText("Studio page")).not.toBeInTheDocument();
  });

  it("shows the shared Studio version in the header and preserves the BETA badge", async () => {
    render(<App />);
    await screen.findByText("Studio page");
    expect(screen.getAllByText("v0.8.2")).toHaveLength(2);
    expect(screen.getByText("BETA")).toBeInTheDocument();
  });

  it("accepts only canonical bookmarkable plugin routes", () => {
    expect(pluginSlugFromStudioPath("/studio/plugins/deseq2_analysis")).toBe("deseq2_analysis");
    expect(pluginSlugFromStudioPath("/studio/plugins/deseq2_analysis/")).toBe("deseq2_analysis");
    expect(pluginSlugFromStudioPath("/studio/plugins/../auth")).toBeNull();
    expect(pluginSlugFromStudioPath("/studio/plugins/BadSlug")).toBeNull();
    expect(studioPluginPath("alpha_diversity")).toBe("/studio/plugins/alpha_diversity");
    expect(() => studioPluginPath("../auth")).toThrow("Invalid plugin slug");
  });

  it("opens plugin deep links on the Workbench page", () => {
    window.history.replaceState({}, "", "/studio/plugins/alpha_diversity");
    expect(resolveInitialPage()).toBe(13);
  });

  it.each([
    ["/studio/plugins", 34], ["/studio/agentic", 35], ["/studio/omics-analysis", 36],
  ])("resolves Discover catalog route %s", (path, page) => {
    window.history.replaceState({}, "", path);
    expect(resolveInitialPage()).toBe(page);
  });

  it("exposes the approved Discover destinations as native pages", async () => {
    render(<App />);
    await screen.findByText("Studio page");
    const discover = document.querySelector('[data-nav-section="DISCOVER"]');
    expect([...discover.querySelectorAll("[data-nav-item]")].map(item => item.textContent.trim())).toEqual([
      "Explore", "Plugins and integrations", "Omics and analysis", "Agentic",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Plugins and integrations" }));
    await screen.findByText("Plugins catalog page");
    expect(window.location.pathname).toBe("/studio/plugins");
    fireEvent.click(screen.getByRole("button", { name: "Agentic" }));
    await screen.findByText("Agentic catalog page");
    expect(window.location.pathname).toBe("/studio/agentic");
    fireEvent.click(screen.getByRole("button", { name: "Omics and analysis" }));
    await screen.findByText("Omics & Analysis catalog page");
    expect(window.location.pathname).toBe("/studio/omics-analysis");
  });

  it("opens All services from the pinned sidebar area at /studio/services and marks it active", async () => {
    session.user = { userId: 2, email: "member@example.org", orgId: 1, permissions: [] };
    render(<App />);
    await screen.findByText("Studio page");
    const item = screen.getByRole("button", { name: "All services" });
    fireEvent.click(item);
    await screen.findByText("All services page");
    expect(window.location.pathname).toBe("/studio/services");
    expect(item).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["Ask OmniBioAI", "/_svc/devhub", "chat"],
    ["Code", "/_svc/sdk", null],
    ["Workflows", "/_svc/workflows", null],
  ])("routes the %s nav entry into the themed embedded-app viewer", async (label, pathname, view) => {
    render(<App />);
    await screen.findByText("Studio page");
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(document.querySelector("webview")).toBeTruthy());
    const webview = document.querySelector("webview");
    const embedded = new URL(webview.getAttribute("src"));
    expect(embedded.pathname).toBe(pathname);
    if (view) expect(embedded.searchParams.get("view")).toBe(view);
    for (const [key, value] of Object.entries({ theme: "light", accent: "purple", density: "compact", motion: "reduce" })) {
      expect(embedded.searchParams.get(`obai_${key}`)).toBe(value);
    }
  });

  it("routes Studio open-service events through the same themed viewer for Lit AI", async () => {
    render(<App />);
    await screen.findByText("Studio page");
    act(() => window.dispatchEvent(new CustomEvent("open-service", { detail: { url: "/_svc/rag/", label: "RAG / Lit AI" } })));
    await waitFor(() => expect(document.querySelector("webview")).toBeTruthy());
    const webview = document.querySelector("webview");
    const embedded = new URL(webview.getAttribute("src"));
    expect(embedded.pathname).toBe("/_svc/rag/");
    for (const key of ["theme", "accent", "density", "motion"]) {
      expect(embedded.searchParams.has(`obai_${key}`)).toBe(true);
    }
  });

  it("keeps the shell usable when a route crashes", async () => {
    session.crashJobs = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App />);
    await screen.findByText("Studio page");
    fireEvent.click(screen.getByRole("button", { name: "Jobs" }));
    expect(await screen.findByText("Something went wrong on this page")).toBeInTheDocument();
    expect(screen.queryByText("private crash detail")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Platform Health/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to Studio" }));
    expect(await screen.findByText("Studio page")).toBeInTheDocument();
  });
  it("redirects legacy URLs while preserving query strings", () => {
    for (const [legacy, destination] of Object.entries(LEGACY_ACCOUNT_REDIRECTS)) {
      window.history.replaceState({}, "", `${legacy}?checkout=success&organization_id=7`);
      resolveInitialPage();
      expect(window.location.pathname).toBe(new URL(destination, window.location.origin).pathname);
      const actual = new URL(window.location.href);
      expect(actual.searchParams.get("checkout")).toBe("success");
      expect(actual.searchParams.get("organization_id")).toBe("7");
    }
  });

  it("keeps admin navigation collapsed and opens Account from the footer button", async () => {
    render(<App />);
    await screen.findByText("Studio page");
    const adminSection = document.querySelector('[data-nav-section="ADMIN"]');
    expect(adminSection).toBeInTheDocument();
    expect(within(adminSection).getByRole("button", { name: /ADMIN/ })).toHaveAttribute("aria-expanded", "false");
    expect(adminSection.querySelector("[data-nav-item]")).toBeNull();
    expect(screen.queryByText("Billing", { selector: "[data-nav-item]" })).not.toBeInTheDocument();
    expect(screen.queryByText("Developer", { selector: "[data-nav-item]" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Account" }));
    await screen.findByText("Profile page");
    expect(window.location.pathname).toBe("/studio/account/profile");
  });

  it("hides and blocks Launch and Logs without manage_config", async () => {
    session.user = { ...admin, permissions: [] };
    render(<App />);
    await screen.findByText("Studio page");
    expect(document.querySelector('[data-nav-section="ADMIN"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Launch" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Logs" })).not.toBeInTheDocument();

    act(() => window.dispatchEvent(new CustomEvent("navigate", { detail: 4 })));
    expect(await screen.findByText("Studio page")).toBeInTheDocument();
    expect(screen.queryByText("Launch page")).not.toBeInTheDocument();
  });

  it("shows Launch and Logs with manage_config", async () => {
    session.user = { ...admin, permissions: ["manage_config"] };
    render(<App />);
    await screen.findByText("Studio page");
    fireEvent.click(screen.getByRole("button", { name: /ADMIN/ }));
    fireEvent.click(screen.getByRole("button", { name: "Launch" }));
    expect(await screen.findByText("Launch page")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Logs" }));
    expect(await screen.findByText("Logs page")).toBeInTheDocument();
  });

  it("hides and blocks Organization Connections without organization administration", async () => {
    session.user = { ...admin, permissions: [] };
    window.history.replaceState({}, "", "/studio/organization/connections");
    render(<App />);
    await screen.findByText("Studio page");
    expect(window.location.pathname).toBe("/studio");
    expect(document.querySelector('[data-nav-section="Organization"]')).toBeNull();
    expect(screen.queryByText("Connections page")).not.toBeInTheDocument();
  });

  it.each(["manage_org", "manage_all_orgs"])("shows Organization Connections with %s", async permission => {
    session.user = { ...admin, permissions: [permission] };
    window.history.replaceState({}, "", "/studio/organization/connections");
    render(<App />);
    expect(await screen.findByText("Connections page")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/studio/admin/organization/connections");
    fireEvent.click(screen.getByRole("button", { name: /ADMIN/ }));
    expect(screen.getByRole("button", { name: "Connections" })).toBeInTheDocument();
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
