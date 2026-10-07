import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AsyncAnalysisRenderer from "../../src/ui/components/workbench/AsyncAnalysisRenderer";
import PluginField from "../../src/ui/components/workbench/PluginField";
import PluginForm from "../../src/ui/components/workbench/PluginForm";
import { validatePluginDescriptor } from "../../src/ui/lib/pluginApi";

const checkbox = (overrides = {}) => ({
  id: "include_intronic", widget: "checkbox", format: "boolean",
  label: "Include intronic variants", description: "Include intronic consequences in the analysis.",
  required: false, multiple: false, default: false, ...overrides,
});
const multiselect = (overrides = {}) => ({
  id: "enrichment_types", widget: "multiselect", format: "text",
  label: "Enrichment methods", description: "Select one or more finite analysis methods.",
  required: true, multiple: true,
  choices: [
    { value: "go", label: "GO (Gene Ontology) biological process" },
    { value: "reactome", label: "Reactome pathway enrichment" },
    { value: "gsea", label: "Gene Set Enrichment Analysis (GSEA)" },
  ],
  default: ["go"], ...overrides,
});
const descriptor = {
  schema_version: 1,
  plugin: { slug: "finite_inputs", name: "Finite inputs", version: "1.0.0", description: "Input proof", category: "analysis" },
  renderer: "generic_runner", native_supported: true,
  inputs: [checkbox(), multiselect({ required: false })], outputs: [],
  capabilities: { submit: true, status: true, logs: true, artifacts: true, downloads: true },
  endpoints: {
    submit: "/plugins/finite_inputs/api/run/",
    status: "/plugins/finite_inputs/api/status/{run_id}/",
    logs: "/plugins/finite_inputs/api/log/{run_id}/",
    artifacts: "/plugins/finite_inputs/api/artifacts/{run_id}/",
    download: "/plugins/finite_inputs/api/ui-artifacts/{run_id}/{artifact_id}/download/",
  },
  artifacts: { presentation: "list", max_items: 100 },
};

afterEach(() => { vi.unstubAllGlobals(); });

describe("CheckboxField", () => {
  it("uses an associated native checkbox with boolean controlled state and help", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(<PluginField input={checkbox()} value={false} onValueChange={onValueChange} />);
    const control = screen.getByRole("checkbox", { name: "Include intronic variants" });
    expect(control).not.toBeChecked();
    expect(control).toHaveAccessibleDescription("Include intronic consequences in the analysis. (boolean)");
    await user.click(control);
    expect(onValueChange).toHaveBeenCalledWith(true);
    rerender(<PluginField input={checkbox()} value />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("is keyboard operable and supports disabled, required, and associated error states", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(<PluginField input={checkbox({ required: true })} value={false} error="This option must be enabled." onValueChange={onValueChange} />);
    const control = screen.getByRole("checkbox");
    expect(control).toBeRequired();
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAccessibleDescription(/This option must be enabled/);
    await user.tab();
    expect(control).toHaveFocus();
    await user.keyboard(" ");
    expect(onValueChange).toHaveBeenCalledWith(true);
    rerender(<PluginField input={checkbox()} value={false} disabled onValueChange={onValueChange} />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("fails closed instead of coercing non-boolean runtime state", () => {
    render(<PluginField input={checkbox()} value="false" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid boolean input value");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders a default-true checkbox through the shared controlled form", () => {
    render(<PluginForm inputs={[checkbox({ default: true })]} />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});

describe("MultiSelectField", () => {
  it("renders finite labeled options and returns descriptor-ordered arrays", async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = React.useState(["go"]);
      return <PluginField input={multiselect()} value={value} onValueChange={setValue} />;
    }
    render(<Controlled />);
    const control = screen.getByRole("listbox", { name: "Enrichment methods" });
    expect(control).toHaveAccessibleDescription(/Select one or more finite analysis methods/);
    expect(screen.getByRole("option", { name: /GO \(Gene Ontology\)/ }).selected).toBe(true);
    await user.selectOptions(control, ["gsea", "reactome"]);
    expect(Array.from(control.selectedOptions, option => option.value)).toEqual(["go", "reactome", "gsea"]);
    await user.deselectOptions(control, "reactome");
    expect(Array.from(control.selectedOptions, option => option.value)).toEqual(["go", "gsea"]);
  });

  it("enforces accessible required-empty validation through PluginForm", () => {
    const onSubmit = vi.fn();
    render(<PluginForm inputs={[multiselect({ default: [] })]} values={{ enrichment_types: [] }} onSubmit={onSubmit} />);
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    const control = screen.getByRole("listbox");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(control).toHaveFocus();
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAccessibleDescription(/Enrichment methods is required/);
  });

  it.each([
    { choices: [] },
    { choices: [{ value: "go", label: "GO" }, { value: "go", label: "Duplicate" }] },
    { choices: [{ value: "go", label: "<script>alert(1)</script>" }] },
    { default: ["unknown"] },
    { choices: [{ value: { nested: true }, label: "Object" }] },
    { choices: Array.from({ length: 51 }, (_, index) => ({ value: `choice_${index}`, label: `Choice ${index}` })) },
  ])("fails closed for malformed metadata %#", override => {
    render(<PluginField input={multiselect(override)} value={override.default || []} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid finite multiselect metadata");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("finite input descriptor and submission boundary", () => {
  it("accepts only exact contracts and rejects executable or unknown metadata", () => {
    expect(validatePluginDescriptor(descriptor, "finite_inputs").inputs).toHaveLength(2);
    for (const invalid of [
      { ...checkbox(), default: "false" },
      { ...checkbox(), default: 1 },
      { ...checkbox(), default: [] },
      { ...checkbox(), callback: "alert(1)" },
      { ...multiselect(), choices: [...multiselect().choices, multiselect().choices[0]] },
      { ...multiselect(), expression: "selected.length > 0" },
      { ...multiselect(), default: ["unknown"] },
    ]) {
      expect(() => validatePluginDescriptor({ ...descriptor, inputs: [invalid] }, "finite_inputs")).toThrow();
    }
  });

  it.each(["9field", "field-name", "constructor", "prototype", "__proto__", "password", "api_key"])(
    "rejects unsafe field id %s", id => {
      expect(() => validatePluginDescriptor({ ...descriptor, inputs: [checkbox({ id })] }, "finite_inputs")).toThrow();
    },
  );

  it("submits explicit false and a JSON finite array without dropping defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ run_id: "run-1", status: "COMPLETED" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AsyncAnalysisRenderer descriptor={descriptor} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Run analysis" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = fetchMock.mock.calls[0][1].body;
    expect(body.get("param_include_intronic")).toBe("false");
    expect(body.get("param_enrichment_types")).toBe('["go"]');
    expect(body.getAll("param_enrichment_types")).toHaveLength(1);
  });
});
