import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validatePluginDescriptor } from "../../src/ui/lib/pluginApi";
import { queryDetail, queryPlugin, queryRequestUrl } from "../../src/ui/lib/pluginQueryApi";
import { isDataPath, rowKeys, scalarText, validBatchField, validPagination } from "../../src/ui/lib/pluginUiContracts";

const text = (id, extra = {}) => ({ id, component: "text", label: id, description: "Scientific query", required: false, format: "text", ...extra });
const number = (extra = {}) => ({ ...text("page_size"), component: "number", format: "integer", default: 20, min: 1, max: 100, step: 1, ...extra });
const proof = (slug = "rcsb_pdb") => ({
  schema_version: 2, plugin: { slug, name: slug, version: "1", description: "Public scientific query", category: "reference_db" },
  native_supported: true, renderer: "query", outputs: [],
  inputs: slug === "ensembl" ? [text("species", { default: "human", required: true }), text("symbol", { required: true }), number()]
    : [text("pdb_id"), text("protein_name"), text("organism"), number({ id: "max_resolution", format: "float", default: undefined, min: undefined, max: 1000, step: "any", unit: "Å" }), number()],
  capabilities: slug === "ensembl" ? { query: true } : { query: true, detail: true },
  endpoints: { query: `/plugins/${slug}/api/ui-query/`, ...(slug === "ensembl" ? {} : { detail: `/plugins/${slug}/api/ui-detail/{detail_id}/` }) },
  result: { presentation: "table", rows_path: "results", row_key: slug === "ensembl" ? "ensembl_id" : "pdb_id",
    ...(slug === "ensembl" ? {} : { detail_key: "pdb_id" }),
    columns: slug === "ensembl" ? [{ key: "ensembl_id", label: "Ensembl ID" }, { key: "symbol", label: "Gene symbol" }]
      : [{ key: "pdb_id", label: "PDB ID" }, { key: "score", label: "Score" }] },
  ...(slug === "ensembl" ? {} : {
    pagination: { component: "pagination", mode: "page" },
    filters: { component: "filters", title: "Filters", field_ids: ["organism", "max_resolution"] },
    detail: { component: "detail", title: "Structure detail", fields: [
      { key: "pdb_id", label: "PDB ID" }, { key: "title", label: "Title" },
    ] },
  }),
});
const page = (extra = {}) => ({ mode: "page", page: 1, page_size: 20, total_items: 1, has_previous: false, has_next: false, ...extra });
const response = (payload, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => payload });

