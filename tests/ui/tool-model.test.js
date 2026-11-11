import { describe, expect, it } from "vitest";
import {
  backendCounts, curlCommand, defaultValues, deriveBackends, emptyState, outputRows, runBlocker, schemaFields,
  toolPresentation, toolServers, toolVerification, validateInputs, valuesFromInputs,
} from "../../src/ui/pages/tools/toolModel";

const SERVERS = [
  { server_id: "enrichment_remote", adapter_type: "http_toolserver", available: true, capabilities: { tools: [{ tool_id: "ensembl_lookup" }] } },
  { server_id: "slurm_local", adapter_type: "slurm", available: false, unavailable_reason: "sinfo failed: DNS SRV lookup failed", capabilities: { tools: [{ tool_id: "fastqc" }] } },
  { server_id: "aws_batch_prod", adapter_type: "aws_batch", config: { job_definition_map: { fastqc: "jd" } }, capabilities: null },
  { server_id: "k8s_local", adapter_type: "k8s_job", config: { tools: { fastqc_k8s: {} } } },
];

describe("deriveBackends / presentation", () => {
  it("uses the tool blocks and server configs, never the URL", () => {
    expect(deriveBackends({ tool_id: "ensembl_lookup", http: { url: "https://x" } }, SERVERS)).toEqual(["HTTP"]);
    expect(deriveBackends({ tool_id: "fastqc", slurm: {} }, SERVERS)).toEqual(["Slurm", "AWS Batch"]);
    expect(deriveBackends({ tool_id: "fastqc_k8s", slurm: {} }, SERVERS)).toEqual(["Slurm", "Kubernetes"]);
    expect(deriveBackends({ tool_id: "plain", url: "https://x" })).toEqual([]);
    expect(deriveBackends({ tool_id: "x", backends: ["azure_batch", "kubernetes"] })).toEqual(["Azure Batch", "Kubernetes"]);
  });
  it("presents a card and counts backends", () => {
    const card = toolPresentation({ tool_id: "fastqc", display_name: "FastQC", description: "QC", tags: ["qc"], slurm: {} }, SERVERS);
    expect(card).toMatchObject({ id: "fastqc", name: "FastQC", category: "QC", backends: ["Slurm", "AWS Batch"] });
    expect(backendCounts([card, toolPresentation({ tool_id: "a", http: {} })])).toMatchObject({ HTTP: 1, Slurm: 1, "AWS Batch": 1, Kubernetes: 0 });
    expect(toolPresentation({ tool_id: "x" }).description).toBe("No description yet.");
  });
});

describe("schemaFields / validateInputs", () => {
  const tool = {
    inputs_schema: { properties: { input_file: { type: "string", description: "Path e.g. /data/a.fq" }, threads: { type: "integer", default: 4, minimum: 1, maximum: 64 },
      mode: { type: "string", enum: ["fast", "slow"] }, flags: { type: "array" }, verbose: { type: "boolean" } }, required: ["input_file"] },
    inputs: [{ name: "input_file", type: "string", required: true }, { name: "api_key", type: "string", secret: true }],
  };
  it("merges schema properties with the inputs list", () => {
    const fields = schemaFields(tool);
    expect(fields.map(f => f.name)).toEqual(["input_file", "threads", "mode", "flags", "verbose", "api_key"]);
    expect(fields[0]).toMatchObject({ required: true, type: "string", description: "Path e.g. /data/a.fq" });
    expect(fields[1]).toMatchObject({ type: "integer", default: 4, minimum: 1, maximum: 64, required: false });
    expect(fields[2].enum).toEqual(["fast", "slow"]);
    expect(fields[5].secret).toBe(true);
    expect(schemaFields({ inputs: [{ name: "accession", type: "string", required: true }] })[0]).toMatchObject({ name: "accession", required: true });
    expect(schemaFields({})).toEqual([]);
  });
  it("defaults, example values and validation", () => {
    const fields = schemaFields(tool);
    expect(defaultValues(fields)).toEqual({ input_file: "", threads: "4", mode: "", flags: "", verbose: false, api_key: "" });
    expect(valuesFromInputs(fields, { input_file: "/x", flags: ["a"], verbose: true, extra: 1 })).toMatchObject({ input_file: "/x", flags: "[\"a\"]", verbose: true, extra: "1" });
    expect(validateInputs(fields, defaultValues(fields)).errors).toEqual({ input_file: "Required." });
    const bad = validateInputs(fields, { input_file: "/x", threads: "2.5", mode: "turbo", flags: "{", verbose: "yes" });
    expect(bad.errors).toEqual({ threads: "Must be a whole number.", mode: "Must be one of: fast, slow.", flags: "Must be a JSON array, e.g. [\"a\", \"b\"]." });
    expect(validateInputs(fields, { input_file: "/x", threads: "99" }).errors.threads).toBe("Must be at most 64.");
    const good = validateInputs(fields, { input_file: " /x ", threads: "8", mode: "fast", flags: "[\"a\"]", verbose: true });
    expect(good).toEqual({ ok: true, errors: {}, inputs: { input_file: "/x", threads: 8, mode: "fast", flags: ["a"], verbose: true } });
    expect(validateInputs([{ name: "n", type: "number", required: false, enum: null, minimum: null, maximum: null }], { n: "abc" }).errors.n).toBe("Must be a number.");
  });
});

