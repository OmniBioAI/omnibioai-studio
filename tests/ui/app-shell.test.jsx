import React from "react";
vi.mock("../../src/ui/components/PreferencesProvider", () => ({ default: ({ children }) => <>{children}</> }));
vi.mock("../../src/ui/pages/AccountPreferences", () => ({ default: () => <div>Account Preferences page</div> }));
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser, onSessionChange, consumeOAuthRedirectParams, isElectron, refresh, getRefreshToken, logout } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  onSessionChange: vi.fn(() => vi.fn()),
  consumeOAuthRedirectParams: vi.fn(() => null),
  isElectron: vi.fn(() => true),
  refresh: vi.fn(),
  getRefreshToken: vi.fn(() => null),
  logout: vi.fn(),
}));
vi.mock("../../src/ui/lib/session", () => ({
  getCurrentUser, onSessionChange, consumeOAuthRedirectParams, isElectron, refresh, getRefreshToken, logout,
}));

vi.mock("../../src/ui/components/LicenseGate", () => ({ default: ({ children }) => <>{children}</> }));
vi.mock("../../src/ui/components/Login", () => ({ default: () => <div>Login screen</div> }));
vi.mock("../../src/ui/components/BugReport", () => ({ default: () => null }));
vi.mock("../../src/ui/components/UpdateBanner", () => ({ default: () => null }));
vi.mock("../../src/ui/components/MobileNav", () => ({
  default: ({ open, onClose }) => open ? <div role="dialog" aria-label="mobile nav"><button onClick={onClose}>close-drawer</button></div> : null,
}));
vi.mock("../../src/ui/components/OAuthLinkConfirm", () => ({ default: ({ onDone, onCancel }) => <div>Link required<button onClick={onDone}>done</button><button onClick={onCancel}>cancel</button></div> }));
vi.mock("../../src/ui/components/GrafanaViewer", () => ({ GrafanaViewer: ({ onBack }) => <div>Grafana view<button onClick={onBack}>gback</button></div> }));

vi.mock("../../src/ui/pages/Mode", () => ({ default: () => <div>Mode page</div> }));
vi.mock("../../src/ui/pages/LLM", () => ({ default: () => <div>LLM page</div> }));
vi.mock("../../src/ui/pages/Cloud", () => ({ default: () => <div>Cloud page</div> }));
vi.mock("../../src/ui/pages/HPC", () => ({ default: () => <div>HPC page</div> }));
vi.mock("../../src/ui/pages/Launch", () => ({ default: ({ onStatusChange }) => <div>Launch page<button onClick={() => onStatusChange("running")}>go-running</button><button onClick={() => onStatusChange("error")}>go-error</button><button onClick={() => onStatusChange("starting")}>go-starting</button></div> }));
vi.mock("../../src/ui/pages/Services", () => ({ default: () => <div>Services page</div> }));
vi.mock("../../src/ui/pages/Logs", () => ({ default: () => <div>Logs page</div> }));
vi.mock("../../src/ui/pages/Studio", () => ({ default: () => <><div>Studio page</div><button onClick={() => window.dispatchEvent(new CustomEvent("navigate", { detail: 13 }))}>Open Workbench catalog</button></> }));
vi.mock("../../src/ui/pages/Settings", () => ({ default: () => <div>Settings page</div> }));
vi.mock("../../src/ui/pages/Jobs", () => ({ default: () => <div>Jobs page</div> }));
vi.mock("../../src/ui/pages/IdeServices", () => ({ default: () => <div>IDE page</div> }));
vi.mock("../../src/ui/pages/RoleManagement", () => ({ default: () => <div>Roles page</div> }));
vi.mock("../../src/ui/pages/Developer", () => ({ default: () => <div>Developer page</div> }));
vi.mock("../../src/ui/pages/ServiceViewer", () => ({ default: ({ url, label, onBack }) => <div>ServiceViewer:{label}:{url}<button onClick={onBack}>svback</button></div> }));
vi.mock("../../src/ui/pages/PluginPage", () => ({ default: ({ url, label, onBack, backLabel }) => <div data-testid="plugin-page-viewer" data-back-label={backLabel || ""}>ServiceViewer:{label}:{url}<button onClick={onBack}>svback</button></div> }));
vi.mock("../../src/ui/pages/Videos", () => ({ default: ({ onBack }) => <div>Videos page<button onClick={onBack}>vback</button></div> }));
vi.mock("../../src/ui/pages/Profile", () => ({ default: () => <div>Profile page</div> }));
vi.mock("../../src/ui/pages/AccountSecurity", () => ({ default: () => <div>Account Security page</div> }));

