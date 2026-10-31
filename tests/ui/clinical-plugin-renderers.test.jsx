import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLINICAL_PLUGIN_RENDERERS } from "../../src/ui/components/workbench/ClinicalPluginRenderers";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
    if (slug === "clinical_report_generator") {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ fields: [] }) }));
    }
    const { container } = render(<Renderer descriptor={descriptor} />);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(container.querySelector("iframe, webview")).toBeNull();
    expect(container.innerHTML).not.toMatch(/<script/i);
  });

  it("loads registry-backed report inputs and submits the existing report workflow", async () => {
    const fields = [
      { name: "variant_ranked_table", label: "Ranked variants *", required: true, options: [{ id: "v1", label: "Variants" }] },
      { name: "pathogenicity_scoring", label: "Pathogenicity scoring *", required: true, options: [{ id: "p1", label: "Pathogenicity" }] },
      { name: "clinical_db_mapping", label: "Clinical DB mapping *", required: true, options: [{ id: "c1", label: "Clinical map" }] },
    ];
    const fetchMock = vi.fn(async (url, options = {}) => ({
      ok: true,
      json: async () => url.includes("api/configure") ? { fields } : (options.method === "POST" ? { run_id: "r-1", status: "QUEUED" } : { state: "RUNNING" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const Renderer = CLINICAL_PLUGIN_RENDERERS.clinical_report_generator;
    render(<Renderer />);
    fireEvent.change(await screen.findByLabelText("Case ID"), { target: { value: "CASE-1" } });
    fireEvent.change(screen.getByLabelText("Ranked variants · required"), { target: { value: "v1" } });
    fireEvent.change(screen.getByLabelText("Pathogenicity scoring · required"), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText("Clinical DB mapping · required"), { target: { value: "c1" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/_svc/workbench/plugins/clinical_report_generator/api/run/", expect.objectContaining({ method: "POST" })));
    const submitted = JSON.parse(fetchMock.mock.calls.find(([url, options]) => url.endsWith("/api/run/") && options?.method === "POST")[1].body);
    expect(submitted).toMatchObject({ case_id: "CASE-1", artifact_object_ids: { variant_ranked_table: "v1", pathogenicity_scoring: "p1", clinical_db_mapping: "c1" } });
  });
});
