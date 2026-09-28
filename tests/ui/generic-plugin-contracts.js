const GENERIC_PLUGIN_SLUGS = [
  "admixture_analysis", "alpha_diversity", "assembly_qc", "atac_differential",
  "atac_footprinting", "atac_peak_calling", "beta_diversity", "binding_site_predictor",
  "chromatin_accessibility", "chromatin_state", "counts_matrix_qc", "deseq2_analysis",
  "dia_analysis", "dmr_analysis", "docking_analysis", "fst_calculator", "gsea_enrichment",
  "hic_analysis", "irfinder_analysis", "isoform_analysis", "ld_analysis", "leafcutter_analysis",
  "mag_quality", "methylation_qc", "nanopore_qc", "plate_designer", "protein_evolution",
  "protein_interaction", "protein_quantification", "ptm_analysis", "rmats_analysis",
  "sample_sheet_generator", "selection_scan", "suppa2_analysis", "tad_caller",
];

export const NORMALIZATION_REQUIRED = new Set([
  "atac_differential", "atac_footprinting", "atac_peak_calling", "dia_analysis",
  "dmr_analysis", "fst_calculator", "ld_analysis", "leafcutter_analysis", "plate_designer",
  "protein_evolution", "protein_interaction", "protein_quantification", "ptm_analysis",
  "rmats_analysis", "sample_sheet_generator", "selection_scan", "suppa2_analysis", "tad_caller",
]);

export const CURRENT_NATIVE_PILOTS = new Set(GENERIC_PLUGIN_SLUGS);

function input(id, component = "file", required = true) {
  return {
    id,
    component,
    label: id.replaceAll("_", " "),
    description: "Validated generic runner input",
    required,
    format: component === "file" ? "tsv" : "txt",
  };
}

export const GENERIC_PLUGIN_CONTRACTS = GENERIC_PLUGIN_SLUGS.map(slug => ({
  slug,
  renderer: "async_analysis",
  native_supported: true,
  normalization_required: NORMALIZATION_REQUIRED.has(slug),
  normalization_complete: true,
  inputs: [input(`${slug}_input`)],
  capabilities: { submit: true, status: true, logs: true, artifacts: true, downloads: true },
  descriptor_gaps: [],
}));

export const ALL_GENERIC_PLUGIN_SLUGS = GENERIC_PLUGIN_SLUGS;