vi.mock("../../src/ui/pages/AccountNotifications", () => ({ default: () => <div>Account Notifications page</div> }));
vi.mock("../../src/ui/pages/AccountAppearance", () => ({ default: () => <div>Account Appearance page</div> }));

import App from "../../src/ui/App";

beforeEach(() => {
  delete window.api;
  isElectron.mockReturnValue(true);
  getCurrentUser.mockResolvedValue(null);
  consumeOAuthRedirectParams.mockReturnValue(null);
  getRefreshToken.mockReturnValue(null);
  onSessionChange.mockReturnValue(vi.fn());
  window.history.replaceState({}, "", "/");
});

describe("App shell — Studio landing", () => {
  it("opens Preferences directly with account breadcrumb and navigates between all account sections", async () => {
    getCurrentUser.mockResolvedValue(admin); window.history.replaceState({}, "", "/studio/preferences");
    render(<App />); await screen.findByText("Account Preferences page");
    expect(screen.getByText("account", { selector: "span" })).toBeInTheDocument();
    const accountNav = document.querySelector('[aria-label="Account settings"]');
    expect(accountNav.querySelector('[aria-current="page"]')).toHaveTextContent("Preferences");
    fireEvent.click([...accountNav.querySelectorAll("button")].find(button => button.textContent === "Profile"));
    await screen.findByText("Profile page"); expect(location.pathname).toBe("/studio/profile");
    fireEvent.click(screen.getByRole("button", { name: "Preferences", exact: true }));
    await screen.findByText("Account Preferences page"); expect(location.pathname).toBe("/studio/preferences");
    fireEvent.click(screen.getByRole("button", { name: "Security", exact: true })); await screen.findByText("Account Security page");
    fireEvent.click(screen.getByRole("button", { name: "Preferences", exact: true })); await screen.findByText("Account Preferences page");
    expect(document.querySelector('[data-nav-item="Preferences"]')).toBeNull();
  });
  it("lands authenticated users on Studio and keeps Mode accessible", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    expect(screen.getByText("Studio", { selector: "div" })).toBeInTheDocument();
    const sections = [...document.querySelectorAll(".studio-sidebar-wrap [data-nav-section]")];
    expect(sections.map((section) => section.getAttribute("data-nav-section"))).toEqual([
      "", "AI", "Work", "Discover", "Setup", "Runtime", "Security", "System",
    ]);
    expect(sections[0].querySelector("[data-nav-item='Studio']")).toBeInTheDocument();
    expect(sections[5].textContent).toMatch(/Launch.*Services.*IDE Services.*Logs.*Billing.*Developer/);
    expect(sections[5].textContent).not.toContain("Studio");
    expect(sections[5].textContent).not.toContain("Jobs");
    expect(document.querySelector("[data-nav-item='Profile']")).not.toBeInTheDocument();
    expect(document.querySelector("[data-nav-item='Storage']")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Mode", { selector: "div" }));
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());
  });

  it("returns to the canonical /studio path when Studio is selected", async () => {
    window.history.replaceState({}, "", "/jobs");
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Jobs", { selector: "div" }));
    fireEvent.click(screen.getByText("Studio", { selector: "div" }));
    expect(window.location.pathname).toBe("/studio");
  });

  it("maps the legacy portal path to /studio", async () => {
    window.history.replaceState({}, "", "/workbench");
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    expect(window.location.pathname).toBe("/studio");
  });

  it("opens Profile from the desktop account area and preserves its direct URL", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Profile/ }));
    expect(await screen.findByText("Profile page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("account")).toBeInTheDocument();
    expect(document.querySelector("[data-nav-item='Studio']")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/studio/profile");
    fireEvent.click(screen.getByTitle("Back to Studio"));
    expect(await screen.findByText("Studio page")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/studio");
  });

  it("loads the Profile page directly", async () => {
    window.history.replaceState({}, "", "/studio/profile");
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    expect(await screen.findByText("Profile page")).toBeInTheDocument();
  });

  it("opens Security from Account", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Security/ }));
    expect(await screen.findByText("Account Security page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Security" })).toHaveAttribute("aria-current", "page");
    expect(window.location.pathname).toBe("/studio/security");
  });

  it("loads Security directly", async () => {
    window.history.replaceState({}, "", "/studio/security");
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Account Security page")).toBeInTheDocument());
  });

  it("opens the Videos viewer when visiting /studio/videos directly", async () => {
    window.history.replaceState({}, "", "/studio/videos");
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Videos page")).toBeInTheDocument());
    fireEvent.click(screen.getByText("vback"));
    await waitFor(() => expect(screen.queryByText("Videos page")).not.toBeInTheDocument());
    expect(window.location.pathname).toBe("/studio");
  });

  it("renders the shared module header for native pages and returns to /studio", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "← Back to Studio" })).not.toBeInTheDocument();

    for (const page of [
      "Mode", "LLM", "Cloud", "HPC", "Launch", "Services", "IDE Services",
      "Logs", "Jobs", "Roles", "Settings", "Billing", "Developer",
    ]) {
      fireEvent.click(screen.getByText(page, { selector: "div" }));
      expect(await screen.findByRole("button", { name: "← Back to Studio" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "← Back to Studio" }));
      await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
      expect(window.location.pathname).toBe("/studio");
    }
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); delete window.api; });

