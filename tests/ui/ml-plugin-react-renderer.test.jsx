import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ML_PLUGIN_UI_SLUGS, ML_PLUGIN_RENDERERS, CelltypeClassificationReactRenderer, DrugTargetIntelligenceReactRenderer } from "../../src/ui/components/workbench/MLPluginReactRenderer";
import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const allML = [
  "omniml_studio", "variant_effect_intelligence", "single_cell_omics_intelligence", "anomaly_detection_omics", "auto_ml_biomarker_discovery", "deep_learning_variant_classifier", "drug_response_predictor", "drug_target_intelligence", "explainable_ai_interpreter", "gene_expression_regulatory_ai", "histopathology_cv", "multi_omics_integration_ai", "single_cell_trajectory_inference", "celltype_classification_sc", "variant_pathogenicity_classifier", "structural_variant_classifier", "scrna_celltype_classifier", "scrna_batch_integration_ae", "histopath_tumor_classifier", "histopath_nuclei_segmentation", "protein_function_classifier_esm", "protein_stability_ddg_predictor", "admet_property_predictor", "drug_target_binding_affinity", "protein_language_model_finetuner", "scrna_foundation_finetuner", "dna_sequence_finetuner", "histopath_foundation_finetuner", "chemistry_lm_finetuner", "antibody_lm_finetuner", "biomedical_vlm_finetuner",
];

describe("historical ML interfaces rebuilt as React workflows", () => {
  it("routes every Workbench ML plugin to a React UI rather than the generic guided shell", () => {
    expect(new Set(allML).size).toBe(31);
    for (const slug of allML) {
      const Renderer = resolveWorkbenchRenderer("async_analysis", slug);
      expect(typeof Renderer, `${slug} resolves`).toBe("function");
      expect(Renderer).not.toBe(resolveWorkbenchRenderer("async_analysis"));
    }
    for (const slug of ML_PLUGIN_UI_SLUGS) expect(ML_PLUGIN_RENDERERS[slug]).toBeTruthy();
    expect(ML_PLUGIN_UI_SLUGS).toHaveLength(27);
    expect(ML_PLUGIN_RENDERERS.variant_effect_intelligence).toBeTruthy();
  });

  it("renders original AutoML controls as React inputs", () => {
    const Renderer = ML_PLUGIN_RENDERERS.auto_ml_biomarker_discovery;
    render(<Renderer descriptor={{ plugin: { slug: "auto_ml_biomarker_discovery" } }} />);
    expect(screen.getByRole("heading", { name: "AutoML Biomarker Discovery" })).toBeTruthy();
    expect(screen.getByLabelText(/Expression matrix/)).toBeTruthy();
    expect(screen.getByLabelText(/Sample labels/)).toBeTruthy();
    expect(screen.getByLabelText(/Algorithms/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run analysis" })).toBeTruthy();
  });

  it.each(ML_PLUGIN_UI_SLUGS)("renders the plugin-specific form and run monitor for %s", slug => {
    const Renderer = ML_PLUGIN_RENDERERS[slug];
    render(<Renderer descriptor={{ plugin: { slug } }} />);
    expect(screen.getByText("Configure analysis")).toBeTruthy();
    expect(screen.getByText("Run monitor")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Run analysis|Start training/ })).toBeTruthy();
  });

  it("keeps the historic train/infer switch and reveals training inputs", () => {
    const Renderer = ML_PLUGIN_RENDERERS.variant_pathogenicity_classifier;
    render(<Renderer descriptor={{ plugin: { slug: "variant_pathogenicity_classifier" } }} />);
    fireEvent.change(screen.getByLabelText("Operation"), { target: { value: "train" } });
    expect(screen.getByLabelText(/Labels \/ targets/)).toBeTruthy();
    expect(screen.getByLabelText(/Training hyperparameters/)).toBeTruthy();
  });

  it("posts Variant Effect inputs to the legacy operation and converts registered outputs to React links", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '<main><a href="/plugins/variant_effect_intelligence/download/vei-ranked-1/">Download ranked.tsv</a><a href="/plugins/variant_effect_intelligence/download/vei-flat-1/">Download flat.tsv</a></main>' }));
    const Renderer = ML_PLUGIN_RENDERERS.variant_effect_intelligence;
    render(<Renderer descriptor={{ plugin: { slug: "variant_effect_intelligence" } }} />);
    fireEvent.change(screen.getByLabelText(/Annotated VCF OmniObject ID/), { target: { value: "annotated-vcf-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    expect(await screen.findByText("Download ranked.tsv")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Open / download" })[0]).toHaveAttribute("href", expect.stringContaining("/plugins/variant_effect_intelligence/download/vei-ranked-1/"));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/plugins/variant_effect_intelligence/run/"), expect.objectContaining({ method: "POST" }));
  });

  it("renders separate drug-target evidence sources and ranking controls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }));
    render(<DrugTargetIntelligenceReactRenderer />);
    expect(await screen.findByRole("heading", { name: "Drug-Target Intelligence" })).toBeTruthy();
    expect(screen.getByLabelText("Evidence source")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rank interactions" })).toBeTruthy();
  });

  it("renders the old celltype train and prediction workflows in React", () => {
    render(<CelltypeClassificationReactRenderer />);
    expect(screen.getByRole("heading", { name: "scRNA-seq Cell-Type Classification" })).toBeTruthy();
    expect(screen.getByLabelText("Workflow")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Train and register model" })).toBeTruthy();
  });
});
