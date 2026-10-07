import React from "react";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isElectron, getCurrentUserSync, getCurrentUser, onSessionChange } = vi.hoisted(() => ({
  isElectron: vi.fn(() => false),
  getCurrentUserSync: vi.fn(() => null),
  getCurrentUser: vi.fn().mockResolvedValue(null),
  onSessionChange: vi.fn(() => vi.fn()),
}));
vi.mock("../../src/ui/lib/session", () => ({ isElectron, getCurrentUserSync, getCurrentUser, onSessionChange }));

import Studio from "../../src/ui/pages/Studio";

function usePermissions(permissions) {
  const user = { permissions };
  getCurrentUserSync.mockReturnValue(user);
  getCurrentUser.mockResolvedValue(user);
}

beforeEach(() => {
  isElectron.mockReturnValue(false);
  getCurrentUserSync.mockReturnValue(null);
  getCurrentUser.mockResolvedValue(null);
  onSessionChange.mockReturnValue(vi.fn());
  delete window.api;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete window.api; });

describe("Studio portal", () => {
  it("renders the Studio identity, security section, and native Workbench catalog tile", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);
    expect(screen.getByRole("heading", { name: "OmniBioAI Studio" })).toBeInTheDocument();
    expect(screen.getByText("Unified access to OmniBioAI platform services, workflows, AI, and security")).toBeInTheDocument();
    expect(screen.getByText("Platform Services")).toBeInTheDocument();
    expect(screen.getByText("Security Control Plane")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workbench — Application catalog" })).toBeInTheDocument();
  });

  it("renders Provenance after Admin and launches the canonical Workbench application", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());

    const coreSection = screen.getByText("Core Platform").parentElement.parentElement;
    expect(within(coreSection).getByText("6 modules")).toBeInTheDocument();
    expect(within(coreSection).getAllByRole("button").map(button => button.textContent)).toEqual([
      "🤖OnboardAIAI developer tools",
      "💬OmniBioAgentAI assistant",
      "📊Job MonitorMonitor jobs",
      "🔌Plugin ManagerManage plugins",
      "⚙️AdminDjango admin",
      "🧬ProvenanceTrack runs & lineage",
    ]);

    const opened = vi.fn();
    window.addEventListener("open-service", opened);
    fireEvent.click(within(coreSection).getByRole("button", { name: "Provenance — Track runs & lineage" }));
    expect(opened.mock.calls[0][0].detail).toEqual({
      url: "/_svc/workbench/plugins/provenance/",
      label: "Provenance",
      source: "workbench",
      pluginSlug: "provenance",
      backLabel: "Back to Studio",
    });
    window.removeEventListener("open-service", opened);
  });

  it("shows online status once the health check succeeds and opens local links", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);
    expect(screen.getByText("Checking...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
    expect(screen.queryByText(/Workbench offline/)).not.toBeInTheDocument();

    const opened = vi.fn();
    window.addEventListener("open-service", opened);
    fireEvent.click(screen.getAllByRole("button", { name: "Open plugin catalog" })[0]);
    expect(opened).toHaveBeenCalled();

    const navigated = vi.fn();
    window.addEventListener("navigate", navigated);
    const workbenchTile = screen.getByRole("button", { name: "Workbench — Application catalog" });
    fireEvent.mouseEnter(workbenchTile);
    expect(workbenchTile.style.background).toBe("rgba(255, 255, 255, 0.03)");
    fireEvent.mouseLeave(workbenchTile);
    expect(workbenchTile.style.background).toBe("var(--bg3)");
    fireEvent.click(workbenchTile);
    expect(navigated.mock.calls.map(([event]) => event.detail)).toEqual([13]);
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener("open-service", opened);
    window.removeEventListener("navigate", navigated);
  });

  it("shows the offline banner and navigates to Launch from it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("Offline")).toBeInTheDocument());
    expect(screen.getByText(/Workbench offline/)).toBeInTheDocument();

    const navigated = vi.fn();
    window.addEventListener("navigate", navigated);
    fireEvent.click(screen.getByText("Go to Launch →"));
    expect(navigated).toHaveBeenCalled();
    window.removeEventListener("navigate", navigated);

    // a non-local plugin tile is disabled while offline
    const catalogTile = screen.getAllByRole("button", { name: "Open plugin catalog" })[0];
    expect(catalogTile).toHaveAttribute("aria-disabled", "true");
  });

  it("opens the native Workbench catalog from both Studio launch actions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
    const navigated = vi.fn();
    window.addEventListener("navigate", navigated);

    fireEvent.click(screen.getAllByRole("button", { name: "Launch workbench dashboard" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Open plugin catalog" })[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "Launch workbench dashboard" })[1]);
    expect(navigated.mock.calls.map(([event]) => event.detail)).toEqual([13, 13]);
    window.removeEventListener("navigate", navigated);
  });

  it("re-checks health on demand via the refresh button", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
    const before = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Refresh connection status" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });

  it("loads a saved host from window.api.loadConfig", async () => {
    window.api = { loadConfig: vi.fn().mockResolvedValue({ server: { host_ip: "10.1.1.1" } }) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("10.1.1.1")).toBeInTheDocument());
  });

  it("hides the Admin Console tile without the required permission, and shows it when the user has it or is still unknown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    getCurrentUserSync.mockReturnValue({ permissions: [] });
    getCurrentUser.mockResolvedValue({ permissions: [] });
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
    expect(screen.queryByText("Admin Console")).not.toBeInTheDocument();
    cleanup();

    getCurrentUserSync.mockReturnValue({ permissions: ["platform.manage_infra"] });
    getCurrentUser.mockResolvedValue({ permissions: ["platform.manage_infra"] });
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("Admin Console")).toBeInTheDocument());
    cleanup();

    getCurrentUserSync.mockReturnValue(null);
    getCurrentUser.mockResolvedValue(null);
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("Admin Console")).toBeInTheDocument());
  });

  it.each(["manage_api_keys", "manage_oauth_clients", "manage_all_orgs"])(
    "shows API Keys & Service Accounts with %s",
    (permission) => {
      usePermissions([permission]);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
      render(<Studio />);
      expect(screen.getByRole("button", { name: "API Keys & Service Accounts — API Keys · OAuth · Revocation" })).toBeInTheDocument();
    },
  );

  it("opens the canonical API Keys & Service Accounts destination without exposing sensitive details", () => {
    usePermissions(["manage_api_keys"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);

    const tile = screen.getByRole("button", { name: "API Keys & Service Accounts — API Keys · OAuth · Revocation" });
    expect(screen.getByText("API Keys · OAuth · Revocation")).toBeInTheDocument();
    expect(tile.outerHTML).not.toMatch(/AUTH_SECRET_KEY|MYSQL|\.env|client_secret|8099|8001|vault|keyvault|kms/i);

    const opened = vi.fn();
    window.addEventListener("open-service", opened);
    fireEvent.click(tile);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened.mock.calls[0][0].detail).toEqual({
      url: "https://admin.omnibioai.org/iam/service-accounts",
      label: "API Keys & Service Accounts",
    });
    window.removeEventListener("open-service", opened);
  });

  it("hides API Keys & Service Accounts without any accepted permission", () => {
    usePermissions([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);
    expect(screen.queryByText("API Keys & Service Accounts")).not.toBeInTheDocument();
  });

  it("keeps single-permission tiles independent from requiresAnyPermission tiles", () => {
    usePermissions(["manage_config"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);
    expect(screen.getByText("LLM Runtime")).toBeInTheDocument();
    expect(screen.queryByText("API Keys & Service Accounts")).not.toBeInTheDocument();
  });

  it("shows Compliance Center to manage_all_orgs users and opens its HIPAA page", () => {
    usePermissions(["manage_all_orgs"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);

    const tile = screen.getByRole("button", { name: "Compliance Center — HIPAA · Controls · Evidence" });
    expect(screen.getByText("HIPAA · Controls · Evidence")).toBeInTheDocument();
    const opened = vi.fn();
    window.addEventListener("open-service", opened);
    fireEvent.click(tile);
    expect(opened.mock.calls[0][0].detail).toEqual({
      url: "https://admin.omnibioai.org/hipaa-compliance",
      label: "Compliance Center",
    });
    window.removeEventListener("open-service", opened);
  });

  it("hides Compliance Center without manage_all_orgs", () => {
    usePermissions([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);
    expect(screen.queryByText("Compliance Center")).not.toBeInTheDocument();
  });

  it("shows Security Posture to manage_all_orgs users and opens its canonical page", () => {
    usePermissions(["manage_all_orgs"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);

    const tile = screen.getByRole("button", { name: "Security Posture — Controls · Enforcement · Readiness" });
    expect(screen.getByText("Controls · Enforcement · Readiness")).toBeInTheDocument();
    const opened = vi.fn();
    window.addEventListener("open-service", opened);
    fireEvent.click(tile);
    expect(opened.mock.calls[0][0].detail).toEqual({
      url: "https://admin.omnibioai.org/security-posture",
      label: "Security Posture",
    });
    window.removeEventListener("open-service", opened);
  });

  it("hides Security Posture without manage_all_orgs", () => {
    usePermissions([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);
    expect(screen.queryByText("Security Posture")).not.toBeInTheDocument();
  });

  it("shows Audit Explorer to manage_all_orgs users and opens its canonical page", () => {
    usePermissions(["manage_all_orgs"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);

    const tile = screen.getByRole("button", { name: "Audit Explorer \u2014 Events \u00b7 Evidence \u00b7 Investigation" });
    const opened = vi.fn();
    window.addEventListener("open-service", opened);
    fireEvent.click(tile);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened.mock.calls[0][0].detail).toEqual({
      url: "https://admin.omnibioai.org/audit-explorer",
      label: "Audit Explorer",
    });
    window.removeEventListener("open-service", opened);
  });

  it("shows Audit Logs to manage_all_orgs users and opens its canonical page", () => {
    usePermissions(["manage_all_orgs"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);

    const tile = screen.getByRole("button", { name: "Audit Logs \u2014 Identity \u00b7 Access \u00b7 Changes" });
    const opened = vi.fn();
    window.addEventListener("open-service", opened);
    fireEvent.click(tile);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened.mock.calls[0][0].detail).toEqual({
      url: "https://admin.omnibioai.org/audit-logs",
      label: "Audit Logs",
    });
    window.removeEventListener("open-service", opened);
  });

  it("hides Audit Explorer and Audit Logs without manage_all_orgs", () => {
    usePermissions(["manage_api_keys"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);

    expect(screen.getByText("API Keys & Service Accounts")).toBeInTheDocument();
    expect(screen.queryByText("Audit Explorer")).not.toBeInTheDocument();
    expect(screen.queryByText("Audit Logs")).not.toBeInTheDocument();
  });

  it("shows LLM Runtime to manage_config users and navigates to the existing LLM page", () => {
    usePermissions(["manage_config"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);

    const tile = screen.getByRole("button", { name: "LLM Runtime — Local models · GPU · Ollama" });
    expect(screen.getByText("Local models · GPU · Ollama")).toBeInTheDocument();
    expect(tile.outerHTML).not.toContain("11434");
    expect(tile.outerHTML).not.toContain("/_svc/ollama");

    const navigated = vi.fn();
    const opened = vi.fn();
    window.addEventListener("navigate", navigated);
    window.addEventListener("open-service", opened);
    fireEvent.click(tile);
    expect(navigated).toHaveBeenCalledTimes(1);
    expect(navigated.mock.calls[0][0].detail).toBe(1);
    expect(opened).not.toHaveBeenCalled();
    window.removeEventListener("navigate", navigated);
    window.removeEventListener("open-service", opened);
  });

  it("hides LLM Runtime without manage_config", () => {
    usePermissions([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);
    expect(screen.queryByText("LLM Runtime")).not.toBeInTheDocument();
  });

  it("shows Entitlements to manage_licenses users and opens Admin Console billing", () => {
    usePermissions(["manage_licenses"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);

    const tile = screen.getByRole("button", { name: "Entitlements — Plans · Licenses · Access" });
    expect(screen.getByText("Plans · Licenses · Access")).toBeInTheDocument();

    const opened = vi.fn();
    window.addEventListener("open-service", opened);
    fireEvent.click(tile);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened.mock.calls[0][0].detail).toEqual({
      url: "https://admin.omnibioai.org/billing",
      label: "Entitlements",
    });
    window.removeEventListener("open-service", opened);
  });

  it("hides Entitlements without manage_licenses", () => {
    usePermissions([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);
    expect(screen.queryByText("Entitlements")).not.toBeInTheDocument();
  });

  it("shows all 12 Security Control Plane modules to a fully authorized user", () => {
    usePermissions(["manage_api_keys", "manage_oauth_clients", "manage_all_orgs"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);

    [
      "API Gateway",
      "Auth Service",
      "Policy Engine",
      "HPC Policy",
      "Security Audit",
      "OPA",
      "API Keys & Service Accounts",
      "Compliance Center",
      "Security Posture",
      "Tool Executor",
      "Audit Explorer",
      "Audit Logs",
    ].forEach(label => expect(screen.getByText(label)).toBeInTheDocument());
    expect(screen.getByText("12 modules")).toBeInTheDocument();
  });

  it("shows 18 Platform Services modules to a fully authorized user", () => {
    usePermissions(["platform.manage_infra", "manage_config", "manage_licenses"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);
    expect(screen.getByText("18 modules")).toBeInTheDocument();
  });

  it("uses the Platform Services cyan accent for indicators and names only", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);

    const heading = screen.getByText("Platform Services");
    expect(heading.style.color).toBe("var(--text)");
    expect(heading.parentElement.querySelector("div").style.background).toBe("var(--accent-platform)");
    expect(screen.getByText("Getting Started").style.color).toBe("var(--accent-platform)");
    expect(screen.getByText("Setup · Cloud · HPC · LLM guide").style.color).toBe("var(--color-text-muted)");
  });

  it("unsubscribes from session changes on unmount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    const unsubscribe = vi.fn();
    onSessionChange.mockReturnValue(unsubscribe);
    const { unmount } = render(<Studio />);
    await waitFor(() => expect(onSessionChange).toHaveBeenCalled());
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("opens Neo4j Browser through the same-origin embedded service route", () => {
    usePermissions(["platform.manage_infra"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);

    const tile = screen.getByRole("button", { name: "Neo4j Browser — Knowledge-graph Cypher console" });
    const opened = vi.fn();
    window.addEventListener("open-service", opened);
    fireEvent.click(tile);
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({
      detail: { url: "/neo4j/browser/", label: "Neo4j Browser" },
    }));
    window.removeEventListener("open-service", opened);
  });

  it("keeps Neo4j Browser embedded under Electron", () => {
    isElectron.mockReturnValue(true);
    usePermissions(["platform.manage_infra"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);

    const tile = screen.getByRole("button", { name: "Neo4j Browser — Knowledge-graph Cypher console" });
    const opened = vi.fn();
    window.addEventListener("open-service", opened);
    fireEvent.click(tile);
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({
      detail: { url: "http://localhost/neo4j/browser/", label: "Neo4j Browser" },
    }));
    window.removeEventListener("open-service", opened);
  });

  it("hides Neo4j Browser without platform.manage_infra", () => {
    usePermissions([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);
    expect(screen.queryByText("Neo4j Browser")).not.toBeInTheDocument();
  });

  it("builds an absolute Electron webview URL for local links", async () => {
    isElectron.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    render(<Studio />);
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
    const opened = vi.fn();
    window.addEventListener("open-service", opened);
    fireEvent.click(screen.getAllByRole("button", { name: "Open plugin catalog" })[0]);
    expect(opened.mock.calls[0][0].detail.url).toMatch(/^http:\/\/localhost/);
    window.removeEventListener("open-service", opened);
  });
});

it("uses one Workbench catalog entry and keeps plugin catalog links separate", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
  const navigate = vi.fn(); window.addEventListener("navigate", navigate);
  try {
    render(<Studio />);
    await screen.findByText("Online");
    const workbenchTile = screen.getByRole("button", { name: "Workbench — Application catalog" });
    fireEvent.click(workbenchTile);
    expect(navigate.mock.calls[0][0].detail).toBe(13);
    expect(screen.queryByRole("button", { name: /Home — Dashboard/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Workbench — Application catalog" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Launch workbench dashboard" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Open plugin catalog" })).toHaveLength(2);
  } finally { window.removeEventListener("navigate", navigate); }
});
