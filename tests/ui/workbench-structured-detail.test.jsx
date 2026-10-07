import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DetailPanel from "../../src/ui/components/workbench/results/DetailPanel";
import { validDetailDescriptor, validStructuredDetailRecord } from "../../src/ui/lib/pluginUiContracts";

const sections = [
  { id: "identity", title: "Variant identity", presentation: "scalar", fields: [
    { key: "rsid", label: "rsID" }, { key: "hgvs", label: "HGVS" }, { key: "reviewed", label: "Reviewed" },
  ] },
  { id: "observations", title: "Population observations", presentation: "table", optional: true,
    row_key: "observation_id", max_rows: 20, columns: [
      { key: "observation_id", label: "Observation" }, { key: "source", label: "Source" },
      { key: "frequency", label: "Frequency" },
    ] },
  { id: "provenance", title: "Provenance", presentation: "provenance", fields: [
    { key: "source", label: "Source database" }, { key: "release", label: "Release" },
  ] },
];

const record = {
  identity: { rsid: "rs7412", hgvs: "NM_000041.4:c.388T>C", reviewed: false },
  observations: [{ observation_id: "gnomad_exomes_1", source: "gnomAD exomes", frequency: 1e-7 }],
  provenance: { source: "NCBI dbSNP", release: null },
};

describe("finite structured scientific detail", () => {
  it("renders ordered scalar, bounded table and provenance sections through existing primitives", () => {
    render(<DetailPanel title="Variant detail" sections={sections} record={record} />);
    const headings = screen.getAllByRole("heading").map(heading => heading.textContent);
    expect(headings).toEqual(["Variant detail", "Variant identity", "Population observations", "Provenance"]);
    expect(screen.getByText("NM_000041.4:c.388T>C")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Population observations" })).toBeInTheDocument();
    expect(screen.getByText("1e-7")).toBeInTheDocument();
    expect(screen.getByText("NCBI dbSNP")).toBeInTheDocument();
  });

  it("omits an absent optional section without losing required section semantics", () => {
    const withoutOptional = { identity: record.identity, provenance: record.provenance };
    render(<DetailPanel title="Variant detail" sections={sections} record={withoutOptional} />);
    expect(screen.queryByRole("heading", { name: "Population observations" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Variant identity" })).toBeInTheDocument();
    expect(validStructuredDetailRecord(withoutOptional, sections, { strict: true })).toBe(true);
  });

  it("uses the shared table empty state for a declared empty child table", () => {
    render(<DetailPanel title="Variant detail" sections={sections} record={{ ...record, observations: [] }} />);
    expect(screen.getByRole("heading", { name: "Population observations" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("No results");
  });

  it("renders HTML-looking scientific and provenance values as inert text", () => {
    const { container } = render(<DetailPanel title="Variant detail" sections={sections} record={{
      ...record, identity: { ...record.identity, hgvs: "<script>alert(1)</script>" },
    }} />);
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it.each([
    ["missing required section", { identity: record.identity }],
    ["unknown response section", { ...record, raw: {} }],
    ["structured scalar", { ...record, identity: { ...record.identity, hgvs: [] } }],
    ["structured table cell", { ...record, observations: [{ observation_id: "a", source: {}, frequency: 1 }] }],
    ["duplicate row identity", { ...record, observations: [record.observations[0], record.observations[0]] }],
    ["extra table cell", { ...record, observations: [{ ...record.observations[0], url: "https://example.test" }] }],
    ["provenance URL value", { ...record, provenance: { source: "https://example.test", release: null } }],
    ["provenance JavaScript value", { ...record, provenance: { source: "javascript:alert(1)", release: null } }],
    ["too many rows", { ...record, observations: Array.from({ length: 21 }, (_, index) => ({ observation_id: String(index) })) }],
  ])("fails closed for %s", (_name, invalid) => {
    expect(validStructuredDetailRecord(invalid, sections, { strict: true })).toBe(false);
    render(<DetailPanel title="Variant detail" sections={sections} record={invalid} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid structured detail data");
  });
});

describe("structured-detail descriptor boundary", () => {
  it("accepts the finite scalar, table and provenance vocabulary", () => {
    expect(validDetailDescriptor({ component: "detail", title: "Variant detail", sections })).toBe(true);
  });

  it.each([
    ["empty", []],
    ["duplicate ids", [...sections, sections[0]]],
    ["prototype id", [{ ...sections[0], id: "constructor" }]],
    ["sensitive id", [{ ...sections[0], id: "token" }]],
    ["dotted id", [{ ...sections[0], id: "variant.identity" }]],
    ["slash id", [{ ...sections[0], id: "variant/identity" }]],
    ["whitespace id", [{ ...sections[0], id: "variant identity" }]],
    ["unknown type", [{ ...sections[0], presentation: "component" }]],
    ["recursive section", [{ ...sections[0], sections: [] }]],
    ["raw HTML", [{ ...sections[0], html: "<b>unsafe</b>" }]],
    ["callback metadata", [{ ...sections[0], callback: "render" }]],
    ["URL metadata", [{ ...sections[2], url: "https://example.test" }]],
    ["unsafe field", [{ ...sections[2], fields: [{ key: "api_key", label: "Secret" }] }]],
    ["unbounded table", [{ ...sections[1], max_rows: 501 }]],
    ["missing row key column", [{ ...sections[1], row_key: "missing" }]],
  ])("rejects %s", (_name, invalidSections) => {
    expect(validDetailDescriptor({ component: "detail", title: "Variant detail", sections: invalidSections })).toBe(false);
  });

  it("rejects mixed flat and section contracts while preserving flat Batch 2 detail", () => {
    const fields = [{ key: "pdb_id", label: "PDB ID" }];
    expect(validDetailDescriptor({ component: "detail", title: "Detail", fields })).toBe(true);
    expect(validDetailDescriptor({ component: "detail", title: "Detail", fields, sections })).toBe(false);
  });
});
