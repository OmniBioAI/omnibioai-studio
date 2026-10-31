import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CLINICAL_PLUGIN_RENDERERS } from "../../src/ui/components/workbench/ClinicalPluginRenderers";

afterEach(cleanup);

const descriptor = {
  plugin: { slug: "test" }, inputs: [],
  endpoints: { submit: "/plugins/test/api/ui-run/", status: "/plugins/test/api/ui-status/{run_id}/", logs: "/plugins/test/api/ui-log/{run_id}/", artifacts: "/plugins/test/api/ui-artifacts/{run_id}/" },
  artifacts: { max_items: 20 },
};

describe("Clinical category React pages", () => {
  it.each([
    ["clinical_report_generator", "Clinical Report Generator"],
    ["clinical_report", "Clinical Report"],
    ["swimmer_plot", "Swimmer Plot"],
    ["clinical_db_mapping", "Clinical Database Mapping"],
    ["clinical_trial_matching", "Clinical Trial Matching"],
    ["gdc", "Genomic Data Commons"],
    ["phenopacket", "Phenopacket"],
    ["redcap", "REDCap Connector"],
    ["fhir_hl7", "FHIR / HL7 Interoperability"],
  ])("renders %s as a native React screen", (slug, title) => {
    const Renderer = CLINICAL_PLUGIN_RENDERERS[slug];
    const { container } = render(<Renderer descriptor={descriptor} />);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(container.querySelector("iframe, webview")).toBeNull();
    expect(container.innerHTML).not.toMatch(/<script/i);
  });
});