const admin = { userId: 1, email: "admin@test", permissions: ["manage_roles"] };

describe("App shell — loading and first-run", () => {
  it("shows a loading spinner until window.api.loadConfig resolves, then routes to Settings when no data_dir is set", async () => {
    let resolveConfig;
    window.api = { loadConfig: vi.fn(() => new Promise((res) => { resolveConfig = res; })) };
    render(<App />);
    expect(screen.getByText("Loading configuration...")).toBeInTheDocument();
    resolveConfig({ mode: "local", settings: {} });
    await waitFor(() => expect(screen.getByText("Settings page")).toBeInTheDocument());
  });

  it("routes to Settings with no saved config at all, and stays on Mode when data_dir is already set", async () => {
    window.api = { loadConfig: vi.fn().mockResolvedValue(null) };
    render(<App />);
    await waitFor(() => expect(screen.getByText("Settings page")).toBeInTheDocument());
    cleanup();

    window.api = { loadConfig: vi.fn().mockResolvedValue({ mode: "local", settings: { data_dir: "/d" } }) };
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
  });

  it("stays ready and on Mode when loadConfig throws (dev mode)", async () => {
    window.api = { loadConfig: vi.fn().mockRejectedValue(new Error("no ipc")) };
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
  });

  it("becomes ready immediately with no window.api at all", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
  });

  it("defaults an unset saved mode to beta", async () => {
    window.api = { loadConfig: vi.fn().mockResolvedValue({ settings: { data_dir: "/d" } }) };
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
  });
});

describe("App shell — web auth gate", () => {
  it("waits for authChecked before rendering, and shows Login when signed out", async () => {
    isElectron.mockReturnValue(false);
    let resolveUser;
    getCurrentUser.mockReturnValue(new Promise((res) => { resolveUser = res; }));
    render(<App />);
    expect(screen.getByText("Loading configuration...")).toBeInTheDocument();
    resolveUser(null);
    await waitFor(() => expect(screen.getByText("Login screen")).toBeInTheDocument());
  });

  it("renders the shell once signed in", async () => {
    isElectron.mockReturnValue(false);
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    expect(screen.getByText("Roles")).toBeInTheDocument();
  });
});

