import { describe, expect, it } from "vitest";
import { validatePluginDescriptor } from "../../src/ui/lib/pluginApi";

const text = (id, extra = {}) => ({ id, component: "text", label: id, description: "x", required: true, format: "text", ...extra });
const number = (id = "page_size", extra = {}) => ({ id, component: "number", label: id, description: "x", required: false, format: "integer", default: 20, min: 1, max: 100, step: 1, ...extra });

function searchOperation() {
  return {
    id: "search_items", label: "Search items",
    inputs: [text("query"), number()],
    result: { presentation: "table", rows_path: "results", row_key: "item_id", columns: [{ key: "item_id", label: "Item ID" }, { key: "name", label: "Name" }] },
    pagination: { component: "pagination", mode: "page" },
  };
}

function detailOperation() {
  return {
    id: "get_item", label: "Get item",
    inputs: [text("item_id")],
    result: { presentation: "table", rows_path: "results", row_key: "item_id", detail_key: "item_id",
      columns: [{ key: "item_id", label: "Item ID" }, { key: "name", label: "Name" }, { key: "status", label: "Status" }] },
    detail: { component: "detail", title: "Item detail", fields: [{ key: "item_id", label: "Item ID" }, { key: "name", label: "Name" }, { key: "status", label: "Status" }] },
  };
}

function descriptor(slug = "fixture_multi_op") {
  return {
    schema_version: 2, plugin: { slug, name: "Fixture", version: "1", description: "Test fixture", category: "reference_db" },
    renderer: "query", native_supported: true, outputs: [],
    capabilities: { query: true, detail: true },
    endpoints: { query: `/plugins/${slug}/api/ui-query/`, detail: `/plugins/${slug}/api/ui-detail/{detail_id}/` },
    operations: [searchOperation(), detailOperation()],
    default_operation: "search_items",
  };
}

describe("schema-v2 multi-operation descriptor validation", () => {
  it("accepts a valid two-operation descriptor", () => {
    const value = descriptor();
    expect(validatePluginDescriptor(value, "fixture_multi_op")).toBe(value);
  });

  it("accepts a legacy single-operation descriptor unchanged", () => {
    const value = {
      schema_version: 2, plugin: { slug: "rcsb_pdb", name: "x", version: "1", description: "x", category: "reference_db" },
      renderer: "query", native_supported: true, outputs: [],
      inputs: [text("pdb_id")],
      capabilities: { query: true },
      endpoints: { query: "/plugins/rcsb_pdb/api/ui-query/" },
      result: { presentation: "table", rows_path: "results", row_key: "pdb_id", columns: [{ key: "pdb_id", label: "PDB ID" }] },
    };
    expect(validatePluginDescriptor(value, "rcsb_pdb")).toBe(value);
  });

  it.each([
    ["duplicate operation id", d => { d.operations[1].id = "search_items"; }],
    ["operation id shadows the reserved selector", d => { d.operations[0].id = "operation"; }],
    ["unknown default operation", d => { d.default_operation = "does_not_exist"; }],
    ["input field id shadows the reserved selector", d => { d.operations[0].inputs.push(text("operation", { required: false })); }],
    ["empty operations collection", d => { d.operations = []; }],
    ["operations without default_operation", d => { delete d.default_operation; }],
    ["default_operation without operations", d => { delete d.operations; d.inputs = [text("query")]; d.result = searchOperation().result; }],
    ["mixing legacy and operations shapes", d => { d.inputs = [text("query")]; d.result = searchOperation().result; }],
    ["capabilities.detail mismatched with any-operation-has-detail", d => { d.operations = [searchOperation()]; d.default_operation = "search_items"; }],
  ])("rejects: %s", (_name, mutate) => {
    const value = descriptor();
    mutate(value);
    expect(() => validatePluginDescriptor(value, "fixture_multi_op")).toThrow();
  });
});
