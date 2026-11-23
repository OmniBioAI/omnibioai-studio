import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AsyncAnalysisRenderer from "../../src/ui/components/workbench/AsyncAnalysisRenderer";
import { pluginSampleContentUrl, pluginSampleRunUrl, validatePluginDescriptor } from "../../src/ui/lib/pluginApi";
// Descriptors served by omnibioai-workbench feat/sample-data-framework
// (plugins/shared/plugin_ui.ui_schema, signed-in user without GPU permission).
import workbenchDescriptors from "../fixtures/workbench-sample-descriptors.json";

const endpoints = {
  submit: "/plugins/pilot/api/run/",
  status: "/plugins/pilot/api/status/{run_id}/",
  logs: "/plugins/pilot/api/log/{run_id}/",
  artifacts: "/plugins/pilot/api/artifacts/{run_id}/",
  download: "/plugins/pilot/api/ui-artifacts/{run_id}/{artifact_id}/download/",
};

const sample = {
  available: true,
  reason: null,
  code: null,
  label: "Testkit sample",
  description: "Synthetic testkit inputs: table.tsv.",
  provenance: "synthetic",
  licence: "Synthetic test data generated in this repository; no third-party content",
  runtime_restrictions: ["COSMIC referenced (check licence)"],
  synthetic_fixture: false,
  requires: { gpu: false, network: false },
  total_bytes: 2048,
  inputs: { input_file: { format: "tsv", file_names: ["table.tsv"], file_count: 1, bytes: 2048, pasteable: true } },
  params: { notes: "example note" },
};

