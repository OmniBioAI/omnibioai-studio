import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { nativePluginRequest } = vi.hoisted(() => ({ nativePluginRequest: vi.fn() }));
vi.mock("../../src/ui/lib/nativePluginApi", () => ({ nativePluginRequest }));

import {
  CatalogReactRenderer,
  DataLineageTrackerReactRenderer,
  EnvironmentManagerReactRenderer,
  FormatConverterReactRenderer,
  SchemaRegistryReactRenderer,
} from "../../src/ui/components/workbench/UtilityRegistryRenderers";

afterEach(() => { cleanup(); nativePluginRequest.mockReset(); });

describe("catalog legacy React workflow", () => {
  it("loads live catalog records, switches inventory tabs, and refreshes capabilities", async () => {
    nativePluginRequest.mockImplementation(async path => {
      if (path.endsWith("/summary/")) return { plugins: 4, tools: 2 };
      if (path.endsWith("/plugins/")) return { plugins: [{ slug: "qc", name: "QC" }] };
      if (path.endsWith("/servers/")) return { servers: [{ name: "TES" }] };
      if (path.endsWith("/refresh/")) return { refreshed: true };
      return { tools: [], workflows: [] };
    });
    render(<CatalogReactRenderer />);
    expect(await screen.findByText("qc")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Servers" }));
    expect(await screen.findByText("TES")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh capabilities" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/catalog/api/refresh/", { method: "POST", body: {} }));
  });
});

describe("schema registry legacy React workflow", () => {
  it("lists schemas and submits JSON validation to the schema API", async () => {
    nativePluginRequest.mockImplementation(async (path, options) => {
      if (path.endsWith("/schemas/")) return { schemas: [{ schema_id: "clinical-v1", version: 1 }] };
      if (path.endsWith("/validate/")) return { valid: true, errors: [] };
      return {};
    });
    render(<SchemaRegistryReactRenderer />);
    expect(await screen.findByText("clinical-v1")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Schema ID"), { target: { value: "clinical-v1" } });
    fireEvent.change(screen.getByLabelText("JSON payload"), { target: { value: "{\"subject\":\"S1\"}" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/schema_registry/api/validate/", {
      method: "POST", body: { schema_id: "clinical-v1", version: undefined, data: { subject: "S1" } },
    }));
    expect(await screen.findByText(/"valid": true/)).toBeTruthy();
  });
});

describe("format converter legacy React workflow", () => {
  it("loads formats and sends the historical detect and validate payloads", async () => {
    nativePluginRequest.mockImplementation(async (path, options) => {
      if (path.endsWith("/formats/")) return { formats: ["csv", "tsv"] };
      if (path.endsWith("/detect-format/")) return { source_format: "csv" };
      if (path.endsWith("/validate-conversion/")) return { success: true, supported: true };
      return {};
    });
    render(<FormatConverterReactRenderer />);
    await screen.findByRole("option", { name: "tsv" });
    fireEvent.change(screen.getByLabelText("Input path or registered object"), { target: { value: "/data/study.csv" } });
    fireEvent.change(screen.getByLabelText("Destination format"), { target: { value: "tsv" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate plan" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/format_converter/api/validate-conversion/", {
      method: "POST", body: { input: "/data/study.csv", source_format: undefined, destination_format: "tsv", output: undefined },
    }));
  });
});

describe("environment manager legacy React workflow", () => {
  it("loads environments and runs read-only validation", async () => {
    nativePluginRequest.mockImplementation(async (path, options) => {
      if (path.endsWith("/environments/")) return { environments: [{ environment_id: "env-1", name: "RNA-seq" }] };
      if (path.endsWith("/validate/")) return { valid: true, findings: [] };
      return {};
    });
    render(<EnvironmentManagerReactRenderer />);
    await screen.findByRole("option", { name: "RNA-seq" });
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/environment_manager/api/validate/", {
      method: "POST", body: { environment_id: "env-1" },
    }));
  });
});

describe("lineage tracker legacy React workflow", () => {
  it("searches lineage and requests object impact analysis", async () => {
    nativePluginRequest.mockImplementation(async path => path.includes("impact-analysis")
      ? { affected_objects: 3 } : { items: [{ object_id: "object-1" }] });
    render(<DataLineageTrackerReactRenderer />);
    fireEvent.change(screen.getByLabelText("Search records"), { target: { value: "sample-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/data_lineage_tracker/api/lineage/search/?q=sample-1&page_size=50"));
    fireEvent.change(screen.getByLabelText("Object or lineage ID"), { target: { value: "object-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyze impact" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/data_lineage_tracker/api/lineage/impact-analysis/", {
      method: "POST", body: { object_id: "object-1", scenario: "invalidated" },
    }));
  });
});