describe("Batch 1 descriptor boundary", () => {
  it.each(["ensembl", "rcsb_pdb"])("validates the complete %s proof descriptor", slug => {
    const descriptor = proof(slug);
    expect(validatePluginDescriptor(descriptor, slug)).toBe(descriptor);
  });

  it("preserves the Batch 1 v2 descriptor without optional detail/filter presentation", () => {
    const descriptor = proof();
    delete descriptor.detail;
    delete descriptor.filters;
    expect(validatePluginDescriptor(descriptor, "rcsb_pdb")).toBe(descriptor);
  });

  it.each([0, 3, "2", null, undefined])("rejects unsupported schema version %s", schema_version => {
    expect(() => validatePluginDescriptor({ ...proof(), schema_version }, "rcsb_pdb")).toThrow();
  });

  it.each([
    ["unknown renderer", value => { value.renderer = "dashboard"; }],
    ["prototype renderer", value => { value.renderer = "constructor"; }],
    ["unknown component", value => { value.inputs[0].component = "SearchField"; }],
    ["prototype component", value => { value.inputs[0].component = "__proto__"; }],
    ["non-string input id", value => { value.inputs[0].id = ["symbol"]; }],
    ["prototype-like array input id", value => { value.inputs[0].id = ["constructor"]; }],
    ["duplicate input", value => { value.inputs.push(value.inputs[0]); }],
    ["undeclared default type", value => { value.inputs[0].default = 42; }],
    ["extra root key", value => { value.some_future_feature = true; }],
    ["extra input key", value => { value.inputs[0].semantic = "accession"; }],
    ["arbitrary endpoint", value => { value.endpoints.query = "https://api.example.test/"; }],
    ["upstream query URL", value => { value.endpoints.query += "?url=https://example.test"; }],
    ["cross-plugin endpoint", value => { value.endpoints.query = "/plugins/ensembl/api/ui-query/"; }],
    ["legacy hyphen mount", value => { value.endpoints.query = "/plugins/rcsb-pdb/search/"; }],
    ["inconsistent detail", value => { delete value.endpoints.detail; }],
    ["arbitrary result", value => { value.result.presentation = "html"; }],
    ["unknown result key", value => { value.result.actions = []; }],
    ["unknown row path", value => { value.result.rows_path = "payload.records"; }],
    ["prototype row key", value => { value.result.row_key = "constructor.name"; }],
    ["undisplayed row key", value => { value.result.row_key = "unrepresented_id"; }],
    ["undisplayed detail key", value => { value.result.detail_key = "unrepresented_id"; }],
    ["duplicate column", value => { value.result.columns.push(value.result.columns[0]); }],
    ["empty columns", value => { value.result.columns = []; }],
    ["raw HTML column", value => { value.result.columns[0].html = "<b>value</b>"; }],
    ["cursor mode", value => { value.pagination.mode = "cursor"; }],
    ["offset mode", value => { value.pagination.mode = "offset"; }],
    ["pagination URL", value => { value.pagination.next_url = "/upstream/"; }],
    ["prototype pagination", value => { value.pagination.component = "constructor"; }],
    ["unknown filter component", value => { value.filters.component = "FilterBuilder"; }],
    ["unknown filter field", value => { value.filters.field_ids = ["unknown"]; }],
    ["unsupported textarea filter", value => { value.inputs.find(input => input.id === "organism").component = "textarea"; }],
    ["duplicate filter field", value => { value.filters.field_ids.push(value.filters.field_ids[0]); }],
    ["filter expression", value => { value.filters.expression = "score > 1"; }],
    ["unknown detail component", value => { value.detail.component = "CustomDetail"; }],
    ["prototype detail field", value => { value.detail.fields[0].key = "constructor"; }],
    ["detail formatter", value => { value.detail.fields[0].formatter = "javascript"; }],
    ["colliding page parameter", value => { value.inputs.push(number({ id: "page" })); }],
    ["missing page-size field", value => { value.inputs = value.inputs.filter(input => input.id !== "page_size"); }],
    ["text page-size field", value => { value.inputs = value.inputs.map(input => input.id === "page_size" ? text("page_size") : input); }],
  ])("fails closed for %s", (_name, mutate) => {
    const descriptor = proof();
    mutate(descriptor);
    expect(() => validatePluginDescriptor(descriptor, "rcsb_pdb")).toThrow();
  });

  it.each(["jsx", "javascript", "eval", "function", "callback", "callbacks", "html", "script_url", "module_path",
    "upstream_url", "filesystem_path", "password", "token", "api_key", "credentials", "secret", "constructor", "__proto__"])(
    "rejects forbidden %s metadata, even nested", key => {
      const descriptor = proof();
      descriptor.inputs[0] = { ...descriptor.inputs[0], [key]: "forbidden" };
      expect(() => validatePluginDescriptor(descriptor, "rcsb_pdb")).toThrow();
    });

  it("preserves the original v1 query contract without enabling v2 fields or pagination", () => {
    const legacy = {
      ...proof("ensembl"), schema_version: 1, inputs: [text("symbol", { query_key: "symbol", choices: [] })],
      endpoints: { query: "/plugins/ensembl/search/" },
      result: { presentation: "table", rows_path: "results", columns: [{ key: "symbol", label: "Symbol" }] },
    };
    expect(validatePluginDescriptor(legacy, "ensembl")).toBe(legacy);
    expect(() => validatePluginDescriptor({ ...legacy, inputs: [number()] }, "ensembl")).toThrow();
    expect(() => validatePluginDescriptor({ ...legacy, pagination: { component: "pagination", mode: "page" } }, "ensembl")).toThrow();
  });
});

