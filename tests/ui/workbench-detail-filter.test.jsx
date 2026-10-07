import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DetailPanel from "../../src/ui/components/workbench/results/DetailPanel";
import KeyValueResult from "../../src/ui/components/workbench/results/KeyValueResult";
import FilterControls from "../../src/ui/components/workbench/filters/FilterControls";
import { resolveWorkbenchComponent, WORKBENCH_COMPONENT_REGISTRY } from "../../src/ui/components/workbench/componentRegistry";

const fields = [
  { key: "accession", label: "Accession" },
  { key: "description", label: "Scientific description" },
  { key: "score", label: "Score" },
  { key: "reviewed", label: "Reviewed" },
  { key: "release_date", label: "Release date" },
];

describe("KeyValueResult", () => {
  it("renders declared scalar fields, preserves long scientific text, and presents missing values", () => {
    const long = `NM_007294.4:c.${"5266dupC".repeat(20)}`;
    render(<KeyValueResult fields={fields} record={{ accession: "VCV000017677", description: long, score: 1e-27, reviewed: false }} />);
    expect(screen.getByText("VCV000017677")).toBeInTheDocument();
    expect(screen.getByText(long)).toBeInTheDocument();
    expect(screen.getByText("1e-27")).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();
    expect(screen.getByText("Release date").nextElementSibling).toHaveTextContent("—");
  });

  it("renders HTML-looking scalar content as inert text", () => {
    const { container } = render(<KeyValueResult fields={[fields[1]]} record={{ description: "<img src=x onerror=alert(1)>" }} />);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(container.querySelector("img, script")).toBeNull();
  });

  it.each([
    ["object value", fields, { accession: {} }], ["array value", fields, { accession: [] }],
    ["nonfinite value", fields, { score: Infinity }], ["unknown field metadata", [{ key: "accession", label: "Accession", html: true }], {}],
    ["prototype path", [{ key: "constructor", label: "Unsafe" }], {}], ["empty fields", [], {}], ["non-record", fields, []],
  ])("fails closed for %s", (_name, invalidFields, record) => {
    render(<KeyValueResult fields={invalidFields} record={record} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid scalar result data");
  });

  it("announces an empty finite record", () => {
    render(<KeyValueResult fields={fields} record={{}} />);
    expect(screen.getByRole("status")).toHaveTextContent("No detail available");
  });
});

describe("DetailPanel", () => {
  it.each([
    ["loading", { loading: true }, "status", "Loading detail"],
    ["empty", {}, "status", "No detail selected"],
    ["error", { error: "Authorized detail unavailable" }, "alert", "Authorized detail unavailable"],
  ])("presents the %s state", (_name, props, role, message) => {
    render(<DetailPanel title="Variant detail" fields={fields} {...props} />);
    expect(screen.getByRole("region", { name: "Variant detail" })).toHaveAttribute("aria-busy", String(Boolean(props.loading)));
    expect(screen.getByRole(role)).toHaveTextContent(message);
  });

  it("composes the scalar primitive with a focusable semantic heading", () => {
    const ref = React.createRef();
    render(<DetailPanel title="Structure detail" fields={fields} record={{ accession: "4HHB" }} headingRef={ref} />);
    const heading = screen.getByRole("heading", { name: "Structure detail" });
    heading.focus();
    expect(heading).toHaveFocus();
    expect(screen.getByText("4HHB")).toBeInTheDocument();
  });
});

describe("FilterControls", () => {
  it("uses fieldset semantics and emits only a trusted reset event", () => {
    const reset = vi.fn();
    render(<FilterControls title="Variant filters" onReset={reset}><label>Assembly<input /></label></FilterControls>);
    const group = screen.getByRole("group", { name: "Variant filters" });
    fireEvent.click(within(group).getByRole("button", { name: "Reset filters" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("disables all controls through native fieldset semantics", () => {
    render(<FilterControls disabled><label>Organism<input /></label></FilterControls>);
    expect(screen.getByRole("group", { name: "Filters" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset filters" })).toBeDisabled();
  });
});

describe("Batch 2 registry", () => {
  it("contains only explicit frozen registrations", () => {
    expect(resolveWorkbenchComponent("key_value")).toBe(KeyValueResult);
    expect(resolveWorkbenchComponent("detail")).toBe(DetailPanel);
    expect(resolveWorkbenchComponent("filters")).toBe(FilterControls);
    expect(Object.isFrozen(WORKBENCH_COMPONENT_REGISTRY)).toBe(true);
  });

  it.each(["MetadataPanel", "CustomDetail", "FilterBuilder", "constructor", "__proto__", "../../module", null])(
    "rejects unknown component %s", value => expect(resolveWorkbenchComponent(value)).toBeNull());
});
