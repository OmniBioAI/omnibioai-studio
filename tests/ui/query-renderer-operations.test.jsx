import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import QueryRenderer from "../../src/ui/components/workbench/QueryRenderer";

const descriptor = {
  schema_version: 2,
  plugin: { slug: "fixture_multi_op", name: "Fixture", version: "1", description: "Test fixture", category: "reference_db" },
  renderer: "query", native_supported: true, outputs: [],
  capabilities: { query: true, detail: true },
  endpoints: { query: "/plugins/fixture_multi_op/api/ui-query/", detail: "/plugins/fixture_multi_op/api/ui-detail/{detail_id}/" },
  operations: [
    {
      id: "search_items", label: "Search items",
      inputs: [{ id: "query", component: "text", label: "Query", description: "Search text", required: true, format: "text" }],
      result: { presentation: "table", rows_path: "results", row_key: "item_id",
        columns: [{ key: "item_id", label: "Item ID" }, { key: "name", label: "Name" }] },
    },
    {
      id: "get_item", label: "Get item",
      inputs: [{ id: "item_id", component: "text", label: "Item ID", description: "Exact id", required: true, format: "text" }],
      result: { presentation: "table", rows_path: "results", row_key: "item_id", detail_key: "item_id",
        columns: [{ key: "item_id", label: "Item ID" }, { key: "name", label: "Name" }, { key: "status", label: "Status" }] },
      detail: { component: "detail", title: "Item detail", fields: [
        { key: "item_id", label: "Item ID" }, { key: "name", label: "Name" }, { key: "status", label: "Status" },
      ] },
    },
  ],
  default_operation: "search_items",
};

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("QueryRenderer multi-operation support", () => {
  it("renders only the server-defined operations, defaulting to default_operation", () => {
    render(<QueryRenderer descriptor={descriptor} />);
    const select = screen.getByLabelText("Operation");
    expect(select.value).toBe("search_items");
    expect(Array.from(select.options).map(option => option.value)).toEqual(["search_items", "get_item"]);
    expect(screen.getByLabelText(/Query/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Item ID/)).not.toBeInTheDocument();
  });

  it("switching operations swaps the rendered inputs and resets prior results", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ item_id: "A1", name: "Alpha" }], total_hits: 1 }) });
    render(<QueryRenderer descriptor={descriptor} />);
    fireEvent.change(screen.getByLabelText(/Query/), { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Alpha");
    expect(fetch).toHaveBeenCalledWith(
      "/_svc/workbench/plugins/fixture_multi_op/api/ui-query/?query=alpha&operation=search_items",
      expect.objectContaining({ credentials: "same-origin" }),
    );

    fireEvent.change(screen.getByLabelText("Operation"), { target: { value: "get_item" } });
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Query/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Item ID/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Item ID/)).toHaveValue("");
  });

  it("issues the newly-selected operation's own request with its own fields and operation id", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ item_id: "A1", name: "Alpha", status: "active" }], total_hits: 1 }) });
    render(<QueryRenderer descriptor={descriptor} />);
    fireEvent.change(screen.getByLabelText("Operation"), { target: { value: "get_item" } });
    fireEvent.change(screen.getByLabelText(/Item ID/), { target: { value: "A1" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Alpha");
    expect(fetch).toHaveBeenCalledWith(
      "/_svc/workbench/plugins/fixture_multi_op/api/ui-query/?item_id=A1&operation=get_item",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("only offers a detail lookup for operations that declare one", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ item_id: "A1", name: "Alpha" }], total_hits: 1 }) });
    render(<QueryRenderer descriptor={descriptor} />);
    fireEvent.change(screen.getByLabelText(/Query/), { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Alpha");
    expect(screen.queryByRole("button", { name: /^View/ })).not.toBeInTheDocument();
  });

  it("requests the detail endpoint with the active operation id", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ item_id: "A1", name: "Alpha", status: "active" }], total_hits: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ item_id: "A1", name: "Alpha", status: "active" }) });
    render(<QueryRenderer descriptor={descriptor} />);
    fireEvent.change(screen.getByLabelText("Operation"), { target: { value: "get_item" } });
    fireEvent.change(screen.getByLabelText(/Item ID/), { target: { value: "A1" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Alpha");
    fireEvent.click(screen.getByRole("button", { name: /^View/ }));
    await waitFor(() => expect(screen.getByText("active")).toBeInTheDocument());
    expect(fetch).toHaveBeenLastCalledWith(
      "/_svc/workbench/plugins/fixture_multi_op/api/ui-detail/A1/?operation=get_item",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
});