describe("finite field and data contracts", () => {
  it.each([
    text("symbol"), text("sequence", { component: "textarea", default: "A\nC" }),
    text("species", { component: "select", choices: ["human", "mouse"], default: "human" }),
    number(), number({ format: "float", min: undefined, max: 1000, default: 0.05, step: "any", unit: "Å" }),
  ])("accepts %s", field => expect(validBatchField(field)).toBe(true));

  it.each(["symbol", "sequence_id", "a1", "rcsb_pdb"])("accepts deterministic field id %s", id => {
    expect(validBatchField(text(id))).toBe(true);
  });

  it.each([
    number({ min: "1" }), number({ max: Infinity }), number({ default: NaN }), number({ min: 100, max: 1 }),
    number({ default: 101 }), number({ default: 0 }), number({ default: 2.5 }), number({ step: "any" }),
    number({ step: 0 }), number({ step: -1 }), number({ step: 0.5 }), number({ unit: "a".repeat(33) }),
    number({ format: "decimal" }), text("constructor"), text("password"), text("api_key"), text("secret"), text("token"), text("credentials"), text("symbol", { default: {} }),
    text("species", { component: "select", choices: ["human", "human"] }),
    text("species", { component: "select", choices: ["human"], default: "mouse" }),
  ])("rejects malformed field %s", field => expect(validBatchField(field)).toBe(false));

  it.each([
    null, undefined, true, false, 1, ["symbol"], ["token"], ["constructor"], {},
    "", "1symbol", "Symbol", "gene-id", "gene.id", "gene/id", "a b", "__proto__", "prototype",
  ])("rejects malformed or reserved field id %s", id => {
    expect(validBatchField(text(id))).toBe(false);
  });

  it("does not traverse prototypes or stringify structured values", () => {
    expect(isDataPath("metadata.symbol")).toBe(true);
    for (const path of ["constructor.name", "metadata.__proto__.token", "a..b", "items[0]", "/etc/passwd"]) expect(isDataPath(path)).toBe(false);
    expect(rowKeys([{ id: 1 }, { id: "1" }], "id")).toEqual(["number:1", "string:1"]);
    expect(rowKeys([{ id: NaN }], "id")).toBeNull();
    expect(rowKeys([Object.create({ id: "inherited" })], "id")).toBeNull();
    expect(scalarText({ toString: () => { throw new Error("Must not invoke"); } })).toBe("—");
    expect(validPagination(page({ has_next: true }))).toBe(false);
  });
});

describe("query API adapter", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("constructs only declared local parameters and preserves scientific values and defaults", () => {
    const url = queryRequestUrl(proof(), { protein_name: "  kinase & receptor  ", max_resolution: "5e-2", token: "never sent" }, 2);
    expect(url).toBe("/_svc/workbench/plugins/rcsb_pdb/api/ui-query/?protein_name=kinase+%26+receptor&max_resolution=5e-2&page_size=20&page=2");
    expect(url).not.toContain("token");
    expect(() => queryRequestUrl(proof(), { protein_name: {} })).toThrow("Invalid query value");
    expect(() => queryRequestUrl(proof(), {}, 0)).toThrow("Invalid query page");
    expect(() => queryRequestUrl(proof("ensembl"), {}, 2)).toThrow("Invalid query page");
  });

  it("validates server pagination and uses same-origin credentials with abort propagation", async () => {
    const signal = new AbortController().signal;
    const data = { results: [{ pdb_id: "4HHB", score: 1 }], pagination: page() };
    fetch.mockResolvedValue(response(data));
    await expect(queryPlugin(proof(), { pdb_id: "4HHB" }, { signal })).resolves.toBe(data);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/ui-query/?pdb_id=4HHB"), expect.objectContaining({ credentials: "same-origin", signal }));
  });

  it.each([
    null, [], { results: {} }, { results: [null] },
    { results: [{ pdb_id: "a" }, { pdb_id: "a" }], pagination: page() },
    { results: [{ pdb_id: "a" }], pagination: page({ next_url: "https://evil.test" }) },
    { results: [{ pdb_id: "a" }], pagination: page({ mode: "cursor" }) },
  ])("rejects malformed responses %s", async payload => {
    fetch.mockResolvedValue(response(payload));
    await expect(queryPlugin(proof(), {})).rejects.toThrow();
  });

  it("reports backend errors and malformed JSON without accepting executable response content", async () => {
    fetch.mockResolvedValueOnce(response({ error: "Resolution must be positive" }, false))
      .mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError("JSON"); } });
    await expect(queryPlugin(proof(), {})).rejects.toThrow("Resolution must be positive");
    await expect(queryPlugin(proof(), {})).rejects.toThrow("invalid response");
  });

  it("uses the fixed detail operation and rejects disabled or malformed detail identifiers", async () => {
    fetch.mockResolvedValue(response({ pdb_id: "4HHB", title: "Hemoglobin" }));
    await queryDetail(proof(), "4HHB");
    expect(fetch).toHaveBeenCalledWith("/_svc/workbench/plugins/rcsb_pdb/api/ui-detail/4HHB/", expect.objectContaining({ credentials: "same-origin" }));
    for (const id of ["", null, {}, "../secret", "https://evil.test/path"]) await expect(queryDetail(proof(), id)).rejects.toThrow();
    await expect(queryDetail(proof("ensembl"), "ENSG1")).rejects.toThrow("Invalid detail identifier");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    { pdb_id: "4HHB", title: {} },
    { pdb_id: "4HHB", title: [] },
    { pdb_id: "4HHB", title: "Safe", raw: { html: "<b>no</b>" } },
  ])("rejects structured or undeclared detail response data", async payload => {
    fetch.mockResolvedValue(response(payload));
    await expect(queryDetail(proof(), "4HHB")).rejects.toThrow("invalid response");
  });
});
