import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import DetailPanel from "../../src/ui/components/workbench/results/DetailPanel";
import ScientificReference from "../../src/ui/components/workbench/results/ScientificReference";
import { validDetailDescriptor, validScientificReference, validStructuredDetailRecord } from "../../src/ui/lib/pluginUiContracts";

const section = {
  id: "primary_references", title: "Primary citation references", presentation: "references",
  optional: true, reference_types: ["doi", "pubmed"], max_items: 2,
};

describe("ScientificReference", () => {
  it("renders semantic keyboard-focusable navigation only to the fixed server operation", async () => {
    render(<ScientificReference pluginSlug="rcsb_pdb" referenceType="doi"
      identifier="10.1016/0022-2836(84)90472-8" />);
    const link = screen.getByRole("link", { name: /DOI: 10\.1016.*external scientific resource/ });
    expect(link).toHaveAttribute("href",
      "/_svc/workbench/plugins/rcsb_pdb/api/ui-reference/doi/?identifier=10.1016%2F0022-2836%2884%2990472-8");
    expect(link).not.toHaveAttribute("target");
    await userEvent.setup().tab();
    expect(link).toHaveFocus();
  });

  it.each([
    ["unknown type", "evil", "6726807"],
    ["type outside plugin policy", "clinvar", "VCV000017677"],
    ["attacker URL", "pubmed", "https://evil.example"],
    ["protocol-relative", "pubmed", "//evil.example"],
    ["JavaScript", "pubmed", "javascript:alert(1)"],
    ["path traversal", "doi", "10.1000/../evil"],
    ["HTML-looking", "pubmed", "<img src=x onerror=alert(1)>"],
  ])("renders %s as inert unavailable text", (_name, referenceType, identifier) => {
    const { container } = render(<ScientificReference pluginSlug="rcsb_pdb" referenceType={referenceType} identifier={identifier} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(identifier)).toHaveAttribute("aria-disabled", "true");
    expect(container.querySelector("script,img")).toBeNull();
  });

  it("does not allow a runtime record to carry destination metadata", () => {
    expect(validScientificReference({ reference_type: "pubmed", identifier: "6726807" })).toBe(true);
    for (const key of ["href", "url", "host", "url_template", "callback"]) {
      expect(validScientificReference({ reference_type: "pubmed", identifier: "6726807", [key]: "https://evil.example" })).toBe(false);
    }
  });
});

describe("reference detail composition", () => {
  it("renders an ordered bounded reference section through DetailPanel", () => {
    const record = { primary_references: [
      { reference_type: "doi", identifier: "10.1016/0022-2836(84)90472-8" },
      { reference_type: "pubmed", identifier: "6726807" },
    ] };
    expect(validDetailDescriptor({ component: "detail", title: "Structure detail", sections: [section] })).toBe(true);
    expect(validStructuredDetailRecord(record, [section], { strict: true })).toBe(true);
    render(<DetailPanel title="Structure detail" sections={[section]} record={record} pluginSlug="rcsb_pdb" />);
    expect(screen.getByRole("heading", { name: "Primary citation references" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it.each([
    ["unknown descriptor type", { ...section, reference_types: ["pubmed", "evil"] }],
    ["destination metadata", { ...section, url_template: "https://evil.example/{id}" }],
    ["unbounded list", { ...section, max_items: 101 }],
    ["duplicate types", { ...section, reference_types: ["pubmed", "pubmed"] }],
  ])("rejects %s", (_name, invalid) => {
    expect(validDetailDescriptor({ component: "detail", title: "Detail", sections: [invalid] })).toBe(false);
  });

  it.each([
    ["unknown type", [{ reference_type: "evil", identifier: "6726807" }]],
    ["structured identifier", [{ reference_type: "pubmed", identifier: { value: "6726807" } }]],
    ["duplicate reference", [{ reference_type: "pubmed", identifier: "6726807" }, { reference_type: "pubmed", identifier: "6726807" }]],
    ["extra response URL", [{ reference_type: "pubmed", identifier: "6726807", url: "https://evil.example" }]],
  ])("rejects %s response data", (_name, primary_references) => {
    expect(validStructuredDetailRecord({ primary_references }, [section], { strict: true })).toBe(false);
  });

  it("announces an empty declared reference section", () => {
    render(<DetailPanel title="Structure detail" sections={[section]}
      record={{ primary_references: [] }} pluginSlug="rcsb_pdb" />);
    expect(screen.getByRole("status")).toHaveTextContent("No primary citation references available");
  });
});
