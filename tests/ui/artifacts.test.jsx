import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listArtifacts: vi.fn(),
  getArtifact: vi.fn(),
  getArtifactProvenance: vi.fn(),
  downloadArtifact: vi.fn(),
  getStorageUsage: vi.fn(),
}));

vi.mock("../../src/ui/lib/artifactsApi", () => api);
vi.mock("../../src/ui/components/PreferencesProvider", () => ({
  useAccountDateTime: () => value => value ? `date:${value}` : "Unavailable",
}));

import Artifacts from "../../src/ui/pages/Artifacts";

const report = Object.freeze({
  artifactId: "11111111-1111-4111-8111-111111111111",
  name: "Differential expression report",
  description: "Authorized report output",
  artifactType: "report",
  format: "html",
  sizeBytes: 1536,
  mimeType: "text/html",
  createdAt: "2026-09-01T12:00:00Z",
  createdBy: "scientist@example.test",
  projectId: "project-reference-1",
  runId: "run-27",
  workflowId: "workflow-rnaseq",
  parentArtifactId: "",
  version: 2,
  tags: ["rnaseq", "reviewed"],
  status: "available",
  archivedAt: "",
});

const table = Object.freeze({
  ...report,
  artifactId: "22222222-2222-4222-8222-222222222222",
  name: "Normalized counts",
  description: "",
  artifactType: "table",
  format: "csv",
  sizeBytes: 512,
  projectId: "",
  runId: "",
  workflowId: "",
  version: 1,
  tags: [],
});

const image = Object.freeze({
  ...table,
  artifactId: "33333333-3333-4333-8333-333333333333",
  name: "PCA image",
  artifactType: "image",
  format: "png",
});

function provenance(overrides = {}) {
  return { artifact: report, inputs: [], outputs: [], ...overrides };
}

