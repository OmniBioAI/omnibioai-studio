import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AsyncAnalysisRenderer from "../../src/ui/components/workbench/AsyncAnalysisRenderer";
import PluginField from "../../src/ui/components/workbench/PluginField";
import PluginForm from "../../src/ui/components/workbench/PluginForm";
import { validatePluginDescriptor } from "../../src/ui/lib/pluginApi";
import { validateResourcePayload } from "../../src/ui/lib/pluginUiContracts";

const resourceField = (overrides = {}) => ({
  id: "source_run_id", widget: "resource_select", format: "text",
  label: "Source run", description: "A prior completed run to use as input.",
  required: true, multiple: false, resource_type: "run",
  endpoint: "/plugins/report_builder/api/ui-resources/run/", ...overrides,
});

const descriptor = {
  schema_version: 1,
  plugin: { slug: "report_builder", name: "Report builder", version: "1.0.0", description: "Proof", category: "analysis" },
  renderer: "generic_runner", native_supported: true,
  inputs: [resourceField()], outputs: [],
  capabilities: { submit: true, status: true, logs: true, artifacts: true, downloads: true },
  endpoints: {
    submit: "/plugins/report_builder/api/run/",
    status: "/plugins/report_builder/api/status/{run_id}/",
    logs: "/plugins/report_builder/api/log/{run_id}/",
    artifacts: "/plugins/report_builder/api/artifacts/{run_id}/",
    download: "/plugins/report_builder/api/ui-artifacts/{run_id}/{artifact_id}/download/",
  },
  artifacts: { presentation: "list", max_items: 100 },
};

const resources = [
  { id: "run-aaa", label: "Multiqc Wrapper run — 2026-10-05 14:32 UTC", source_plugin: "multiqc_wrapper" },
  { id: "run-bbb", label: "Multiqc Wrapper run — 2026-09-30 09:10 UTC", source_plugin: "multiqc_wrapper" },
];

function mockFetchOnce(body, { ok = true, status = 200 } = {}) {
  return vi.fn().mockResolvedValue({ ok, status, json: async () => body });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("ResourceSelectField", () => {
  it("shows a loading state, then populates native options from the fixed discovery endpoint", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ results: resources }));
    render(<PluginField input={resourceField()} value="" />);
    expect(screen.getByRole("combobox", { name: "Source run" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading options");
    await waitFor(() => expect(screen.getByRole("combobox")).not.toHaveAttribute("aria-busy"));
    const options = within(screen.getByRole("combobox")).getAllByRole("option");
    expect(options.map(option => option.textContent)).toEqual(["Select…", resources[0].label, resources[1].label]);
    expect(fetch).toHaveBeenCalledWith(
      "/_svc/workbench/plugins/report_builder/api/ui-resources/run/",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
  });

  it("supports keyboard selection and reports only the opaque id", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ results: resources }));
    const onValueChange = vi.fn();
    function Controlled() {
      const [value, setValue] = React.useState("");
      return <PluginField input={resourceField()} value={value} onValueChange={next => { setValue(next); onValueChange(next); }} />;
    }
    render(<Controlled />);
    await waitFor(() => expect(screen.getByRole("combobox")).not.toBeDisabled());
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("combobox")).toHaveFocus();
    await user.selectOptions(screen.getByRole("combobox"), "run-bbb");
    expect(onValueChange).toHaveBeenCalledWith("run-bbb");
  });

  it("shows an accessible empty state and disables the control", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ results: [] }));
    render(<PluginField input={resourceField()} value="" />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No eligible resources"));
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("shows an accessible error state with retry, and recovers on success", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ results: resources }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<PluginField input={resourceField()} value="" />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Unable to load options"));
    expect(screen.getByRole("combobox")).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("combobox")).not.toBeDisabled());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails safely and renders no options when the server response is malformed", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({
      results: [{ id: "run-aaa", label: "ok", source_plugin: "multiqc_wrapper", path: "/srv/private" }],
    }));
    render(<PluginField input={resourceField()} value="" />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByRole("option", { name: "ok" })).not.toBeInTheDocument();
  });

  it("renders long scientific resource labels in full, without truncation", async () => {
    const longLabel = "Multiqc Wrapper run — fastq_qc_2026_full_cohort_batch_017_resequenced_lane_08 — 2026-10-05 14:32 UTC";
    vi.stubGlobal("fetch", mockFetchOnce({ results: [{ id: "run-long", label: longLabel, source_plugin: "multiqc_wrapper" }] }));
    render(<PluginField input={resourceField()} value="" />);
    await waitFor(() => expect(screen.getByRole("option", { name: longLabel })).toBeInTheDocument());
  });

  it("is disabled while the form submits and supports the required/invalid/read-only states", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ results: resources }));
    const { rerender } = render(<PluginField input={resourceField()} value="" disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    rerender(<PluginField input={resourceField()} value="" error="Source run is required." />);
    await waitFor(() => expect(screen.getByRole("combobox")).not.toBeDisabled());
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("combobox")).toHaveAccessibleDescription(/Source run is required/);
    rerender(<PluginField input={resourceField()} value="" readOnly />);
    await waitFor(() => expect(screen.getByRole("combobox")).toBeDisabled());
  });

  it("enforces accessible required-empty validation through PluginForm", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ results: resources }));
    const onSubmit = vi.fn();
    render(<PluginForm inputs={[resourceField()]} values={{ source_run_id: "" }} onSubmit={onSubmit} />);
    await waitFor(() => expect(screen.getByRole("combobox")).not.toBeDisabled());
    await userEvent.setup().click(screen.getByRole("button", { name: "Run analysis" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toHaveAccessibleDescription(/Source run is required/);
  });
});

