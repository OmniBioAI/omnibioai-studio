import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QueryRenderer from "../../src/ui/components/workbench/QueryRenderer";
import PluginPage from "../../src/ui/pages/PluginPage";

vi.mock("../../src/ui/pages/ServiceViewer", () => ({
  default: ({ url, label }) => <div data-testid="controlled-legacy-fallback" data-url={url}>{label}</div>,
}));

const descriptor = {
  schema_version: 2,
  plugin: { slug: "rcsb_pdb", name: "RCSB PDB", version: "1", description: "Structures", category: "reference_db" },
  renderer: "query", native_supported: true, outputs: [],
  inputs: [
    { id: "protein_name", component: "text", label: "Protein name", description: "Name of the protein", required: true, format: "text" },
    { id: "max_resolution", component: "number", label: "Maximum resolution", description: "Resolution bound", required: false, format: "float", max: 1000, step: "any", unit: "Å" },
    { id: "page_size", component: "number", label: "Page size", description: "Results per page", required: false, format: "integer", default: 20, min: 1, max: 100, step: 1 },
  ],
  capabilities: { query: true, detail: true },
  endpoints: { query: "/plugins/rcsb_pdb/api/ui-query/", detail: "/plugins/rcsb_pdb/api/ui-detail/{detail_id}/" },
  result: { presentation: "table", rows_path: "results", row_key: "pdb_id", detail_key: "pdb_id",
    columns: [{ key: "pdb_id", label: "PDB ID" }, { key: "score", label: "Score" }] },
  pagination: { component: "pagination", mode: "page" },
  filters: { component: "filters", title: "Structure filters", field_ids: ["max_resolution"] },
  detail: { component: "detail", title: "Structure detail", sections: [
    { id: "identity", title: "Structure identity", presentation: "scalar", fields: [
      { key: "title", label: "Title" }, { key: "assembly_count", label: "Assemblies" },
    ] },
    { id: "authors", title: "Primary citation authors", presentation: "table", optional: true,
      row_key: "position", max_rows: 100, columns: [{ key: "position", label: "Order" }, { key: "author", label: "Author" }] },
    { id: "provenance", title: "Provenance", presentation: "provenance", fields: [
      { key: "source", label: "Source database" }, { key: "retrieved_at", label: "Retrieved at" },
    ] },
  ] },
};
const page = (current = 1, id = "4HHB", total = 41) => ({
  results: [{ pdb_id: id, score: 0.123456789 }],
  pagination: { mode: "page", page: current, page_size: 20, total_items: total, has_previous: current > 1, has_next: current * 20 < total },
});