beforeEach(() => {
  api.getStorageUsage.mockReset().mockResolvedValue({
    usedBytes: 240_000_000, reservedBytes: 0, quotaBytes: 1_000_000_000,
    availableBytes: 760_000_000, plan: "free", overQuota: false,
    quotaMode: "audit", enforcementActive: false, entitlementStatus: "fresh",
  });
  api.listArtifacts.mockReset().mockResolvedValue({ artifacts: [], total: 0 });
  api.getArtifact.mockReset().mockResolvedValue(report);
  api.getArtifactProvenance.mockReset().mockResolvedValue(provenance());
  api.downloadArtifact.mockReset().mockResolvedValue({ blob: new Blob(["result"]), filename: "report.html" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Artifacts page", () => {
  it("shows real personal usage and does not claim audit mode is enforced", async () => {
    render(<Artifacts />);
    expect(await screen.findByRole("heading", { name: "Personal managed storage" })).toBeInTheDocument();
    expect(screen.getByText("Membership: Free")).toBeInTheDocument();
    expect(screen.getByText("240 MB")).toBeInTheDocument();
    expect(screen.getByText("760 MB")).toBeInTheDocument();
    expect(screen.getByText("1.0 GB")).toBeInTheDocument();
    expect(screen.getByText("Quota accounting is in audit mode; enforcement is not active.")).toBeInTheDocument();
    expect(screen.queryByText("Quota enforced")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View upgrade options" })).toHaveAttribute("href", "/studio/billing/plans");
  });

  it("keeps unavailable storage distinct from zero usage", async () => {
    api.getStorageUsage.mockRejectedValue(new Error("offline"));
    render(<Artifacts />);
    expect(await screen.findByText("Storage usage is unavailable right now. No usage value has been assumed.")).toBeInTheDocument();
    expect(screen.queryByText(/^0 B$/)).not.toBeInTheDocument();
  });

  it("renders loading and then a truthful empty state without fake records", async () => {
    let resolve;
    api.listArtifacts.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<Artifacts />);
    expect(screen.getByRole("heading", { name: "Artifacts" })).toBeInTheDocument();
    expect(screen.getByText(/Loading artifacts/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    resolve({ artifacts: [], total: 0 });
    expect(await screen.findByRole("heading", { name: "No artifacts yet" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Unified artifact tracking");
  });

  it("shows canonical list metadata without exposing storage details", async () => {
    api.listArtifacts.mockResolvedValue({ artifacts: [report], total: 1 });
    render(<Artifacts />);
    const row = await screen.findByRole("row", { name: /Differential expression report/ });
    expect(within(row).getByText("Report")).toBeInTheDocument();
    expect(within(row).getByText("Available")).toBeInTheDocument();
    expect(within(row).getByText("1.5 KB")).toBeInTheDocument();
    expect(within(row).getByText(`date:${report.createdAt}`)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/storage_uri|object[_ -]?key|s3:\/\/|\/var\/|checksum/i);
  });

  it("shows a safe error instead of treating a failed list as empty", async () => {
    api.listArtifacts.mockRejectedValue(Object.assign(new Error("bucket secret"), { code: "unavailable" }));
    render(<Artifacts />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Artifacts are unavailable right now");
    expect(screen.queryByText("bucket secret")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No artifacts yet" })).not.toBeInTheDocument();
  });

  it("uses backend search and never sends an organization selector", async () => {
    api.listArtifacts.mockResolvedValue({ artifacts: [report], total: 1 });
    render(<Artifacts />);
    await screen.findByText(report.name);
    fireEvent.change(screen.getByRole("textbox", { name: "Search artifacts" }), { target: { value: "expression" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(api.listArtifacts).toHaveBeenLastCalledWith(expect.objectContaining({ query: "expression" })));
    for (const [options] of api.listArtifacts.mock.calls) {
      expect(options).not.toHaveProperty("organization_id");
      expect(options).not.toHaveProperty("organizationId");
    }
  });

  it("applies deterministic client filters only to the authorized list", async () => {
    api.listArtifacts.mockResolvedValue({ artifacts: [report, table, image], total: 3 });
    render(<Artifacts />);
    await screen.findByText(report.name);
    fireEvent.click(screen.getByRole("button", { name: "Tables" }));
    expect(screen.getByText(table.name)).toBeInTheDocument();
    expect(screen.queryByText(report.name)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    expect(screen.getByText(image.name)).toBeInTheDocument();
    expect(screen.queryByText(table.name)).not.toBeInTheDocument();
    expect(api.listArtifacts).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Plots" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notebooks" })).not.toBeInTheDocument();
  });

  it("loads detail and provenance independently only after open", async () => {
    api.listArtifacts.mockResolvedValue({ artifacts: [report], total: 1 });
    api.getArtifactProvenance.mockResolvedValue(provenance({
      inputs: [{ relationship: "input", artifact: table, producingTool: "DESeq2", producingPlugin: "rnaseq", executionTimestamp: report.createdAt }],
      outputs: [{ relationship: "derived", artifact: image, producingTool: "", producingPlugin: "", executionTimestamp: "" }],
    }));
    render(<Artifacts />);
    await screen.findByText(report.name);
    expect(api.getArtifact).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `Open ${report.name}` }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(api.getArtifact).toHaveBeenCalledWith(report.artifactId, expect.any(Object)));
    expect(await screen.findByText("Project reference")).toBeInTheDocument();
    expect(screen.getByText("project-reference-1")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Inputs" })).toBeInTheDocument();
    expect(screen.getByText("DESeq2 · rnaseq")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Derived outputs" })).toBeInTheDocument();
  });

  it("renders provenance empty and failure states without collapsing artifact detail", async () => {
    api.listArtifacts.mockResolvedValue({ artifacts: [report], total: 1 });
    const { unmount } = render(<Artifacts />);
    await screen.findByText(report.name);
    fireEvent.click(screen.getByRole("button", { name: `Open ${report.name}` }));
    expect(await screen.findByText("No provenance has been recorded for this artifact.")).toBeInTheDocument();
    expect(screen.getByText("Project reference")).toBeInTheDocument();
    unmount();

    api.getArtifactProvenance.mockRejectedValue(Object.assign(new Error("private trace"), { code: "not_found" }));
    render(<Artifacts />);
    await screen.findByText(report.name);
    fireEvent.click(screen.getByRole("button", { name: `Open ${report.name}` }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provenance is unavailable right now");
    expect(screen.getByText("Project reference")).toBeInTheDocument();
    expect(screen.queryByText("private trace")).not.toBeInTheDocument();
  });

  it("uses the canonical download client and revokes the temporary browser URL", async () => {
    api.listArtifacts.mockResolvedValue({ artifacts: [report], total: 1 });
    const createObjectURL = vi.fn(() => "blob:temporary");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<Artifacts />);
    await screen.findByText(report.name);
    fireEvent.click(screen.getByRole("button", { name: `Open ${report.name}` }));
    fireEvent.click(await screen.findByRole("button", { name: "Download artifact" }));
    await waitFor(() => expect(api.downloadArtifact).toHaveBeenCalledWith(report.artifactId, { filename: report.name }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:temporary"));
    expect(screen.getByText(`Download started for ${report.name}.`)).toBeInTheDocument();
    click.mockRestore();
  });

  it("keeps a 404 detail failure opaque", async () => {
    api.listArtifacts.mockResolvedValue({ artifacts: [report], total: 1 });
    api.getArtifact.mockRejectedValue(Object.assign(new Error("s3://private-bucket/key"), { code: "not_found" }));
    render(<Artifacts />);
    await screen.findByText(report.name);
    fireEvent.click(screen.getByRole("button", { name: `Open ${report.name}` }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This artifact is unavailable.");
    expect(document.body.textContent).not.toMatch(/private-bucket|\/srv\/artifacts/);
  });

  it("keeps a direct download failure opaque without exposing backend details", async () => {
    api.listArtifacts.mockResolvedValue({ artifacts: [report], total: 1 });
    api.downloadArtifact.mockRejectedValue(Object.assign(new Error("/srv/artifacts/secret"), { code: "not_found" }));
    render(<Artifacts />);
    await screen.findByText(report.name);
    fireEvent.click(screen.getByRole("button", { name: `Open ${report.name}` }));
    fireEvent.click(await screen.findByRole("button", { name: "Download artifact" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This artifact is unavailable for download.");
    expect(document.body.textContent).not.toMatch(/\/srv\/artifacts|secret/);
  });
});