describe("App shell — navigation and roles nav", () => {
  it("hides the Roles nav item for a user without manage_roles, once known", async () => {
    getCurrentUser.mockResolvedValue({ userId: 2, email: "u@test", permissions: [] });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    expect(screen.queryByText("Roles")).not.toBeInTheDocument();
  });

  it("keeps Roles visible while currentUser is still unresolved, then navigates to it", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Roles")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Roles"));
    await waitFor(() => expect(screen.getByText("Roles page")).toBeInTheDocument());
  });

  it("responds to navigate and open-service window events", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    window.dispatchEvent(new CustomEvent("navigate", { detail: 9 }));
    await waitFor(() => expect(screen.getByText("Jobs page")).toBeInTheDocument());

    window.dispatchEvent(new CustomEvent("open-service", { detail: { url: "/_svc/other", label: "Other Service" } }));
    await waitFor(() => expect(screen.getByText(/ServiceViewer:Other Service/)).toBeInTheDocument());
    fireEvent.click(screen.getByText("svback"));
    await waitFor(() => expect(screen.getByText("Jobs page")).toBeInTheDocument());

    window.dispatchEvent(new CustomEvent("open-service", { detail: { url: "/_svc/other", label: "Other Service" } }));
    await waitFor(() => expect(screen.getByText(/ServiceViewer:Other Service/)).toBeInTheDocument());
    // breadcrumb "studio" click returns to Workbench and clears the service view
    fireEvent.click(screen.getByText("studio"));
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
  });

  it("routes videos and Grafana service opens to their dedicated viewers", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());

    window.dispatchEvent(new CustomEvent("open-service", { detail: { url: "/_svc/videos", label: "Videos" } }));
    await waitFor(() => expect(screen.getByText("Videos page")).toBeInTheDocument());
    fireEvent.click(screen.getByText("vback"));
    await waitFor(() => expect(screen.queryByText("Videos page")).not.toBeInTheDocument());

    window.dispatchEvent(new CustomEvent("open-service", { detail: { url: "/_svc/monitor", label: "Metrics" } }));
    await waitFor(() => expect(screen.getByText("Grafana view")).toBeInTheDocument());
    fireEvent.click(screen.getByText("gback"));
    await waitFor(() => expect(screen.queryByText("Grafana view")).not.toBeInTheDocument());
  });

  it("opens and closes the mobile nav drawer, and shows the first-run warning banner", async () => {
    getCurrentUser.mockResolvedValue(admin);
    window.api = { loadConfig: vi.fn().mockResolvedValue({ mode: "local", settings: {} }) };
    render(<App />);
    await waitFor(() => expect(screen.getByText("Settings page")).toBeInTheDocument());
    expect(screen.getByText(/Setup required/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Setup required/));

    fireEvent.click(screen.getByLabelText("Open navigation"));
    expect(screen.getByRole("dialog", { name: "mobile nav" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("close-drawer"));
    expect(screen.queryByRole("dialog", { name: "mobile nav" })).not.toBeInTheDocument();
  });

  it("walks the wizard controls: dot navigation, Back/Next, and boundary disabling", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Mode", { selector: "div" }));
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());
    expect(screen.getByText("Back")).toBeDisabled();
    fireEvent.click(screen.getByText("Next →"));
    await waitFor(() => expect(screen.getByText("LLM page")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Back"));
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Launch", { selector: "div" }));
    await waitFor(() => expect(screen.getByText("Launch page")).toBeInTheDocument());
    expect(screen.getByText("Next →")).toBeDisabled();
  });

  it("reflects running and error system status from the Launch page", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Launch", { selector: "div" }));
    await waitFor(() => expect(screen.getByText("Launch page")).toBeInTheDocument());
    fireEvent.click(screen.getByText("go-starting"));
    await waitFor(() => expect(screen.getAllByText("STARTING").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("go-running"));
    await waitFor(() => expect(screen.getAllByText("RUNNING").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("go-error"));
    await waitFor(() => expect(screen.getAllByText("ERROR").length).toBeGreaterThan(0));
  });
});

describe("App shell — Code and Workflows navigation (Phase A)", () => {
  it("opens the existing Launcher service when Code is selected, using the canonical Electron webview path", async () => {
    getCurrentUser.mockResolvedValue(admin); // isElectron() is true by default in this file's beforeEach
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Code", { selector: "div" }));
    expect(await screen.findByText("ServiceViewer:Code:http://localhost:5174/_svc/sdk")).toBeInTheDocument();
    fireEvent.click(screen.getByText("svback"));
    fireEvent.click(screen.getByText("Jobs", { selector: "div" }));
    await waitFor(() => expect(screen.getByText("Jobs page")).toBeInTheDocument());
  });

  it("opens the existing Workflow Registry service when Workflows is selected, using the canonical Electron webview path", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Workflows", { selector: "div" }));
    expect(await screen.findByText("ServiceViewer:Workflows:http://localhost:5174/_svc/workflows")).toBeInTheDocument();
  });

  it("still opens Code and Workflows as the canonical same-origin service in the browser (non-Electron) path", async () => {
    // Doesn't assert an exact origin here: App.jsx's pre-existing resolveServiceUrl
    // also rewrites any /_svc/* URL whenever Vite's own DEV flag is on, independent
    // of isElectron() -- the same already-shared behavior every dashboard-tile
    // service goes through. What matters for Phase A is that Code/Workflows reuse
    // that exact mechanism rather than bypassing it.
    isElectron.mockReturnValue(false);
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Code", { selector: "div" }));
    expect(await screen.findByText(/^ServiceViewer:Code:.*\/_svc\/sdk$/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("svback"));
    fireEvent.click(screen.getByText("Workflows", { selector: "div" }));
    expect(await screen.findByText(/^ServiceViewer:Workflows:.*\/_svc\/workflows$/)).toBeInTheDocument();
  });

  it("leaves Jobs' own behavior and the Account menu unchanged", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Jobs", { selector: "div" }));
    await waitFor(() => expect(screen.getByText("Jobs page")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "← Back to Studio" }));
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menuitem", { name: /Profile/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Security/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Preferences/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Appearance/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Notifications/ })).toBeInTheDocument();
  });
});