function descriptorWith(overrides = {}) {
  return {
    schema_version: 1,
    plugin: { slug: "pilot", name: "Pilot", version: "1", description: "desc", category: "analysis" },
    renderer: "async_analysis",
    native_supported: true,
    inputs: [
      { id: "input_file", label: "Input File", description: "TSV", required: true, format: "tsv", component: "file", multiple: false, accept: ".tsv" },
      { id: "notes", label: "Notes", description: "Optional", required: false, format: "txt", component: "text" },
    ],
    outputs: [{ id: "output", label: "Output", description: "artifact", format: "tsv" }],
    capabilities: { submit: true, status: true, logs: true, artifacts: true, downloads: true },
    endpoints,
    artifacts: { presentation: "list", max_items: 100 },
    sample,
    ...overrides,
  };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("sample descriptor contract", () => {
  it("keeps a valid sample section", () => {
    const descriptor = descriptorWith();
    expect(validatePluginDescriptor(descriptor, "pilot").sample).toBe(sample);
  });

  it("drops a malformed sample section but keeps the form", () => {
    const bad = descriptorWith({ sample: { ...sample, inputs: { not_a_field: sample.inputs.input_file } } });
    const validated = validatePluginDescriptor(bad, "pilot");
    expect(validated.sample).toBeUndefined();
    expect(validated.inputs).toHaveLength(2);
    expect(validatePluginDescriptor(descriptorWith({ sample: { ...sample, available: "yes" } }), "pilot").sample).toBeUndefined();
    expect(validatePluginDescriptor(descriptorWith({ sample: { ...sample, available: false, reason: null } }), "pilot").sample).toBeUndefined();
  });

  it("builds fixed sample routes and rejects unsafe identities", () => {
    expect(pluginSampleRunUrl("pilot")).toMatch(/\/plugins\/pilot\/api\/ui-sample\/$/);
    expect(pluginSampleContentUrl("pilot", "input_file")).toMatch(/\/plugins\/pilot\/api\/ui-sample\/input_file\/$/);
    expect(() => pluginSampleRunUrl("../x")).toThrow();
    expect(() => pluginSampleContentUrl("pilot", "../etc")).toThrow();
  });
});

describe("Use sample data", () => {
  it("shows label, description, licence and runtime restrictions", () => {
    render(<AsyncAnalysisRenderer descriptor={descriptorWith()} />);
    const panel = screen.getByRole("region", { name: "Sample data" });
    expect(panel).toHaveTextContent("Sample data: Testkit sample");
    expect(panel).toHaveTextContent("Synthetic testkit inputs: table.tsv.");
    expect(panel).toHaveTextContent("Licence: Synthetic test data");
    expect(panel).toHaveTextContent("Runtime restrictions");
    expect(panel).toHaveTextContent("COSMIC referenced (check licence)");
  });

  it("posts to the sample route with CSRF and follows the returned run", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run_id: "run-9", status: "running", sample: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: "FAILED", detail: "boom" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ lines: ["sample log"] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AsyncAnalysisRenderer descriptor={descriptorWith()} />);
    fireEvent.click(screen.getByRole("button", { name: "Use sample data" }));
    expect(await screen.findByText("sample log")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/plugins\/pilot\/api\/ui-sample\/$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(fetchMock.mock.calls[0][1].headers).toHaveProperty("X-CSRFToken");
    expect(fetchMock.mock.calls[1][0]).toContain("/api/status/run-9/");
  });

  it("shows the server's refusal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: "Too many sample runs; try again later." }) }));
    render(<AsyncAnalysisRenderer descriptor={descriptorWith()} />);
    fireEvent.click(screen.getByRole("button", { name: "Use sample data" }));
    expect(await screen.findByText("Too many sample runs; try again later.")).toBeInTheDocument();
  });

  it("is disabled with the reason when the sample cannot run", () => {
    const reason = "This plugin runs on a GPU. Ask an administrator for the GPU job permission.";
    render(<AsyncAnalysisRenderer descriptor={descriptorWith({ sample: { ...sample, available: false, reason, code: "gpu_permission_required" } })} />);
    const button = screen.getByRole("button", { name: "Use sample data" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(reason);
  });

  it("offers no paste or fill when the sample cannot run", () => {
    const reason = "The sample run has not passed testing on this release (testkit verdict: fail-real-bug (UNFIXED, enabled)).";
    render(<AsyncAnalysisRenderer descriptor={descriptorWith({ sample: { ...sample, available: false, reason, code: "verdict_blocked" } })} />);
    expect(screen.queryByRole("button", { name: /Paste example/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fill example values" })).toBeNull();
    expect(screen.getByText(reason)).toBeInTheDocument();
  });

  it("renders no sample controls without a sample section", () => {
    render(<AsyncAnalysisRenderer descriptor={descriptorWith({ sample: undefined })} />);
    expect(screen.queryByRole("button", { name: "Use sample data" })).toBeNull();
  });
});

describe("Paste example", () => {
  it("loads the example text, lets the user edit it, and submits it as the file", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ input_id: "input_file", file_name: "table.tsv", format: "tsv", text: "a\tb\n1\t2\n" }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: "validation" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AsyncAnalysisRenderer descriptor={descriptorWith()} />);
    fireEvent.click(screen.getByRole("button", { name: "Paste example: Input File" }));
    const pastedBox = await screen.findByLabelText("Pasted example for Input File (table.tsv)");
    expect(pastedBox).toHaveValue("a\tb\n1\t2\n");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/plugins\/pilot\/api\/ui-sample\/input_file\/$/);
    await user.type(pastedBox, "3 4");
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = fetchMock.mock.calls[1][1].body;
    expect(fetchMock.mock.calls[1][0]).toContain("/plugins/pilot/api/run/");
    const file = body.get("input_input_file");
    expect(file.name).toBe("table.tsv");
    expect(await file.text()).toBe("a\tb\n1\t2\n3 4");
  });

  it("fills example form values", () => {
    render(<AsyncAnalysisRenderer descriptor={descriptorWith()} />);
    fireEvent.click(screen.getByRole("button", { name: "Fill example values" }));
    expect(screen.getByLabelText(/Notes/)).toHaveValue("example note");
  });

  it("offers no paste for inputs that are not pasteable", () => {
    const notPasteable = { ...sample, inputs: { input_file: { ...sample.inputs.input_file, pasteable: false } } };
    render(<AsyncAnalysisRenderer descriptor={descriptorWith({ sample: notPasteable })} />);
    expect(screen.queryByRole("button", { name: /Paste example/ })).toBeNull();
  });
});

describe("workbench sample descriptors", () => {
  it.each(Object.keys(workbenchDescriptors))("%s keeps its sample section", slug => {
    const descriptor = structuredClone(workbenchDescriptors[slug]);
    const validated = validatePluginDescriptor(descriptor, slug);
    expect(validated.sample).toEqual(workbenchDescriptors[slug].sample);
  });

  it("shows why a blocked sample cannot run", () => {
    const descriptor = validatePluginDescriptor(structuredClone(workbenchDescriptors.fastq_qc), "fastq_qc");
    render(<AsyncAnalysisRenderer descriptor={descriptor} />);
    expect(screen.getByRole("button", { name: "Use sample data" })).toBeDisabled();
    expect(screen.getByText(/testkit verdict/)).toBeInTheDocument();
  });
});
