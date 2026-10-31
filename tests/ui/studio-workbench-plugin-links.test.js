import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BROAD_PLUGIN_SLUGS } from "../../src/ui/components/workbench/BroadPluginRenderers";
import { CENTURY_PLUGIN_SLUGS } from "../../src/ui/components/workbench/CenturyPluginRenderers";
import { NEXT_CENTURY_PLUGIN_SLUGS } from "../../src/ui/components/workbench/NextCenturyPluginRenderers";
import { FINAL_PLUGIN_SLUGS } from "../../src/ui/components/workbench/FinalPluginRenderers";

const source = fs.readFileSync(path.resolve("src/ui/pages/Studio.jsx"), "utf8");
const linkedPlugins = [
  "catalog", "onboardai", "genome_viewer", "dataset_catalog", "job_monitor", "plugin_manager", "provenance",
  "workflow_runner", "workflow_builder", "agent_workflow_studio", "pipeline_dashboard",
  "multi_agent_bio_orchestrator", "workflow_compiler", "rnaseq_analysis", "single_cell_analysis",
  "exome_analysis", "fastq_qc", "proteomics", "metabolomics_importer",
  "drug_target_intelligence", "pathway_enrichment", "bio_hypothesis_ai",
  "literature_summarizer", "bio_narrator_ai",
  "dataset_ingest", "run_inspector", "multiqc_wrapper", "reference_genome_manager",
  "deseq2_analysis", "variant_annotation", "molecular_docking",
  "object_registry_explorer", "artifact_manager", "file_transfer_manager", "data_lineage_tracker",
  "resource_cost_estimator", "omics_data_qc_harmonizer", "gsea_enrichment", "scanpy_clustering",
  "spatial_analysis", "alphafold", "geo_search", "pubmed_search", "gwas_catalog_search",
  "chembl_search", "civic", "literature_evidence_agent", "experimental_design_agent",
  "biomarker_discovery_agent", "variant_interpretation_agent", "clinical_report_generator",
  "data_manager", "checksum_integrity_manager", "storage_quota_manager", "fair_data_packager",
  "format_converter", "workflow_validator", "pdf_report_builder", "job_queue_manager",
  "environment_manager", "collaboration", "counts_matrix_qc", "volcano_plot", "heatmap_generator",
  "pca_analysis", "differential_abundance", "immune_deconvolution", "mutational_signatures",
  "tcr_bcr_repertoire", "rna_velocity_analysis", "cell_comm_visualization", "clinical_trial_matching",
  "privacy_deidentification", "clinical_data_quality_validator", "clinical_consent_manager", "gnomad",
  "fastq_trimmer", "variant_qc_filtering", "vcf_liftover", "bedtools_intersect", "deepvariant",
  "prs_builder", "spliceai", "scanpy_qc_metrics", "scanpy_markers", "single_cell_annotation",
  "spatial_clustering", "spatial_marker_identification", "atac_peak_calling", "atac_differential",
  "chipseq_qc_metrics", "chipseq_peak_annotation", "methylation_qc", "admet_prediction",
  "molecular_descriptors", "toxicity_prediction", "druglikeness_scoring", "auto_ml_biomarker_discovery",
  "clinvar", "ensembl", "uniprot",
  "assembly_qc", "nanopore_qc", "gene_annotation", "gwas_popgen", "phenotype_association",
  "protein_quantification", "ptm_analysis", "metabolomics_sample_qc", "metabolomics_normalize",
  "metabolomics_stats", "alpha_diversity", "beta_diversity", "microbiome_taxonomic_classifier",
  "amr_gene_classifier", "mag_quality", "binding_site_predictor", "docking_pose_viewer",
  "target_prediction", "drug_response_predictor", "protein_stability_ddg_predictor",
  "opentargets", "pubchem", "rcsb_pdb", "reactome", "gtex",
];

describe("Studio Workbench plugin links", () => {
  it("routes every plugin shortcut through the native PluginPage boundary", () => {
    expect(source).toContain("function workbenchPluginLink");
    for (const slug of linkedPlugins) expect(source).toContain(`\"${slug}\"`);
    expect(source).toContain("BROAD_PLUGIN_GROUPS.map");
    expect(BROAD_PLUGIN_SLUGS).toHaveLength(75);
    expect(source).toContain("CENTURY_PLUGIN_GROUPS.map");
    expect(CENTURY_PLUGIN_SLUGS).toHaveLength(100);
    expect(source).toContain("NEXT_CENTURY_PLUGIN_GROUPS.map");
    expect(NEXT_CENTURY_PLUGIN_SLUGS).toHaveLength(100);
    expect(source).toContain("FINAL_PLUGIN_GROUPS.map");
    expect(FINAL_PLUGIN_SLUGS).toHaveLength(101);
    expect(source).not.toContain("plugins/metabolomics_analysis/");
    expect(source).not.toContain("pipeline-dashboard/");
    expect(source).not.toContain("plugins/agent-workflows/");
  });
});
