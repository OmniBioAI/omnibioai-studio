import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PluginForm, { validateConditionalInputs } from "../../src/ui/components/workbench/PluginForm";
import PluginField from "../../src/ui/components/workbench/PluginField";
import LogViewer from "../../src/ui/components/workbench/LogViewer";
import RunStatus from "../../src/ui/components/workbench/RunStatus";
import { resolveWorkbenchComponent, WORKBENCH_COMPONENT_REGISTRY } from "../../src/ui/components/workbench/componentRegistry";

const input = (overrides = {}) => ({
  id: "input_file",
  label: "Input File",
  description: "Upload a TSV file",
  required: true,
  format: "tsv",
  widget: "file",
  ...overrides,
});

describe("allowlisted Workbench component registry", () => {
  it("resolves only the finite shared field and result types", () => {
    expect(Object.keys(WORKBENCH_COMPONENT_REGISTRY).sort()).toEqual(["file", "number", "pagination", "select", "table", "text", "textarea"]);
    expect(resolveWorkbenchComponent("file")).toBeTruthy();
    expect(resolveWorkbenchComponent("text")).toBeTruthy();
    expect(resolveWorkbenchComponent("textarea")).toBeTruthy();
    expect(resolveWorkbenchComponent("select")).toBeTruthy();
    expect(resolveWorkbenchComponent("../../arbitrary")).toBeNull();
    expect(resolveWorkbenchComponent("constructor")).toBeNull();
  });

  it("fails safely for an unknown descriptor component", () => {
    render(<PluginField input={input({ widget: "graph" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unsupported plugin input component");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders allowlisted select choices", async () => {
    const onValueChange = vi.fn();
    render(<PluginField input={input({ id: "entity_type", label: "Entity type", component: "select", choices: ["", "pathway", "gene"] })} onValueChange={onValueChange} />);
    expect(screen.getByRole("combobox")).toHaveValue("");
    await userEvent.setup().selectOptions(screen.getByRole("combobox"), "pathway");
    expect(onValueChange).toHaveBeenCalledWith("pathway");
  });
});

describe("PluginForm composition", () => {
  it("preserves file labels, help, requiredness, accept metadata, and selection callbacks", async () => {
    const user = userEvent.setup();
    const onFilesChange = vi.fn();
    const file = new File(["a\tb\n"], "input.tsv", { type: "text/tab-separated-values" });
    render(<PluginForm inputs={[input({ accept: ".tsv" })]} onFilesChange={onFilesChange} />);
    const control = screen.getByLabelText(/Input File/);
    expect(control).toBeRequired();
    expect(control).toHaveAttribute("accept", ".tsv");
    expect(screen.getByText("Upload a TSV file (tsv)")).toBeInTheDocument();
    await user.upload(control, file);
    expect(onFilesChange).toHaveBeenCalledWith("input_file", expect.any(FileList));
  });

  it("preserves text/textarea changes and descriptor-driven names", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<PluginForm inputs={[input({ id: "ligand_smiles", label: "SMILES", widget: "text", format: "txt", required: false })]} onValueChange={onValueChange} />);
    const control = screen.getByLabelText("SMILES");
    expect(control.tagName).toBe("INPUT");
    expect(control).toHaveAttribute("name", "param_ligand_smiles");
    await user.type(control, "CCO");
    expect(onValueChange).toHaveBeenCalledWith("ligand_smiles", "C");
    expect(onValueChange).toHaveBeenLastCalledWith("ligand_smiles", "O");
  });

  it("evaluates independent visibility and required effects without clearing retained values", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onFilesChange = vi.fn();
    const onSubmit = vi.fn(event => event.preventDefault());
    const conditionalInputs = [
      { id: "mode", label: "Mode", description: "Mode", required: true, format: "text", widget: "select", choices: ["infer", "train"], default: "infer" },
      { id: "input_file", label: "Input", description: "Input", required: true, format: "tsv", widget: "file" },
      { id: "labels", label: "Labels", description: "Labels", required: false, format: "csv", widget: "file", conditions: [
        { controller: "mode", operator: "equals", value: "train", effect: "visible" },
        { controller: "mode", operator: "equals", value: "train", effect: "required" },
      ] },
    ];
    const { rerender } = render(<PluginForm inputs={conditionalInputs} values={{}} files={{}} onValueChange={onValueChange} onFilesChange={onFilesChange} onSubmit={onSubmit} />);
    expect(screen.queryByLabelText("Labels")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Mode/)).toHaveValue("infer");
    onValueChange.mockImplementation((id, value) => {
      if (id === "mode") rerender(<PluginForm inputs={conditionalInputs} values={{ mode: value }} files={{}} onValueChange={onValueChange} onFilesChange={onFilesChange} onSubmit={onSubmit} />);
    });
    await user.selectOptions(screen.getByLabelText(/Mode/), "train");
    expect(screen.getByLabelText(/Labels/)).toBeVisible();
    expect(screen.getByLabelText(/Labels/)).toBeRequired();
    const retained = new File(["label"], "labels.csv", { type: "text/csv" });
    onFilesChange.mock.calls.push(["labels", [retained]]);
    rerender(<PluginForm inputs={conditionalInputs} values={{ mode: "infer" }} files={{ labels: [retained] }} onValueChange={onValueChange} onFilesChange={onFilesChange} onSubmit={onSubmit} />);
    expect(screen.queryByLabelText("Labels")).not.toBeInTheDocument();
    expect(validateConditionalInputs(conditionalInputs)).toBe(true);
  });

  it("blocks train submission without active conditional labels", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const conditionalInputs = [
      { id: "mode", label: "Mode", description: "Mode", required: true, format: "text", widget: "select", choices: ["infer", "train"], default: "infer" },
      { id: "labels", label: "Labels", description: "Labels", required: false, format: "csv", widget: "file", conditions: [
        { controller: "mode", operator: "equals", value: "train", effect: "visible" },
        { controller: "mode", operator: "equals", value: "train", effect: "required" },
      ] },
    ];
    render(<PluginForm inputs={conditionalInputs} values={{ mode: "train" }} files={{}} onSubmit={onSubmit} />);
    fireEvent.submit(screen.getByRole("button", { name: "Run analysis" }).closest("form"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Labels is required.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("fails safely for invalid condition metadata", () => {
    render(<PluginForm inputs={[input({ conditions: [{ controller: "missing", operator: "equals", value: "train", effect: "visible" }] })]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid conditional input metadata");
  });
});

describe("runtime presentation components", () => {
  it("renders status without inventing lifecycle behavior", () => {
    render(<RunStatus status={{ state: "RUNNING", detail: "queued" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("RUNNING: queued");
  });

  it("renders logs as text and never interprets log content as HTML", () => {
    render(<LogViewer lines={["<img src=x onerror=alert(1)>", "complete"]} />);
    const log = document.querySelector("pre");
    expect(log).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(log).toHaveTextContent("complete");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("does not render an empty log viewer", () => {
    const { container } = render(<LogViewer lines={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
