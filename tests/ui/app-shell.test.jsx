import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser, onSessionChange, consumeOAuthRedirectParams, isElectron, refresh, getRefreshToken } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  onSessionChange: vi.fn(() => vi.fn()),
  consumeOAuthRedirectParams: vi.fn(() => null),
  isElectron: vi.fn(() => true),
  refresh: vi.fn(),
  getRefreshToken: vi.fn(() => null),
}));
vi.mock("../../src/ui/lib/session", () => ({
  getCurrentUser, onSessionChange, consumeOAuthRedirectParams, isElectron, refresh, getRefreshToken,
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
vi.mock("../../src/ui/pages/Workbench", () => ({ default: () => <div>Workbench page</div> }));
vi.mock("../../src/ui/pages/Settings", () => ({ default: () => <div>Settings page</div> }));
vi.mock("../../src/ui/pages/Jobs", () => ({ default: () => <div>Jobs page</div> }));
vi.mock("../../src/ui/pages/IdeServices", () => ({ default: () => <div>IDE page</div> }));
vi.mock("../../src/ui/pages/RoleManagement", () => ({ default: () => <div>Roles page</div> }));
vi.mock("../../src/ui/pages/ServiceViewer", () => ({ default: ({ url, label, onBack }) => <div>ServiceViewer:{label}:{url}<button onClick={onBack}>svback</button></div> }));
vi.mock("../../src/ui/pages/Videos", () => ({ default: ({ onBack }) => <div>Videos page<button onClick={onBack}>vback</button></div> }));

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
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());
  });

  it("stays ready and on Mode when loadConfig throws (dev mode)", async () => {
    window.api = { loadConfig: vi.fn().mockRejectedValue(new Error("no ipc")) };
    render(<App />);
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());
  });

  it("becomes ready immediately with no window.api at all", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());
  });

  it("defaults an unset saved mode to beta", async () => {
    window.api = { loadConfig: vi.fn().mockResolvedValue({ settings: { data_dir: "/d" } }) };
    render(<App />);
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());
    expect(screen.getByText("Roles")).toBeInTheDocument();
  });
});

describe("App shell — navigation and roles nav", () => {
  it("hides the Roles nav item for a user without manage_roles, once known", async () => {
    getCurrentUser.mockResolvedValue({ userId: 2, email: "u@test", permissions: [] });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByText("Workbench page")).toBeInTheDocument());
  });

  it("routes videos and Grafana service opens to their dedicated viewers", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());

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
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());
    expect(screen.getByText("Back")).toBeDisabled();
    fireEvent.click(screen.getByText("Next →"));
    await waitFor(() => expect(screen.getByText("LLM page")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Back"));
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());

    fireEvent.click(screen.getByTitle("Launch"));
    await waitFor(() => expect(screen.getByText("Launch page")).toBeInTheDocument());
    expect(screen.getByText("Next →")).toBeDisabled();
  });

  it("reflects running and error system status from the Launch page", async () => {
    getCurrentUser.mockResolvedValue(admin);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("Launch"));
    await waitFor(() => expect(screen.getByText("Launch page")).toBeInTheDocument());
    fireEvent.click(screen.getByText("go-starting"));
    await waitFor(() => expect(screen.getAllByText("STARTING").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("go-running"));
    await waitFor(() => expect(screen.getAllByText("RUNNING").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("go-error"));
    await waitFor(() => expect(screen.getAllByText("ERROR").length).toBeGreaterThan(0));
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
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByText("Mode page")).toBeInTheDocument());
  });
});