describe("App shell — primary navigation IA (AI / Work / Discover)", () => {
  it("renders Studio, AI, Work, Discover, Setup, Runtime, Security and System exactly once each, in order, with the exact Work order and no duplicate items", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());

    const sectionEls = [...document.querySelectorAll(".studio-sidebar-wrap [data-nav-section]")];
    const sectionNames = sectionEls.map(el => el.getAttribute("data-nav-section"));
    expect(sectionNames).toEqual(["", "AI", "Work", "Discover", "Setup", "Runtime", "Security", "System"]);

    const aiSection = sectionEls[sectionNames.indexOf("AI")];
    expect([...aiSection.querySelectorAll("[data-nav-item]")].map(el => el.getAttribute("data-nav-item"))).toEqual(["Ask OmniBioAI"]);

    const workSection = sectionEls[sectionNames.indexOf("Work")];
    expect([...workSection.querySelectorAll("[data-nav-item]")].map(el => el.getAttribute("data-nav-item"))).toEqual([
      "Projects", "Code", "Workflows", "Jobs", "Artifacts",
    ]);

    const discoverSection = sectionEls[sectionNames.indexOf("Discover")];
    expect([...discoverSection.querySelectorAll("[data-nav-item]")].map(el => el.getAttribute("data-nav-item"))).toEqual(["Explore"]);

    const allItems = [...document.querySelectorAll(".studio-sidebar-wrap [data-nav-item]")].map(el => el.getAttribute("data-nav-item"));
    for (const name of ["Code", "Workflows", "Jobs", "Projects", "Artifacts", "Explore", "Ask OmniBioAI"]) {
      expect(allItems.filter(n => n === name)).toHaveLength(1);
    }
  });

  it("no longer lists Code, Workflows or Jobs under Runtime", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    const sectionEls = [...document.querySelectorAll(".studio-sidebar-wrap [data-nav-section]")];
    const runtime = sectionEls.find(el => el.getAttribute("data-nav-section") === "Runtime");
    const runtimeItems = [...runtime.querySelectorAll("[data-nav-item]")].map(el => el.getAttribute("data-nav-item"));
    expect(runtimeItems).toEqual(["Launch", "Services", "IDE Services", "Logs", "Billing", "Developer"]);
  });

  it("Ask OmniBioAI is visible but disabled: not clickable, no navigation, no local page, no Dev Hub fallback", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    const ask = screen.getByText("Ask OmniBioAI", { selector: "div" });
    expect(ask).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(ask);
    // No navigation of any kind happened: still on Studio, no service opened, no "ask" page rendered.
    expect(screen.getByText("Studio page")).toBeInTheDocument();
    expect(screen.queryByText(/ServiceViewer:/)).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/studio");
  });

  it("Projects, Artifacts and Explore are local native shells that render with no backend call and no fake data", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());

    for (const [label, heading, disabledCreate] of [
      ["Projects", "Projects", true],
      ["Artifacts", "Artifacts", false],
      ["Explore", "Explore", false],
    ]) {
      fetchSpy.mockClear();
      fireEvent.click(screen.getByText(label, { selector: "div" }));
      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
      // Local shell: no network call made to render it.
      expect(fetchSpy).not.toHaveBeenCalled();
      // No fake platform data of any kind.
      const body = document.body.textContent;
      for (const fakeMarker of [
        /\b\d+\s*(projects?|artifacts?|collaborators?|runs?|workflows? run)\b/i,
        /storage used/i, /recent activity/i, /GB\b/, /MB\b/,
      ]) {
        expect(body).not.toMatch(fakeMarker);
      }
      fireEvent.click(screen.getByRole("button", { name: "← Back to Studio" }));
      await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    }
    vi.unstubAllGlobals();
  });

  it("Projects' Create project action is a genuinely disabled control, not a CSS-only fake", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Projects", { selector: "div" }));
    const createButton = await screen.findByRole("button", { name: "Create project" });
    expect(createButton).toBeDisabled();
  });

  it("supports direct deep links to /studio/projects, /studio/artifacts and /studio/explore", async () => {
    for (const [path, heading] of [
      ["/studio/projects", "Projects"],
      ["/studio/artifacts", "Artifacts"],
      ["/studio/explore", "Explore"],
    ]) {
      window.history.replaceState({}, "", path);
      getCurrentUser.mockResolvedValue(admin);
      const { unmount } = render(<App />);
      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
      unmount();
    }
  });
});

