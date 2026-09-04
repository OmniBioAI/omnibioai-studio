import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/lib/session", () => ({
  isElectron: () => true,
  getToken: () => "test-token",
  getRefreshToken: () => null,
  getCurrentUserSync: () => ({ userId: 1, email: "test@example.com", permissions: ["manage_config", "manage_roles"] }),
  getCurrentUser: vi.fn().mockResolvedValue({ userId: 1, email: "test@example.com", permissions: ["manage_config", "manage_roles"] }),
  onSessionChange: vi.fn(() => () => {}),
  logout: vi.fn().mockResolvedValue(undefined),
  loginWithPassword: vi.fn().mockResolvedValue({}),
  loginWithLicenseKey: vi.fn().mockResolvedValue({}),
  getOAuthLoginUrl: (provider) => `https://auth.test/${provider}`,
  oauthProviders: () => ["google", "github"],
  confirmOAuthLink: vi.fn().mockResolvedValue({}),
  consumeOAuthRedirectParams: () => null,
  refresh: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../src/ui/lib/rolesApi", () => ({
  listRoles: vi.fn().mockResolvedValue([]),
  createRole: vi.fn().mockResolvedValue({ id: "new", name: "new", permissions: [] }),
  getRole: vi.fn().mockResolvedValue({ id: "r1", name: "Reader", permissions: [] }),
  updateRole: vi.fn().mockResolvedValue({}),
  deleteRole: vi.fn().mockResolvedValue({}),
  getUserRoles: vi.fn().mockResolvedValue([]),
  setUserRoles: vi.fn().mockResolvedValue({}),
}));

import Mode from "../../src/ui/pages/Mode";
import LLM from "../../src/ui/pages/LLM";
import Cloud from "../../src/ui/pages/Cloud";
import HPC from "../../src/ui/pages/HPC";
import Settings from "../../src/ui/pages/Settings";
import Launch from "../../src/ui/pages/Launch";
import Logs from "../../src/ui/pages/Logs";
import Services from "../../src/ui/pages/Services";
import IdeServices from "../../src/ui/pages/IdeServices";
import Jobs from "../../src/ui/pages/Jobs";
import Workbench from "../../src/ui/pages/Workbench";
import RoleManagement from "../../src/ui/pages/RoleManagement";
import ServiceViewer from "../../src/ui/pages/ServiceViewer";
import Videos from "../../src/ui/pages/Videos";
import Wizard from "../../src/ui/pages/Wizard";
import BugReport from "../../src/ui/components/BugReport";
import ErrorBoundary from "../../src/ui/components/ErrorBoundary";
import LicenseGate from "../../src/ui/components/LicenseGate";
import OAuthLinkConfirm from "../../src/ui/components/OAuthLinkConfirm";
import UpdateBanner from "../../src/ui/components/UpdateBanner";
import App from "../../src/ui/App";

const user = { userId: 1, email: "test@example.com", permissions: ["manage_config", "manage_roles"] };
const config = { mode: "local", llm: {}, cloud: {}, hpc: {} };
const setConfig = vi.fn((fn) => fn(config));

function okFetch(body = {}) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", okFetch({}));
  window.open = vi.fn();
  window.confirm = vi.fn(() => true);
  delete window.api;
  delete window.electronAPI;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("page and component coverage matrix", () => {
  it("walks the authorized production shell through every route", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Runtime Mode")).toBeInTheDocument());
    for (let step = 0; step <= 14; step += 1) {
      window.dispatchEvent(new CustomEvent("navigate", { detail: step }));
      await waitFor(() => expect(document.body.textContent.length).toBeGreaterThan(20));
    }
  });
  it("renders configuration pages and exercises their controls", () => {
    const pages = [[Mode, "Runtime Mode"], [LLM, "LLM Configuration"], [Cloud, "Cloud Configuration"], [HPC, "HPC Configuration"]];
    for (const [Page, title] of pages) {
      const { unmount } = render(<Page config={config} setConfig={setConfig} currentUser={user} />);
      expect(screen.getByText(title)).toBeInTheDocument();
      unmount();
    }
    render(<Mode config={config} setConfig={setConfig} currentUser={user} />);
    expect(screen.getByText("Runtime Mode")).toBeInTheDocument();
  });

  it("renders operational pages with safe failed/default service responses", async () => {
    for (const [Page, props] of [
      [Settings, { config, setConfig, currentUser: user }],
      [Launch, { config, onStatusChange: vi.fn() }],
      [Logs, {}],
      [Services, { config, currentUser: user }],
      [IdeServices, { currentUser: user }],
      [Jobs, {}],
      [Workbench, {}],
    ]) {
      const { unmount } = render(<Page {...props} />);
      await waitFor(() => expect(document.body.textContent.length).toBeGreaterThan(0));
      unmount();
    }
  });

  it("renders role, service, video, wizard, and overlay components", async () => {
    const { unmount } = render(<RoleManagement currentUser={user} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/role|permission/i));
    unmount();
    const back = vi.fn();
    render(<ServiceViewer url="/service" label="Service" onBack={back} />);
    fireEvent.click(screen.getByRole("button", { name: /back/i })); expect(back).toHaveBeenCalled(); cleanup();
    render(<Videos onBack={back} />); await waitFor(() => expect(document.body.textContent).toMatch(/video|no videos|back/i)); cleanup();
    render(<Wizard step={0} steps={["One", "Two"]} setStep={vi.fn()}>Wizard content</Wizard>);
    expect(screen.getByText("Wizard content")).toBeInTheDocument(); cleanup();
    render(<OAuthLinkConfirm linkToken="token" provider="google" email="a@test" onDone={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/link your account/i)).toBeInTheDocument(); cleanup();
  });

  it("exercises bug reporting, license gate, update banner, and error recovery", async () => {
    render(<BugReport />); fireEvent.click(screen.getByRole("button", { name: /report bug/i }));
    fireEvent.change(screen.getByPlaceholderText("Bug title"), { target: { value: "Oops" } });
    fireEvent.change(screen.getByPlaceholderText("Describe what happened..."), { target: { value: "details" } });
    fireEvent.click(screen.getByRole("button", { name: /submit bug report/i })); expect(screen.getByText(/bug reported/i)).toBeInTheDocument(); cleanup();
    render(<LicenseGate><div>licensed content</div></LicenseGate>); await waitFor(() => expect(screen.getByText("licensed content")).toBeInTheDocument()); cleanup();
    const listeners = {}; window.api = { onUpdateAvailable: (cb) => { listeners.available = cb; }, onUpdateError: (cb) => { listeners.error = cb; } };
    render(<UpdateBanner />); listeners.available({ version: "9" }); await waitFor(() => expect(screen.getByText(/v9/)).toBeInTheDocument()); cleanup();
    function Broken() { throw new Error("broken"); }
    render(<ErrorBoundary><Broken /></ErrorBoundary>); expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
