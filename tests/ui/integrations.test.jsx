import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ loadIntegrationCatalog: vi.fn(), getIntegrationProvider: vi.fn(), savePersonalCredential: vi.fn(), revokePersonalCredential: vi.fn() }));
vi.mock("../../src/ui/lib/integrationsApi", () => api);
import Integrations from "../../src/ui/pages/Integrations";

const base = {
  providerId: "github", displayName: "GitHub", category: "source_control", description: "GitHub source control, Actions, and registry capabilities.", setupState: "free_account",
  pluginSlugs: ["git_hosting", "github_actions", "ghcr"], capabilities: ["source_control", "actions", "container_registry"], connectionTestSupported: false,
  authentication: { type: "token", allowedScopes: ["user", "organization"], anonymousAccess: false, fields: [{ name: "token", label: "Personal access token", secret: true, required: true }] },
  effectiveStatus: "NOT_CONFIGURED", effectiveScope: null, personalCredential: null,
};
const org = { ...base, providerId: "gitlab", displayName: "GitLab", pluginSlugs: ["git_hosting", "gitlab"], capabilities: ["source_control", "continuous_integration"], effectiveStatus: "CONNECTED_ORGANIZATION", effectiveScope: "organization" };
const ncbi = { ...base, providerId: "ncbi", displayName: "NCBI", category: "reference_database", description: "Public biomedical databases.", pluginSlugs: ["ncbi", "sra"], capabilities: ["entrez", "sra"], authentication: { type: "optional_api_key", allowedScopes: ["user", "organization", "platform"], anonymousAccess: true, fields: [{ name: "api_key", label: "NCBI API key", secret: true, required: false }] }, effectiveStatus: "READY_NO_CREDENTIALS", effectiveScope: "anonymous" };
function detail(provider) {
  const { effectiveStatus, effectiveScope, personalCredential, ...definition } = provider;
  return definition;
}