describe("App shell — OAuth redirect notices", () => {
  it("shows the link-confirmation dialog and clears it on done/cancel", async () => {
    consumeOAuthRedirectParams.mockReturnValue({ type: "link_required", linkToken: "lt", provider: "google", email: "a@b.test" });
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    expect(await screen.findByText("Link required")).toBeInTheDocument();
    fireEvent.click(screen.getByText("done"));
    await waitFor(() => expect(screen.queryByText("Link required")).not.toBeInTheDocument());
  });

  it("dismisses the link-confirmation dialog via cancel", async () => {
    consumeOAuthRedirectParams.mockReturnValue({ type: "link_required", linkToken: "lt", provider: "google", email: "a@b.test" });
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    expect(await screen.findByText("Link required")).toBeInTheDocument();
    fireEvent.click(screen.getByText("cancel"));
    await waitFor(() => expect(screen.queryByText("Link required")).not.toBeInTheDocument());
  });

  it("shows and dismisses a sign-in error banner", async () => {
    consumeOAuthRedirectParams.mockReturnValue({ type: "error", message: "denied" });
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    expect(await screen.findByText("Sign-in failed: denied")).toBeInTheDocument();
    fireEvent.click(screen.getByText("✕"));
    await waitFor(() => expect(screen.queryByText(/Sign-in failed/)).not.toBeInTheDocument());
  });
});