describe("resource response contract", () => {
  it("accepts exact safe metadata and rejects paths, urls, callbacks, and duplicate ids", () => {
    expect(validateResourcePayload({ results: resources })).toEqual(resources);
    for (const invalid of [
      { results: [{ ...resources[0], path: "/srv/private" }] },
      { results: [{ ...resources[0], download_url: "https://storage.example/private" }] },
      { results: [{ ...resources[0], callback: "javascript:alert(1)" }] },
      { results: [{ ...resources[0], id: "../escape" }] },
      { results: [{ ...resources[0], source_plugin: "Not-A-Slug" }] },
      { results: [resources[0], resources[0]] },
      { results: Array.from({ length: 101 }, (_, index) => ({ ...resources[0], id: `run-${index}` })) },
    ]) {
      expect(() => validateResourcePayload(invalid)).toThrow("Invalid resource response.");
    }
  });
});

describe("resource_select descriptor and submission boundary", () => {
  it("accepts only the exact contract and rejects a client-supplied endpoint or source plugin", () => {
    expect(validatePluginDescriptor(descriptor, "report_builder").inputs).toHaveLength(1);
    for (const invalid of [
      { ...resourceField(), endpoint: "https://evil.example/" },
      { ...resourceField(), endpoint: "/plugins/other_slug/api/ui-resources/run/" },
      { ...resourceField(), resource_type: "dataset" },
      { ...resourceField(), multiple: true },
      { ...resourceField(), choices: [{ value: "a", label: "A" }] },
      { ...resourceField(), source_plugin: "attacker_controlled" },
      { ...resourceField(), callback: "alert(1)" },
    ]) {
      expect(() => validatePluginDescriptor({ ...descriptor, inputs: [invalid] }, "report_builder")).toThrow();
    }
  });

  it("submits only the opaque selected id, never a display label", async () => {
    const fetchMock = vi.fn(url => {
      const target = typeof url === "string" ? url : url.toString();
      if (target.includes("/ui-resources/")) return Promise.resolve({ ok: true, status: 200, json: async () => ({ results: resources }) });
      return Promise.resolve({ ok: true, json: async () => ({ run_id: "run-1", status: "COMPLETED" }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AsyncAnalysisRenderer descriptor={descriptor} />);
    await waitFor(() => expect(screen.getByRole("combobox")).not.toBeDisabled());
    await userEvent.setup().selectOptions(screen.getByRole("combobox"), "run-bbb");
    await userEvent.setup().click(screen.getByRole("button", { name: "Run analysis" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[0].toString().includes("/api/run/"))).toBe(true));
    const submitCall = fetchMock.mock.calls.find(call => call[0].toString().includes("/api/run/"));
    const body = submitCall[1].body;
    expect(body.get("param_source_run_id")).toBe("run-bbb");
    expect(body.get("param_source_run_id")).not.toMatch(/Multiqc Wrapper/);
  });
});
