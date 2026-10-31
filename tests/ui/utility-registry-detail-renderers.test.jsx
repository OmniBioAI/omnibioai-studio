import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { nativePluginRequest } = vi.hoisted(() => ({ nativePluginRequest: vi.fn() }));
vi.mock("../../src/ui/lib/nativePluginApi", () => ({ nativePluginRequest }));

import { ObjectRegistryExplorerReactRenderer, ReferenceRegistryReactRenderer } from "../../src/ui/components/workbench/UtilityRegistryDetailRenderers";

afterEach(() => { cleanup(); nativePluginRequest.mockReset(); });

describe("Object Registry Explorer React workflow", () => {
  it("filters registered objects and opens structured lineage details", async () => {
    nativePluginRequest.mockImplementation(async path => path.includes("/object-1/")
      ? { object_id: "object-1", object_type: "dataset", status: "ready", size_h: "20 B", parents: ["parent-1"], children: [], lineage_edges: [], object: { owner: "lab" } }
      : { objects: [{ object_id: "object-1", short_id: "object", object_type: "dataset", status: "ready", created_by: "user", size_h: "20 B", inputs_count: 1 }], total: 1, types: ["dataset"], statuses: ["ready"], creators: ["user"] });
    render(<ObjectRegistryExplorerReactRenderer />);
    fireEvent.click(await screen.findByRole("button", { name: "object" }));
    expect(await screen.findByRole("heading", { name: "Object object-1" })).toBeTruthy();
    expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/object_registry_explorer/api/objects/object-1/");
    expect(await screen.findByText(/parent-1/)).toBeTruthy();
  });
});

describe("Reference Registry React workflow", () => {
  it("lists and uploads a reference using the multipart contract", async () => {
    nativePluginRequest.mockImplementation(async (path, options) => path.endsWith("/upload/")
      ? { reference: { id: 1 } } : { references: [{ id: 1, name: "GRCh38", build: "38", organism: "human", type: "fasta", object_id: "obj-1", is_default: true }] });
    render(<ReferenceRegistryReactRenderer />);
    expect(await screen.findByText("GRCh38")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reference file"), { target: { files: [new File([">chr1\nACGT\n"], "ref.fa")] } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New ref" } });
    fireEvent.change(screen.getByLabelText("Build"), { target: { value: "v1" } });
    fireEvent.change(screen.getByLabelText("Organism"), { target: { value: "human" } });
    fireEvent.submit(screen.getByRole("button", { name: "Validate and register" }).closest("form"));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/reference_registry/api/references/upload/", expect.objectContaining({ method: "POST", body: expect.any(FormData) })));
  });
});
