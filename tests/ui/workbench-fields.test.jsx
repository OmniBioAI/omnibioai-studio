import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PluginField from "../../src/ui/components/workbench/PluginField";
import PluginForm from "../../src/ui/components/workbench/PluginForm";
import TextField from "../../src/ui/components/workbench/fields/TextField";
import TextAreaField from "../../src/ui/components/workbench/fields/TextAreaField";
import NumberField from "../../src/ui/components/workbench/fields/NumberField";

const field = (overrides = {}) => ({
  id: "query", component: "text", format: "text", label: "Identifier",
  description: "Use the complete scientific identifier.", required: false,
  ...overrides,
});

function ControlledForm({ input, onSubmit = event => event.preventDefault() }) {
  const [values, setValues] = React.useState({});
  return <PluginForm inputs={[input]} values={values} onSubmit={onSubmit}
    onValueChange={(id, value) => setValues(previous => ({ ...previous, [id]: value }))} />;
}

describe("shared Workbench fields", () => {
  it.each([
    ["text", "text", "INPUT", "textbox"],
    ["textarea", "text", "TEXTAREA", "textbox"],
    ["number", "integer", "INPUT", "spinbutton"],
  ])("uses native semantics and associated help for %s", (component, format, tag, role) => {
    render(<PluginField input={field({ component, format, required: true })} value="" />);
    const control = screen.getByRole(role, { name: "Identifier" });
    expect(control.tagName).toBe(tag);
    expect(control).toBeRequired();
    expect(control).toHaveAccessibleDescription(`Use the complete scientific identifier. (${format})`);
    expect(control).not.toHaveAttribute("aria-required");
    if (component === "text") expect(control).toHaveAttribute("type", "text");
    if (component === "textarea") expect(control).toHaveAttribute("rows", "3");
  });

  it.each(["text", "textarea", "number"])("uses controlled values, including explicit clearing, for %s", async component => {
    const user = userEvent.setup();
    const input = field({ component, format: component === "number" ? "integer" : "text", default: component === "number" ? 10 : "TP53" });
    render(<ControlledForm input={input} />);
    const control = screen.getByLabelText("Identifier");
    expect(control.value).toBe(component === "number" ? "10" : "TP53");
    await user.clear(control);
    expect(control.value).toBe("");
    await user.type(control, component === "number" ? "123" : "BRCA1");
    expect(control.value).toBe(component === "number" ? "123" : "BRCA1");
  });

  it("preserves a default numeric zero", () => {
    render(<PluginForm inputs={[field({ component: "number", format: "integer", default: 0 })]} />);
    expect(screen.getByRole("spinbutton")).toHaveValue(0);
  });

  it("keeps native control IDs unique across simultaneously mounted plugin forms", () => {
    render(<><PluginForm inputs={[field()]} /><PluginForm inputs={[field()]} /></>);
    const controls = screen.getAllByRole("textbox", { name: "Identifier" });
    expect(controls[0].id).not.toBe(controls[1].id);
    controls.forEach(control => expect(control).toHaveAccessibleDescription("Use the complete scientific identifier. (text)"));
  });

  it("associates field errors and units without interpreting content as HTML", () => {
    render(<PluginField input={field({ component: "number", format: "float", unit: "nm", description: "<img src=x onerror=alert(1)>" })}
      value="1e-7" error="The entered distance is outside the supported range." />);
    const control = screen.getByRole("spinbutton");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAccessibleDescription("<img src=x onerror=alert(1)> (float) Unit: nm The entered distance is outside the supported range.");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it.each(["text", "textarea", "number"])("supports disabled and read-only internal states for %s", async component => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const input = field({ component, format: component === "number" ? "integer" : "text" });
    const { rerender } = render(<PluginField input={input} value="12" disabled onValueChange={onValueChange} />);
    let control = screen.getByLabelText("Identifier");
    expect(control).toBeDisabled();
    await user.type(control, "4");
    expect(onValueChange).not.toHaveBeenCalled();
    rerender(<PluginField input={input} value="12" readOnly onValueChange={onValueChange} />);
    control = screen.getByLabelText("Identifier");
    expect(control).toHaveAttribute("readonly");
    expect(control).not.toBeDisabled();
    await user.type(control, "4");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("retains complete long scientific identifiers and multiline sequences", () => {
    const accession = `ENST00000357654.9:${"ACGT".repeat(300)}`;
    const sequence = `${accession}\n${"T".repeat(900)}`;
    render(<><TextField input={field()} value={accession} /><TextAreaField input={field({ id: "sequence" })} value={sequence} /></>);
    expect(screen.getAllByRole("textbox")[0].value).toBe(accession);
    expect(screen.getAllByRole("textbox")[1].value).toBe(sequence);
  });

  it.each([{}, ["unsafe"], Infinity, NaN])("does not coerce non-scalar values into input text: %j", value => {
    render(<TextField input={field()} value={value} />);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("never spreads executable descriptor metadata onto the input", () => {
    const descriptorCallback = vi.fn();
    const internalCallback = vi.fn();
    render(<TextField input={field({ onChange: descriptorCallback, onClick: descriptorCallback, dangerouslySetInnerHTML: { __html: "<b>unsafe</b>" }, type: "password" })}
      onChange={internalCallback} />);
    const control = screen.getByRole("textbox");
    fireEvent.change(control, { target: { value: "TP53" } });
    fireEvent.click(control);
    expect(control).toHaveAttribute("type", "text");
    expect(internalCallback).toHaveBeenCalledWith("TP53");
    expect(descriptorCallback).not.toHaveBeenCalled();
  });
});

describe("numeric presentation contract", () => {
  it.each([
    ["integer", undefined, "1"], ["float", undefined, "any"],
    ["integer", 2, "2"], ["float", 0.01, "0.01"],
  ])("renders %s step %s without coercing scientific input", (format, step, expectedStep) => {
    const onChange = vi.fn();
    render(<NumberField input={field({ component: "number", format, min: 0, max: 100, step })} value="0" onChange={onChange} />);
    const control = screen.getByRole("spinbutton");
    expect(control).toHaveAttribute("min", "0");
    expect(control).toHaveAttribute("max", "100");
    expect(control).toHaveAttribute("step", expectedStep);
    fireEvent.change(control, { target: { value: "1e-7" } });
    expect(onChange).toHaveBeenCalledWith("1e-7");
    fireEvent.change(control, { target: { value: "9007199254740993" } });
    expect(onChange).toHaveBeenCalledWith("9007199254740993");
  });

  it.each([
    { format: "arbitrary" }, { min: "1" }, { max: Infinity },
    { min: 10, max: 2 }, { step: 0 }, { step: -1 }, { step: NaN },
    { step: "javascript:alert(1)" }, { format: "integer", step: "any" },
    { format: "integer", step: 0.5 },
    { format: "integer", min: 0.5 }, { format: "integer", max: 1e20 },
  ])("fails closed for malformed number metadata %j", overrides => {
    render(<NumberField input={field({ component: "number", format: "float", ...overrides })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid numeric input metadata");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });
});

describe("form interaction and accessible validation", () => {
  it("supports keyboard submission, focuses a missing field and clears its error on editing", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(event => event.preventDefault());
    render(<ControlledForm input={field({ required: true })} onSubmit={onSubmit} />);
    const control = screen.getByRole("textbox");
    await user.tab();
    expect(control).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(control).toHaveFocus();
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Identifier is required.");
    await user.type(control, "TP53");
    expect(control).not.toHaveAttribute("aria-invalid");
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it.each(["-1", "101", "3"])("uses native numeric bounds and step for input %s", value => {
    const onSubmit = vi.fn();
    render(<PluginForm inputs={[field({ component: "number", format: "integer", min: 0, max: 100, step: 2 })]}
      values={{ query: value }} onSubmit={onSubmit} />);
    fireEvent.submit(screen.getByRole("button").closest("form"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("spinbutton")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("spinbutton")).toHaveFocus();
  });

  it("keeps optional empty numeric fields valid", () => {
    const onSubmit = vi.fn(event => event.preventDefault());
    render(<PluginForm inputs={[field({ component: "number", format: "float" })]} values={{ query: "" }} onSubmit={onSubmit} />);
    fireEvent.submit(screen.getByRole("button").closest("form"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows backend field errors through the shared field association", () => {
    render(<PluginForm inputs={[field()]} fieldErrors={{ query: "The identifier is not valid for this organism." }} />);
    const control = screen.getByRole("textbox");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAccessibleDescription("Use the complete scientific identifier. (text) The identifier is not valid for this organism.");
  });

  it("removes validation for a field that becomes conditionally hidden", async () => {
    const user = userEvent.setup();
    const inputs = [
      field({ id: "mode", component: "select", label: "Mode", choices: ["basic", "advanced"], default: "advanced" }),
      field({ required: true, conditions: [{ controller: "mode", operator: "equals", value: "advanced", effect: "visible" }] }),
    ];
    function ConditionalForm() {
      const [values, setValues] = React.useState({});
      return <PluginForm inputs={inputs} values={values} onValueChange={(id, value) => setValues(previous => ({ ...previous, [id]: value }))} />;
    }
    render(<ConditionalForm />);
    fireEvent.submit(screen.getByRole("button").closest("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("Identifier is required.");
    await user.selectOptions(screen.getByRole("combobox"), "basic");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables controls and submission while a request is in progress", () => {
    const onSubmit = vi.fn();
    render(<PluginForm inputs={[field()]} submitting onSubmit={onSubmit} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    const button = screen.getByRole("button", { name: "Loading…" });
    expect(button).toBeDisabled();
    expect(button.closest("form")).toHaveAttribute("aria-busy", "true");
    fireEvent.submit(button.closest("form"));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