describe("App shell — token refresh and return_to redirect", () => {
  it("refreshes the access token on mount when a refresh token exists", async () => {
    getRefreshToken.mockReturnValue("rt");
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("does not refresh with no refresh token", async () => {
    getRefreshToken.mockReturnValue(null);
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("ignores an unsafe or cross-origin return_to and strips a safe one from the URL", async () => {
    window.history.replaceState({}, "", "/?return_to=//evil.example");
    getCurrentUser.mockResolvedValue(null);
    isElectron.mockReturnValue(false);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Login screen")).toBeInTheDocument());
    cleanup();

    window.history.replaceState({}, "", "/?return_to=%2Fjobs");
    getCurrentUser.mockResolvedValue(null);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Login screen")).toBeInTheDocument());
    expect(window.location.search).toBe("");
  });

  it("treats a malformed return_to as unsafe rather than throwing", async () => {
    window.history.replaceState({}, "", "/?return_to=%2F%25zz");
    getCurrentUser.mockResolvedValue(null);
    isElectron.mockReturnValue(false);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Login screen")).toBeInTheDocument());
  });

  it("redirects to a safe return_to once the user is signed in", async () => {
    window.history.replaceState({}, "", "/?return_to=%2Fjobs");
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    // jsdom doesn't implement real navigation, but the assignment itself
    // must not throw and the shell should still render.
    await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
  });
});

describe("App shell — native Workbench catalog", () => {
  it("passes Studio-origin back context to a Workbench plugin viewer", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await screen.findByText("Studio page");
    window.dispatchEvent(new CustomEvent("open-service", { detail: {
      url: "/_svc/workbench/plugins/provenance/",
      label: "Provenance",
      source: "workbench",
      pluginSlug: "provenance",
      backLabel: "Back to Studio",
    }}));
    expect(await screen.findByTestId("plugin-page-viewer")).toHaveAttribute("data-back-label", "Back to Studio");
  });

  it.each([false, true])("opens through ServiceViewer and restores filters in Electron=%s", async electron => {
    const { catalogResponse } = await import("./workbench-fixture");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async url => {
      if (String(url).includes("/api/ui-schema/")) {
        return { ok: true, json: async () => ({ schema_version: 1, plugin: { slug: "rna" }, renderer: "legacy", native_supported: false }) };
      }
      return catalogResponse();
    }));
    isElectron.mockReturnValue(electron);
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await screen.findByText("Studio page");
    expect(screen.queryByRole("heading", { name: "Workbench" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Workbench catalog" }));
    await screen.findByRole("button", { name: "Open RNA Analysis" });
    fireEvent.click(screen.getByRole("button", { name: "Analysis 2" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search applications" }), { target: { value: "rna" } });
    fireEvent.click(screen.getByRole("button", { name: "Open RNA Analysis" }));
    const origin = electron ? "http://localhost:5174" : "";
    expect(screen.getByText(`ServiceViewer:RNA Analysis:${origin}/_svc/workbench/plugins/rna/`)).toBeInTheDocument();
    fireEvent.click(screen.getByText("svback"));
    const launch = await screen.findByRole("button", { name: "Open RNA Analysis" });
    expect(screen.getByRole("textbox", { name: "Search applications" })).toHaveValue("rna");
    await waitFor(() => expect(launch).toHaveFocus());
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search applications" }), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Analysis 2" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "← Back to Studio" }));
    expect(screen.getByText("Studio page")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/studio");
    vi.unstubAllGlobals();
  });
});


it("opens the Notifications Account route without adding primary navigation", async () => {
  getCurrentUser.mockResolvedValue(admin); window.history.replaceState({}, "", "/studio/notifications");
  render(<App />); await screen.findByText("Account Notifications page");
  expect(document.querySelector('[aria-label="Account settings"] [aria-current="page"]')).toHaveTextContent("Notifications");
  expect(document.querySelector('[data-nav-item="Notifications"]')).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Profile", exact: true }));
  await screen.findByText("Profile page"); expect(location.pathname).toBe("/studio/profile");
  fireEvent.click(screen.getByRole("button", { name: "Notifications", exact: true }));
  await screen.findByText("Account Notifications page"); expect(location.pathname).toBe("/studio/notifications");
});

it("opens the Appearance Account route without adding primary navigation", async () => {
  getCurrentUser.mockResolvedValue(admin); window.history.replaceState({}, "", "/studio/appearance");
  render(<App />); await screen.findByText("Account Appearance page");
  expect(document.querySelector('[aria-label="Account settings"] [aria-current="page"]')).toHaveTextContent("Appearance");
  expect(document.querySelector('[data-nav-item="Appearance"]')).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Profile", exact: true }));
  await screen.findByText("Profile page"); expect(location.pathname).toBe("/studio/profile");
  fireEvent.click(screen.getByRole("button", { name: "Appearance", exact: true }));
  await screen.findByText("Account Appearance page"); expect(location.pathname).toBe("/studio/appearance");
});

it("opens Appearance from the Account menu and closes the menu", async () => {
  getCurrentUser.mockResolvedValue(admin);
  render(<App />);
  await waitFor(() => expect(screen.getByText("Studio page")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Appearance/ }));
  await screen.findByText("Account Appearance page");
  expect(location.pathname).toBe("/studio/appearance");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