describe("outputs, servers, blockers, curl", () => {
  it("picks outputs from the schema, then slurm.outputs, then response_map", () => {
    expect(outputRows({ outputs_schema: { properties: { hits: { type: "array", description: "Hits" } } } })).toEqual([{ name: "hits", type: "array", description: "Hits" }]);
    expect(outputRows({ outputs_schema: { type: "object" }, slurm: { outputs: [{ name: "report_html", pattern: "*_fastqc.html" }] } })).toEqual([{ name: "report_html", type: "file", description: "Files matching *_fastqc.html in the run directory" }]);
    expect(outputRows({ response_map: { organism: "a.b" } })).toEqual([{ name: "organism", type: "", description: "From the service response" }]);
    expect(outputRows({})).toEqual([]);
  });
  it("servers come from the detail payload or are derived from /api/servers", () => {
    expect(toolServers({ tool_id: "fastqc", servers: [{ server_id: "s" }] })).toEqual([{ server_id: "s" }]);
    expect(toolServers({ tool_id: "fastqc" }, SERVERS)).toEqual([{ server_id: "slurm_local", display_name: "slurm_local", adapter_type: "slurm", available: false, unavailable_reason: "sinfo failed: DNS SRV lookup failed" }]);
  });
  it("blocks runs for unavailable and not-working tools", () => {
    expect(runBlocker(toolVerification({ verification: { status: "unavailable", reason: "slurm_local: sinfo failed" } }), [])).toEqual({ title: "Unavailable", detail: "slurm_local: sinfo failed" });
    expect(runBlocker(toolVerification({ verification: { status: "not_working", tested_at: "2026-11-09", reason: "HTTP 404" } }), [])).toEqual({ title: "Not working", detail: "This tool failed its last end-to-end run on 2026-11-09: HTTP 404" });
    expect(runBlocker(toolVerification({ verification: { status: "out_of_scope" } }), [{ server_id: "slurm_local", available: false, unavailable_reason: "down" }])).toEqual({ title: "Unavailable", detail: "slurm_local: down" });
    expect(runBlocker(toolVerification({ verification: { status: "runnable" } }), [{ server_id: "x", available: true }])).toBeNull();
  });
  it("curl never contains a real token", () => {
    const curl = curlCommand("ensembl_lookup", { symbol: "BRCA2" }, "https://webstudio.example.test");
    expect(curl).toContain("https://webstudio.example.test/_tes/api/runs/submit");
    expect(curl).toContain("Authorization: Bearer $OMNIBIOAI_TOKEN");
    expect(curl).toContain("\"symbol\": \"BRCA2\"");
    expect(curl).not.toMatch(/FAKE|eyJ/);
  });
});

describe("emptyState", () => {
  const base = { total: 10, afterStatus: 5, afterBackend: 5, afterCategory: 5, afterQuery: 0, showAll: false, backend: "Any", category: "All", query: "", servers: [] };
  it("explains which filter emptied the list", () => {
    expect(emptyState({ ...base, afterQuery: 1 })).toBeNull();
    expect(emptyState({ ...base, total: 0 }).title).toBe("No tools are available from TES right now.");
    expect(emptyState({ ...base, afterStatus: 0 })).toMatchObject({ title: "No runnable tools yet.", action: "show-all" });
    expect(emptyState({ ...base, afterBackend: 0, backend: "Slurm", servers: SERVERS })).toEqual({ title: "No runnable Slurm tools yet: the Slurm backend isn't available.", hint: "Show all to browse them.", action: "show-all" });
    expect(emptyState({ ...base, afterBackend: 0, backend: "Slurm" })).toMatchObject({ title: "No runnable Slurm tools yet.", action: "show-all" });
    expect(emptyState({ ...base, afterCategory: 0, category: "QC" })).toMatchObject({ title: "No runnable QC tools yet.", action: "show-all" });
    expect(emptyState({ ...base, afterCategory: 5, query: "zzz" })).toEqual({ title: "No tools match “zzz”.", hint: "Try another name, or clear the search.", action: "clear-search" });
    expect(emptyState({ ...base, showAll: true, afterCategory: 0, category: "QC", backend: "HTTP" }).title).toBe("No QC tools run on HTTP.");
    expect(emptyState({ ...base, showAll: true, afterBackend: 0, backend: "GCP Batch" }).title).toBe("No tools run on GCP Batch.");
    expect(emptyState({ ...base, showAll: true }).title).toBe("No tools match these filters.");
  });
});
