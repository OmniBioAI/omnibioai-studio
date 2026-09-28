import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { loadPluginDescriptor } = vi.hoisted(() => ({ loadPluginDescriptor: vi.fn() }));
vi.mock("../../src/ui/lib/pluginApi", () => ({ loadPluginDescriptor }));
vi.mock("../../src/ui/pages/ServiceViewer", () => ({ default: ({ label, backLabel }) => <div data-testid="service-viewer">Legacy {label} {backLabel}</div> }));
vi.mock("../../src/ui/components/GenericPluginRunner", () => ({ default: () => <div data-testid="generic-runner">Native runner</div> }));

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
    expect(screen.queryByTestId("service-viewer")).not.toBeInTheDocument();
  });

  it("keeps unsupported plugins in ServiceViewer", async () => {
    loadPluginDescriptor.mockResolvedValue({ schema_version: 1, plugin: { slug: "workflow_builder" }, renderer: "legacy", native_supported: false });
    render(<PluginPage slug="workflow_builder" url="/_svc/workbench/plugins/workflow_builder/" label="Workflow Builder" onBack={vi.fn()} />);
    expect(await screen.findByTestId("service-viewer")).toHaveTextContent("Workflow Builder");
  });

  it("preserves Studio-origin back navigation for legacy Workbench applications", async () => {
    loadPluginDescriptor.mockResolvedValue({ schema_version: 1, plugin: { slug: "provenance" }, renderer: "legacy", native_supported: false });
    render(<PluginPage slug="provenance" url="/_svc/workbench/plugins/provenance/" label="Provenance" backLabel="Back to Studio" onBack={vi.fn()} />);
    expect(await screen.findByTestId("service-viewer")).toHaveTextContent("Back to Studio");
  });

  it("falls back only for a missing descriptor, while showing retryable errors for server failures", async () => {
    const notFound = Object.assign(new Error("missing"), { status: 404 });
    loadPluginDescriptor.mockRejectedValueOnce(notFound);
    const { rerender } = render(<PluginPage slug="old_plugin" url="/_svc/workbench/plugins/old_plugin/" label="Old" onBack={vi.fn()} />);
    expect(await screen.findByTestId("service-viewer")).toBeInTheDocument();
    const serverError = Object.assign(new Error("server unavailable"), { status: 503 });
    loadPluginDescriptor.mockRejectedValueOnce(serverError);
    rerender(<PluginPage slug="deseq2_analysis" url="/_svc/workbench/plugins/deseq2_analysis/" label="DESeq2" onBack={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("server unavailable");
    expect(screen.queryByTestId("service-viewer")).not.toBeInTheDocument();
  });
});
