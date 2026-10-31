import { describe, expect, it } from "vitest";
import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";

const ML_PLUGIN_SLUGS = [
  "omniml_studio", "variant_effect_intelligence", "single_cell_omics_intelligence",
  "anomaly_detection_omics", "auto_ml_biomarker_discovery", "deep_learning_variant_classifier",
  "drug_response_predictor", "drug_target_intelligence", "explainable_ai_interpreter",
  "gene_expression_regulatory_ai", "histopathology_cv", "multi_omics_integration_ai",
  "single_cell_trajectory_inference", "celltype_classification_sc", "variant_pathogenicity_classifier",
  "structural_variant_classifier", "scrna_celltype_classifier", "scrna_batch_integration_ae",
  "histopath_tumor_classifier", "histopath_nuclei_segmentation", "protein_function_classifier_esm",
  "protein_stability_ddg_predictor", "admet_property_predictor", "drug_target_binding_affinity",
  "protein_language_model_finetuner", "scrna_foundation_finetuner", "dna_sequence_finetuner",
  "histopath_foundation_finetuner", "chemistry_lm_finetuner", "antibody_lm_finetuner",
  "biomedical_vlm_finetuner",
];

describe("ML category native React coverage", () => {
  it("keeps all 31 Workbench ML plugins on a supported React renderer", () => {
    expect(new Set(ML_PLUGIN_SLUGS).size).toBe(31);
    for (const slug of ML_PLUGIN_SLUGS) {
      const renderer = resolveWorkbenchRenderer("async_analysis", slug);
      expect(typeof renderer, `${slug} has a React renderer`).toBe("function");
    }
    expect(resolveWorkbenchRenderer("query", "drug_target_intelligence")).toBeTruthy();
  });
});
