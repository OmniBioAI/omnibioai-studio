import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import QueryRenderer from "../../src/ui/components/workbench/QueryRenderer";

const descriptor = {
  schema_version: 1,
  plugin: { slug: "clinvar", name: "ClinVar", version: "1", description: "", category: "reference_db" },
  renderer: "query", native_supported: true,
  inputs: [{ id: "query", component: "text", label: "Query", description: "Search", required: true, format: "text", query_key: "accession" }],
  outputs: [], capabilities: { query: true, detail: true },
  endpoints: { query: "/plugins/clinvar/search/", detail: "/plugins/clinvar/variants/{detail_id}/" },
  result: { presentation: "table", rows_path: "results", detail_key: "accession", columns: [{ key: "accession", label: "Accession" }, { key: "title", label: "Title" }] },
};

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("QueryRenderer", () => {
  it("submits an immediate GET query and renders inert table results", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ results: [{ accession: "VCV1", title: "<b>inert</b>" }] }) });
    render(<QueryRenderer descriptor={descriptor} />);
    fireEvent.change(screen.getByLabelText(/Query/), { target: { value: "VCV1" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByText("<b>inert</b>")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith("/_svc/workbench/plugins/clinvar/search/?accession=VCV1", expect.objectContaining({ credentials: "same-origin" }));
    expect(screen.queryByRole("heading", { name: "RUNNING" })).not.toBeInTheDocument();
  });

  it("validates required fields and performs detail lookup without polling", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ accession: "VCV1", title: "Variant" }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ accession: "VCV1", title: "Variant", status: "pathogenic" }) });
    render(<QueryRenderer descriptor={descriptor} />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Query is required");
    fireEvent.change(screen.getByLabelText(/Query/), { target: { value: "VCV1" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Variant");
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    await waitFor(() => expect(screen.getByText("pathogenic")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