describe("validated Batch 1 page routing", () => {
  it.each([
    ["unknown component", value => { value.inputs[0].component = "constructor"; }],
    ["unsupported schema", value => { value.schema_version = 999; }],
    ["arbitrary endpoint", value => { value.endpoints.query = "https://example.test"; }],
    ["unknown renderer", value => { value.renderer = "custom_import"; }],
  ])("uses the supplied compatibility fallback for %s without issuing a query", async (_name, mutate) => {
    const invalid = JSON.parse(JSON.stringify(descriptor));
    mutate(invalid);
    fetch.mockResolvedValue(response(invalid));
    render(<PluginPage slug="rcsb_pdb" url="/_svc/workbench/plugins/rcsb-pdb/" label="RCSB PDB" onBack={vi.fn()} />);
    const fallback = await screen.findByTestId("controlled-legacy-fallback");
    expect(fallback).toHaveAttribute("data-url", "/_svc/workbench/plugins/rcsb-pdb/");
    expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe("/_svc/workbench/plugins/rcsb_pdb/api/ui-schema/");
  });
});
const response = (body, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body });
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function search(value = "kinase") {
  fireEvent.change(screen.getByLabelText(/Protein name/), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("Batch 1 query composition", () => {
  it("resets only declared filters to descriptor defaults without submitting", () => {
    render(<QueryRenderer descriptor={descriptor} />);
    fireEvent.change(screen.getByLabelText(/Protein name/), { target: { value: "kinase" } });
    fireEvent.change(screen.getByLabelText(/Maximum resolution/), { target: { value: "0.05" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByLabelText(/Protein name/)).toHaveValue("kinase");
    expect(screen.getByLabelText(/Maximum resolution/)).toHaveValue(null);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("composes shared fields, scalar table and backend pagination, preserving sub-decimal scientific inputs", async () => {
    fetch.mockResolvedValue(response(page()));
    render(<QueryRenderer descriptor={descriptor} />);
    expect(screen.getByLabelText(/Protein name/).tagName).toBe("INPUT");
    expect(screen.getByLabelText(/Page size/)).toHaveValue(20);
    expect(screen.getByRole("group", { name: "Structure filters" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Maximum resolution/), { target: { value: "0.05" } });
    search();
    expect(await screen.findByRole("table", { name: "Results" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "0.123456789" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Results pagination" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^View details for 4HHB/ })).toBeInTheDocument();
    expect(fetch.mock.calls[0][0]).toContain("max_resolution=0.05");
    expect(fetch.mock.calls[0][0]).toContain("page_size=20");
  });

  it("navigates committed query parameters, leaves edits unsubmitted, and resets a new query to page one", async () => {
    fetch.mockResolvedValueOnce(response(page()))
      .mockResolvedValueOnce(response(page(2, "1XYZ")))
      .mockResolvedValueOnce(response(page(1, "2ABC")));
    render(<QueryRenderer descriptor={descriptor} />);
    search("kinase");
    await screen.findByRole("cell", { name: "4HHB" });
    fireEvent.change(screen.getByLabelText(/Protein name/), { target: { value: "hemoglobin" } });
    fireEvent.change(screen.getByLabelText(/Page size/), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("cell", { name: "1XYZ" });
    const second = new URL(fetch.mock.calls[1][0], window.location.origin);
    expect(second.searchParams.get("protein_name")).toBe("kinase");
    expect(second.searchParams.get("page_size")).toBe("20");
    expect(second.searchParams.get("page")).toBe("2");
    expect(screen.getByLabelText(/Protein name/)).toHaveValue("hemoglobin");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("cell", { name: "2ABC" });
    const third = new URL(fetch.mock.calls[2][0], window.location.origin);
    expect(third.searchParams.get("protein_name")).toBe("hemoglobin");
    expect(third.searchParams.get("page_size")).toBe("10");
    expect(third.searchParams.has("page")).toBe(false);
    expect(screen.getByText("Page 1")).toHaveAttribute("aria-current", "page");
  });

  it("retains the committed page on navigation failure and retries the same backend page", async () => {
    fetch.mockResolvedValueOnce(response(page()))
      .mockResolvedValueOnce(response({ error: "Backend temporarily unavailable" }, false))
      .mockResolvedValueOnce(response(page(2, "1XYZ")));
    render(<QueryRenderer descriptor={descriptor} />);
    search();
    await screen.findByRole("cell", { name: "4HHB" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Backend temporarily unavailable");
    expect(screen.getByRole("cell", { name: "4HHB" })).toBeInTheDocument();
    expect(screen.getByText("Page 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("cell", { name: "1XYZ" });
    expect(fetch.mock.calls[1][0]).toBe(fetch.mock.calls[2][0]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("announces loading, disables duplicate navigation and restores previous-page controls", async () => {
    const pending = deferred();
    fetch.mockResolvedValueOnce(response(page(2, "1XYZ"))).mockReturnValueOnce(pending.promise);
    render(<QueryRenderer descriptor={descriptor} />);
    search();
    await screen.findByText("Page 2");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Loading results…")).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
    expect(screen.getByRole("cell", { name: "1XYZ" })).toBeInTheDocument();
    await act(async () => pending.resolve(response(page())));
    expect(screen.getByText("Page 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(new URL(fetch.mock.calls[1][0], window.location.origin).searchParams.get("page")).toBe("1");
  });

  it("keeps structured detail inert, composes scalar/table/provenance sections and transfers focus", async () => {
    const pending = deferred();
    fetch.mockResolvedValueOnce(response(page())).mockReturnValueOnce(pending.promise);
    const { container } = render(<QueryRenderer descriptor={descriptor} />);
    search();
    fireEvent.click(await screen.findByRole("button", { name: /^View/ }));
    expect(screen.getByText("Loading detail…")).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: /^View/ })).toBeDisabled();
    await act(async () => pending.resolve(response({
      identity: { title: "<script>alert(1)</script>", assembly_count: 2 },
      authors: [{ position: 1, author: "Ada Lovelace" }],
      provenance: { source: "RCSB Protein Data Bank", retrieved_at: "2026-10-07T00:00:00Z" },
    })));
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("Assemblies")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Primary citation authors" })).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("RCSB Protein Data Bank")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Structure detail" })).toHaveFocus();
    expect(fetch.mock.calls[1][0]).toBe("/_svc/workbench/plugins/rcsb_pdb/api/ui-detail/4HHB/");
  });

  it("shows and retries detail errors without discarding search results", async () => {
    fetch.mockResolvedValueOnce(response(page()))
      .mockResolvedValueOnce(response({ error: "Structure not available" }, false))
      .mockResolvedValueOnce(response({ identity: { title: "Hemoglobin", assembly_count: 2 }, provenance: { source: "RCSB" } }));
    render(<QueryRenderer descriptor={descriptor} />);
    search();
    fireEvent.click(await screen.findByRole("button", { name: /^View/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Structure not available");
    expect(screen.getByRole("cell", { name: "4HHB" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^View/ }));
    await screen.findByText("Hemoglobin");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("aborts obsolete detail when a new query begins and ignores its stale response", async () => {
    const pending = deferred();
    fetch.mockResolvedValueOnce(response(page())).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(page(1, "2ABC")));
    render(<QueryRenderer descriptor={descriptor} />);
    search();
    fireEvent.click(await screen.findByRole("button", { name: /^View/ }));
    const signal = fetch.mock.calls[1][1].signal;
    search("hemoglobin");
    await screen.findByRole("cell", { name: "2ABC" });
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(response({ identity: { title: "Obsolete detail" }, provenance: { source: "RCSB" } })));
    expect(screen.queryByText("Obsolete detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Structure detail" })).not.toBeInTheDocument();
  });

  it("aborts on descriptor change and unmount, ignoring stale query results", async () => {
    const old = deferred();
    const newer = deferred();
    fetch.mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
    const { rerender, unmount } = render(<QueryRenderer descriptor={descriptor} />);
    search();
    const oldSignal = fetch.mock.calls[0][1].signal;
    rerender(<QueryRenderer descriptor={{ ...descriptor }} />);
    expect(oldSignal.aborted).toBe(true);
    await act(async () => old.resolve(response(page(1, "STALE"))));
    expect(screen.queryByText("STALE")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Protein name/)).toHaveValue("");
    search("new query");
    const newSignal = fetch.mock.calls[1][1].signal;
    unmount();
    expect(newSignal.aborted).toBe(true);
    await act(async () => newer.resolve(response(page())));
  });

  it("announces empty results and rejects malformed server pagination", async () => {
    fetch.mockResolvedValueOnce(response({ results: [], pagination: { ...page().pagination, total_items: 0, has_next: false } }))
      .mockResolvedValueOnce(response({ ...page(), pagination: { ...page().pagination, next_url: "https://evil.test" } }));
    render(<QueryRenderer descriptor={descriptor} />);
    search();
    expect(await screen.findByText("No results.")).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    search("next query");
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid result data");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("fails closed when presentation lookup is unsupported", () => {
    render(<QueryRenderer descriptor={{ ...descriptor, result: { ...descriptor.result, presentation: "constructor" } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unsupported query presentation");
    expect(fetch).not.toHaveBeenCalled();
  });
});
