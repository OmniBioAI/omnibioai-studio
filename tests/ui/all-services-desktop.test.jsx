import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Desktop (Electron) wiring of the admin cards: App is rendered with
// isElectron() true and the real All services page, and each card's result is
// compared with what App does for the flat list's `open-service` event on main.
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
vi.mock("../../src/ui/components/GrafanaViewer", () => ({ GrafanaViewer: ({ label }) => <div data-testid="grafana-viewer">{label}</div> }));

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

vi.mock("../../src/ui/lib/useStorageUsage", () => ({ useStorageUsage: () => ({ status: "loading", data: null, error: "" }) }));
vi.mock("../../src/ui/lib/billingApi", async importOriginal => ({ ...(await importOriginal()), getSubscription: vi.fn(() => new Promise(() => {})) }));
vi.mock("../../src/ui/lib/serviceHealth", async importOriginal => ({ ...(await importOriginal()), refreshServiceHealth: vi.fn(() => new Promise(() => {})) }));

import App from "../../src/ui/App";
import { adminRouteForIndex } from "../../src/ui/lib/adminRoutes";

const ADMIN_CARDS = [["Control center", -11], ["Platform health", -12], ["Metrics", -13], ["Neo4j browser", -15], ["Tool images", -14]];

// What the desktop shows: the embedded webview's src, or the Grafana viewer.
async function openedSurface() {
  await waitFor(() => expect(document.querySelector("webview") || screen.queryByTestId("grafana-viewer")).toBeTruthy());
  const grafana = screen.queryByTestId("grafana-viewer");
  return grafana ? { grafana: grafana.textContent } : { webview: document.querySelector("webview").getAttribute("src") };
}

async function clickCard(title) {
  window.history.replaceState({}, "", "/studio/services");
  const view = render(<App />);
  const link = await screen.findByRole("link", { name: new RegExp(`^${title}`) });
  act(() => { link.click(); });
  const surface = await openedSurface();
  view.unmount();
  return surface;
}

async function mainOpenService(idx) {
  const route = adminRouteForIndex(idx);
  window.history.replaceState({}, "", "/studio/services");
  const view = render(<App />);
  await screen.findByRole("heading", { level: 1, name: "All services" });
  act(() => { window.dispatchEvent(new CustomEvent("open-service", { detail: { url: route.oldUrl, label: route.name } })); });
  const surface = await openedSurface();
  view.unmount();
  return surface;
}

const THEMED = "obai_theme=light&obai_accent=purple&obai_density=compact&obai_motion=reduce";

beforeEach(() => {
  cleanup();
  session.user = { userId: 1, email: "ops@example.org", orgId: 1, permissions: ["platform.manage_infra", "manage_config"] };
  session.identity = { organizations: [{ organization_id: 1, organization_name: "Genome Lab" }] };
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("All services admin cards on desktop", () => {
  it.each(ADMIN_CARDS)("%s opens main's URL in a packaged desktop build", async (title, idx) => {
    vi.stubEnv("DEV", false);
    const opened = await clickCard(title);
    expect(opened).toEqual(await mainOpenService(idx));
    const origin = window.location.origin;
    expect(opened).toEqual({
      "Control center": { webview: `${origin}/_svc/control/?${THEMED}` },
      "Platform health": { webview: `https://control.omnibioai.org/?${THEMED}` },
      Metrics: { grafana: "Metrics" },
      "Neo4j browser": { webview: `${origin}/neo4j/browser/?${THEMED}` },
      "Tool images": { webview: `${origin}/_svc/toolimages?${THEMED}` },
    }[title]);
  });

  it.each(ADMIN_CARDS)("%s opens main's URL in the desktop dev build", async (title, idx) => {
    vi.stubEnv("DEV", true);
    const opened = await clickCard(title);
    expect(opened).toEqual(await mainOpenService(idx));
    expect(opened).toEqual({
      "Control center": { webview: `http://localhost:5174/_svc/control/?${THEMED}` },
      "Platform health": { webview: `https://control.omnibioai.org/?${THEMED}` },
      Metrics: { grafana: "Metrics" },
      "Neo4j browser": { webview: `${window.location.origin}/neo4j/browser/?${THEMED}` },
      "Tool images": { webview: `http://localhost:5174/_svc/toolimages?${THEMED}` },
    }[title]);
  });
});