beforeEach(() => {
  api.loadIntegrationCatalog.mockResolvedValue([base, org, ncbi]);
  api.getIntegrationProvider.mockImplementation(async id => detail([base, org, ncbi].find(item => item.providerId === id)));
  api.savePersonalCredential.mockResolvedValue({ providerId: "github", scope: "user", configured: true });
  api.revokePersonalCredential.mockResolvedValue();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe("Integrations page", () => {
  it("renders the provider-level catalog, aggregation, loading state, and canonical capabilities", async () => {
    render(<Integrations />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading integrations");
    expect(await screen.findByRole("heading", { name: "GitHub" })).toBeVisible();
    expect(screen.getByText("3", { selector: "dd" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "View GitHub" }));
    const dialog = await screen.findByRole("dialog");
    expect(api.getIntegrationProvider).toHaveBeenCalledWith("github");
    for (const label of ["Source Control", "Actions", "Container Registry"]) expect(within(dialog).getAllByText(label).some(node => node.tagName === "LI")).toBe(true);
    expect(within(dialog).getByRole("button", { name: "Test connection unavailable" })).toBeDisabled();
  });

  it("hands organization credential administration back to the existing Connections route", async () => {
    const onOrganizationConnections = vi.fn();
    render(<Integrations onOrganizationConnections={onOrganizationConnections} />);
    fireEvent.click(screen.getByRole("button", { name: "Organization connections" }));
    expect(onOrganizationConnections).toHaveBeenCalledOnce();
  });

  it("searches provider metadata and composes category and status filters", async () => {
    render(<Integrations />); await screen.findByRole("heading", { name: "GitHub" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search integrations" }), { target: { value: "biomedical" } });
    expect(screen.getByRole("heading", { name: "NCBI" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "GitHub" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "source_control" } });
    fireEvent.click(screen.getByRole("button", { name: "Connected" }));
    expect(screen.getByRole("heading", { name: "GitLab" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "GitHub" })).toBeNull();
  });

  it("shows truthful organization-managed and anonymous-ready states", async () => {
    render(<Integrations />); await screen.findByRole("heading", { name: "GitLab" });
    expect(screen.getByText("Connected — Organization")).toBeVisible();
    expect(screen.getByText("Ready — No setup required")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "View GitLab" }));
    expect(await screen.findByText(/Managed by your organization/)).toBeVisible();
    expect(screen.queryByText(/organization.*credential.*value/i)).toBeNull();
  });

  it("generates personal credential fields from backend metadata and clears secrets after save", async () => {
    const secret = "ghp_NEVER_PERSIST_THIS";
    render(<Integrations />); await screen.findByRole("heading", { name: "GitHub" });
    fireEvent.click(screen.getByRole("button", { name: "View GitHub" }));
    fireEvent.click(await screen.findByRole("button", { name: "Configure personal credential" }));
    const input = screen.getByLabelText("Personal access token *");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.change(input, { target: { value: secret } });
    fireEvent.click(screen.getByRole("button", { name: "Save credential" }));
    await waitFor(() => expect(api.savePersonalCredential).toHaveBeenCalledWith(expect.objectContaining({ providerId: "github" }), { token: secret }, expect.any(Object)));
    await screen.findByText("Personal credential configured.");
    expect(document.body.innerHTML).not.toContain(secret);
    expect(JSON.stringify(localStorage)).not.toContain(secret);
    expect(JSON.stringify(sessionStorage)).not.toContain(secret);
    expect(location.href).not.toContain(secret);
  });

  it("supports replacement and explicit revocation of personal credentials", async () => {
    const connected = { ...base, effectiveStatus: "CONNECTED_USER", effectiveScope: "user", personalCredential: { providerId: "github", scope: "user", maskedHint: "••••1234" } };
    api.loadIntegrationCatalog.mockResolvedValue([connected]); api.getIntegrationProvider.mockResolvedValue(detail(base));
    render(<Integrations />); await screen.findByRole("heading", { name: "GitHub" });
    fireEvent.click(screen.getByRole("button", { name: "View GitHub" }));
    fireEvent.click(await screen.findByRole("button", { name: "Replace personal credential" }));
    fireEvent.change(screen.getByLabelText("Personal access token *"), { target: { value: "replacement" } });
    fireEvent.click(screen.getByRole("button", { name: "Replace credential" }));
    await screen.findByText("Personal credential replaced.");

    api.loadIntegrationCatalog.mockResolvedValue([connected]); api.getIntegrationProvider.mockResolvedValue(detail(base));
    fireEvent.click(screen.getByRole("button", { name: "View GitHub" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove personal credential" }));
    expect(screen.getByText("Remove personal credential?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    await waitFor(() => expect(api.revokePersonalCredential).toHaveBeenCalledWith("github", expect.any(Object)));
  });

  it("clears transient secrets on cancellation and unmount", async () => {
    const secret = "cancelled-secret";
    const view = render(<Integrations />); await screen.findByRole("heading", { name: "GitHub" });
    fireEvent.click(screen.getByRole("button", { name: "View GitHub" }));
    fireEvent.click(await screen.findByRole("button", { name: "Configure personal credential" }));
    fireEvent.change(screen.getByLabelText("Personal access token *"), { target: { value: secret } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.body.innerHTML).not.toContain(secret);
    view.unmount(); expect(JSON.stringify(localStorage)).not.toContain(secret);
  });

  it("handles empty catalogs, authorization failures, network failures, and retry safely", async () => {
    api.loadIntegrationCatalog.mockResolvedValueOnce([]);
    const view = render(<Integrations />);
    expect(await screen.findByText("No integrations are currently available.")).toBeVisible();
    view.unmount(); cleanup();
    api.loadIntegrationCatalog.mockRejectedValueOnce({ code: "forbidden", message: "raw private detail" }).mockResolvedValueOnce([base]);
    render(<Integrations />);
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission");
    expect(screen.queryByText("raw private detail")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "GitHub" })).toBeVisible();
  });

  it("does not expose plaintext backend response fields or platform administration", async () => {
    const platform = { ...base, providerId: "bioportal", displayName: "BioPortal", effectiveStatus: "CONNECTED_PLATFORM", effectiveScope: "platform" };
    api.loadIntegrationCatalog.mockResolvedValue([platform]); api.getIntegrationProvider.mockResolvedValue(detail(base));
    render(<Integrations />); await screen.findByRole("heading", { name: "BioPortal" });
    expect(screen.getByText("Connected — Platform")).toBeVisible();
    expect(screen.queryByRole("button", { name: /platform.*credential/i })).toBeNull();
    expect(document.body.textContent).not.toContain("credential_ref");
  });
});
