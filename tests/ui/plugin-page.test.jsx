import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { loadPluginDescriptor } = vi.hoisted(() => ({ loadPluginDescriptor: vi.fn() }));
vi.mock("../../src/ui/lib/pluginApi", () => ({ loadPluginDescriptor }));
vi.mock("../../src/ui/components/workbench/rendererRegistry", () => ({
  resolveWorkbenchRenderer: (renderer, slug) => renderer === "legacy" && slug !== "workflow_builder"
    ? null
    : () => <div data-testid="generic-runner">Native runner</div>,
}));
vi.mock("../../src/ui/components/workbench/ExistingRunRenderer", () => ({
  default: ({ runId }) => <div data-testid="existing-run">Existing run: {runId}</div>,
}));

import PluginPage from "../../src/ui/pages/PluginPage";

const native = {
  schema_version: 1,
  plugin: { slug: "deseq2_analysis", name: "DESeq2", version: "1.0.0", description: "desc", category: "analysis" },
  renderer: "generic_runner", native_supported: true, inputs: [], outputs: [], endpoints: {},
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("PluginPage capability routing", () => {
  it("renders the native generic runner for a supported descriptor", async () => {
    loadPluginDescriptor.mockResolvedValue(native);
    render(<PluginPage slug="deseq2_analysis" url="/_svc/workbench/plugins/deseq2_analysis/" label="DESeq2" onBack={vi.fn()} />);
    expect(await screen.findByTestId("generic-runner")).toBeInTheDocument();
  });

  it("opens an existing run in React when a legacy detail URL supplies its run id", async () => {
    loadPluginDescriptor.mockResolvedValue(native);
    render(<PluginPage slug="deseq2_analysis" label="DESeq2" initialRunId="run-42" onBack={vi.fn()} />);
    expect(await screen.findByTestId("existing-run")).toHaveTextContent("Existing run: run-42");
    expect(screen.queryByTestId("generic-runner")).not.toBeInTheDocument();
  });
  it("allows a plugin-specific React override for a legacy descriptor", async () => {
    loadPluginDescriptor.mockResolvedValue({ schema_version: 1, plugin: { slug: "workflow_builder" }, renderer: "legacy", native_supported: false });
    render(<PluginPage slug="workflow_builder" url="/_svc/workbench/plugins/workflow_builder/" label="Workflow Builder" onBack={vi.fn()} />);
    expect(await screen.findByTestId("generic-runner")).toHaveTextContent("Native runner");
  });

  it("keeps unsupported descriptors inside a retriable React error boundary", async () => {
    loadPluginDescriptor.mockResolvedValue({ schema_version: 1, plugin: { slug: "old_plugin" }, renderer: "legacy", native_supported: false });
    render(<PluginPage slug="old_plugin" url="/_svc/workbench/plugins/old_plugin/" label="Old plugin" onBack={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load plugin UI. Please try again.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it("does not open legacy HTML for an unsupported Studio-origin plugin", async () => {
    loadPluginDescriptor.mockResolvedValue({ schema_version: 1, plugin: { slug: "provenance" }, renderer: "legacy", native_supported: false });
    render(<PluginPage slug="provenance" url="/_svc/workbench/plugins/provenance/" label="Provenance" backLabel="Back to Studio" onBack={vi.fn()} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(document.querySelector("iframe, webview")).toBeNull();
  });

  it("shows retryable React errors for missing descriptors and server failures", async () => {
    const notFound = Object.assign(new Error("missing"), { status: 404 });
    loadPluginDescriptor.mockRejectedValueOnce(notFound);
    const { rerender } = render(<PluginPage slug="old_plugin" url="/_svc/workbench/plugins/old_plugin/" label="Old" onBack={vi.fn()} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(document.querySelector("iframe, webview")).toBeNull();
    const serverError = Object.assign(new Error("server unavailable"), { status: 503 });
    loadPluginDescriptor.mockRejectedValueOnce(serverError);
    rerender(<PluginPage slug="deseq2_analysis" url="/_svc/workbench/plugins/deseq2_analysis/" label="DESeq2" onBack={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The service is temporarily unavailable. Please try again later.");
  });

  it("keeps descriptor validation failures inside React", async () => {
    const invalid = Object.assign(new Error("invalid descriptor"), { name: "PluginDescriptorError", status: 0 });
    loadPluginDescriptor.mockRejectedValueOnce(invalid);
    render(<PluginPage slug="biosamples" url="/_svc/workbench/plugins/biosamples/" label="BioSamples" onBack={vi.fn()} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(document.querySelector("iframe, webview")).toBeNull();
  });
});
