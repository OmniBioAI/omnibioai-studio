import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PluginForm from "../../src/ui/components/workbench/PluginForm";
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
  it("resolves only the proven file, text, and textarea types", () => {
    expect(Object.keys(WORKBENCH_COMPONENT_REGISTRY).sort()).toEqual(["file", "text", "textarea"]);
    expect(resolveWorkbenchComponent("file")).toBeTruthy();
    expect(resolveWorkbenchComponent("text")).toBeTruthy();
    expect(resolveWorkbenchComponent("textarea")).toBeTruthy();
    expect(resolveWorkbenchComponent("select")).toBeNull();
    expect(resolveWorkbenchComponent("../../arbitrary")).toBeNull();
    expect(resolveWorkbenchComponent("constructor")).toBeNull();
  });

  it("fails safely for an unknown descriptor component", () => {
    render(<PluginField input={input({ widget: "select" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unsupported plugin input component");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
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
    expect(control.tagName).toBe("TEXTAREA");
    expect(control).toHaveAttribute("name", "param_ligand_smiles");
    await user.type(control, "CCO");
    expect(onValueChange).toHaveBeenCalledWith("ligand_smiles", "C");
    expect(onValueChange).toHaveBeenLastCalledWith("ligand_smiles", "O");
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
