import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ResultsTable, { ResultsTableRow } from "../../src/ui/components/workbench/results/ResultsTable";
import PaginationControls from "../../src/ui/components/workbench/results/PaginationControls";
import { resolveWorkbenchComponent, WORKBENCH_COMPONENT_REGISTRY } from "../../src/ui/components/workbench/componentRegistry";

const columns = [{ key: "id", label: "Accession" }, { key: "value", label: "Scientific value" }];
const page = (overrides = {}) => ({ mode: "page", page: 1, page_size: 20, total_items: 41, has_previous: false, has_next: true, ...overrides });

describe("ResultsTable", () => {
  it("uses semantic headers, a caption, and a keyboard-reachable overflow region", () => {
    const longIdentifier = "ENST0000000000000000000000000000000000000000000000000000000001";
    render(<ResultsTable columns={columns} rows={[{ id: longIdentifier, value: 1.25e-25 }]} rowKey="id" caption="Gene results" />);
    expect(screen.getByRole("table", { name: "Gene results" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map(node => node.textContent)).toEqual(["Accession", "Scientific value"]);
    screen.getAllByRole("columnheader").forEach(node => expect(node).toHaveAttribute("scope", "col"));
    expect(screen.getByRole("region", { name: "Gene results table" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("cell", { name: longIdentifier })).toHaveTextContent(longIdentifier);
    expect(screen.getByRole("cell", { name: "1.25e-25" })).toBeInTheDocument();
  });

  it("renders strings, finite numbers, booleans and nested scalar paths without interpreting HTML", () => {
    const nested = [...columns, { key: "metadata.symbol", label: "Symbol" }];
    const { container } = render(<ResultsTable columns={nested} rows={[
      { id: "a", value: "<img src=x onerror=alert(1)>", metadata: { symbol: "TP53" } },
      { id: "b", value: false }, { id: "c", value: 0 },
      { id: "d", value: null }, { id: "e", value: { dangerous: "<script>" } },
      { id: "f", value: ["nested"] }, { id: "g", value: Infinity }, { id: "h", value: NaN },
    ]} rowKey="id" />);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(container.querySelector("img, script")).toBeNull();
    expect(screen.getByText("false")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("TP53")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
  });

  it("preserves row DOM identity when stable identifiers reorder", () => {
    const rows = [{ id: "ENSG1", value: 1 }, { id: "ENSG2", value: 2 }];
    const { rerender } = render(<ResultsTable columns={columns} rows={rows} rowKey="id" />);
    const original = screen.getByRole("cell", { name: "ENSG1" }).closest("tr");
    rerender(<ResultsTable columns={columns} rows={[rows[1], rows[0]]} rowKey="id" />);
    expect(screen.getByRole("cell", { name: "ENSG1" }).closest("tr")).toBe(original);
    expect(screen.getAllByRole("row")[2]).toBe(original);
  });

  it("supports legacy rows without an explicit key and trusted trailing detail composition", () => {
    const rows = [{ id: "4HHB", value: 0.012345 }];
    const onDetail = vi.fn();
    render(<ResultsTable columns={columns} rows={rows} trailingHeading="Detail">
      <ResultsTableRow columns={columns} row={rows[0]}><td><button type="button" onClick={onDetail}>View 4HHB</button></td></ResultsTableRow>
    </ResultsTable>);
    expect(screen.getByRole("columnheader", { name: "Detail" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "View 4HHB" }));
    expect(onDetail).toHaveBeenCalledOnce();
    expect(screen.getByRole("cell", { name: "0.012345" })).toBeInTheDocument();
  });

  it("announces distinct empty, loading, and error states while retaining existing rows during navigation", () => {
    const { rerender } = render(<ResultsTable columns={columns} rows={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("No results.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    rerender(<ResultsTable columns={columns} rows={[]} loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading results");
    expect(screen.getByRole("status").parentElement).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("No results.")).not.toBeInTheDocument();
    rerender(<ResultsTable columns={columns} rows={[{ id: "4HHB", value: 1 }]} error="Service unavailable" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Service unavailable");
    expect(screen.getByRole("cell", { name: "4HHB" })).toBeInTheDocument();
    expect(screen.queryByText("No results.")).not.toBeInTheDocument();
  });

  it.each([
    ["missing columns", undefined, [], undefined],
    ["empty columns", [], [], undefined],
    ["duplicate columns", [columns[0], columns[0]], [], undefined],
    ["empty label", [{ key: "id", label: " " }], [], undefined],
    ["prototype column", [{ key: "constructor.name", label: "No" }], [], undefined],
    ["arbitrary formatter", [{ ...columns[0], render: "eval" }], [], undefined],
    ["non-array rows", columns, {}, undefined],
    ["non-record row", columns, [null], undefined],
    ["duplicate key", columns, [{ id: "a" }, { id: "a" }], "id"],
    ["missing key", columns, [{ value: 1 }], "id"],
    ["non-scalar key", columns, [{ id: {} }], "id"],
    ["prototype key", columns, [{ id: "a" }], "__proto__"],
  ])("fails closed for %s", (_name, invalidColumns, rows, rowKey) => {
    render(<ResultsTable columns={invalidColumns} rows={rows} rowKey={rowKey} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid table data.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("PaginationControls", () => {
  it("emits only internal previous/next events and respects backend boundaries", () => {
    const navigate = vi.fn();
    const { rerender } = render(<PaginationControls pagination={page()} onNavigate={navigate} />);
    const nav = screen.getByRole("navigation", { name: "Results pagination" });
    expect(within(nav).getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByText("Page 1")).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(navigate.mock.calls).toEqual([["next"]]);
    rerender(<PaginationControls pagination={page({ page: 3, has_previous: true, has_next: false })} onNavigate={navigate} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(navigate).toHaveBeenLastCalledWith("previous");
  });

  it("permits a backend-imposed final page before the apparent total", () => {
    render(<PaginationControls pagination={page({ has_next: false, total_items: 1000000 })} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("1000000 results");
  });

  it.each(["loading", "disabled"])("blocks navigation while %s", state => {
    const navigate = vi.fn();
    render(<PaginationControls pagination={page({ page: 2, has_previous: true })} onNavigate={navigate} {...{ [state]: true }} />);
    screen.getAllByRole("button").forEach(button => { expect(button).toBeDisabled(); fireEvent.click(button); });
    expect(navigate).not.toHaveBeenCalled();
    if (state === "loading") expect(screen.getByRole("navigation")).toHaveAttribute("aria-busy", "true");
  });

  it.each([
    ["cursor", page({ mode: "cursor" })], ["URL", page({ next_url: "https://example.test" })],
    ["zero page", page({ page: 0 })], ["fractional page", page({ page: 1.5 })],
    ["nonfinite total", page({ total_items: Infinity })], ["negative total", page({ total_items: -1 })],
    ["empty size", page({ page_size: 0 })], ["untyped flag", page({ has_next: 1 })],
    ["previous on first", page({ has_previous: true })], ["next beyond total", page({ total_items: 0 })],
    ["missing flags", { mode: "page", page: 1, page_size: 20, total_items: 0 }],
  ])("rejects malformed %s metadata", (_name, pagination) => {
    render(<PaginationControls pagination={pagination} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid pagination data.");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("result registry", () => {
  it("explicitly resolves frozen shared primitive registrations", () => {
    expect(resolveWorkbenchComponent("table")).toBe(ResultsTable);
    expect(resolveWorkbenchComponent("pagination")).toBe(PaginationControls);
    expect(Object.isFrozen(WORKBENCH_COMPONENT_REGISTRY)).toBe(true);
  });
  it.each(["constructor", "__proto__", "prototype", "toString", "ResultsTable", "../../ResultsTable", null, {}])("rejects unallowlisted component %s", type => {
    expect(resolveWorkbenchComponent(type)).toBeNull();
  });
});
