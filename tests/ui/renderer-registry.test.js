import { describe, expect, it } from "vitest";
import { RENDERER_REGISTRY, normalizeRendererName, resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";
import JobMonitorRenderer from "../../src/ui/components/workbench/JobMonitorRenderer";
import GenomeViewerRenderer from "../../src/ui/components/workbench/GenomeViewerRenderer";
import DatasetCatalogRenderer from "../../src/ui/components/workbench/DatasetCatalogRenderer";
import PluginManagerRenderer from "../../src/ui/components/workbench/PluginManagerRenderer";
import AuditLogRenderer from "../../src/ui/components/workbench/AuditLogRenderer";
import WorkflowRunnerRenderer from "../../src/ui/components/workbench/WorkflowRunnerRenderer";

describe("allowlisted Workbench renderer registry", () => {
  it("contains the proven lifecycle renderers and the finite informational renderer", () => {
    expect(Object.keys(RENDERER_REGISTRY)).toEqual(["async_analysis", "informational", "query"]);
    expect(resolveWorkbenchRenderer("async_analysis")).toBeTruthy();
    expect(normalizeRendererName("generic_runner")).toBe("async_analysis");
    expect(resolveWorkbenchRenderer("generic_runner")).toBeTruthy();
    expect(resolveWorkbenchRenderer("query")).toBeTruthy();
    expect(resolveWorkbenchRenderer("informational")).toBeTruthy();
  });

  it("uses the dedicated React run-list renderer for Job Monitor", () => {
    expect(resolveWorkbenchRenderer("query", "job_monitor")).toBe(JobMonitorRenderer);
  });
  it("uses the dedicated React genome browser for Genome Viewer", () => {
    expect(resolveWorkbenchRenderer("generic_runner", "genome_viewer")).toBe(GenomeViewerRenderer);
  });
  it("uses the dedicated React catalog for Dataset Catalog", () => {
    expect(resolveWorkbenchRenderer("query", "dataset_catalog")).toBe(DatasetCatalogRenderer);
  });
  it.each([
    ["plugin_manager", PluginManagerRenderer], ["audit_log", AuditLogRenderer], ["workflow_runner", WorkflowRunnerRenderer],
  ])("uses a dedicated React renderer for %s", (slug, component) => {
    expect(resolveWorkbenchRenderer("query", slug)).toBe(component);
  });
  it.each([
    ["dataset_ingest", "generic_runner"],
    ["run_inspector", "generic_runner"],
    ["multiqc_wrapper", "query"],
    ["reference_genome_manager", "informational"],
    ["deseq2_analysis", "generic_runner"],
    ["variant_annotation", "generic_runner"],
    ["molecular_docking", "informational"],
  ])("uses the dedicated React renderer for %s", (slug, family) => {
    expect(resolveWorkbenchRenderer(family, slug)).toBeTruthy();
    expect(resolveWorkbenchRenderer(family, slug)).not.toBe(resolveWorkbenchRenderer(family));
  });

  it.each([
    ["object_registry_explorer", "query"], ["artifact_manager", "query"],
    ["file_transfer_manager", "query"], ["data_lineage_tracker", "query"],
    ["resource_cost_estimator", "generic_runner"], ["omics_data_qc_harmonizer", "async_analysis"],
    ["gsea_enrichment", "generic_runner"], ["scanpy_clustering", "async_analysis"],
    ["spatial_analysis", "async_analysis"], ["alphafold", "async_analysis"],
    ["geo_search", "async_analysis"], ["pubmed_search", "async_analysis"],
    ["gwas_catalog_search", "async_analysis"], ["chembl_search", "async_analysis"],
    ["civic", "query"], ["literature_evidence_agent", "informational"],
    ["experimental_design_agent", "informational"], ["biomarker_discovery_agent", "informational"],
    ["variant_interpretation_agent", "informational"], ["clinical_report_generator", "generic_runner"],
  ])("uses the expanded dedicated React renderer for %s", (slug, family) => {
    expect(resolveWorkbenchRenderer(family, slug)).toBeTruthy();
    expect(resolveWorkbenchRenderer(family, slug)).not.toBe(resolveWorkbenchRenderer(family));
  });

  it.each([
    ["data_manager", "query"], ["checksum_integrity_manager", "query"],
    ["storage_quota_manager", "query"], ["fair_data_packager", "generic_runner"],
    ["format_converter", "query"], ["workflow_validator", "query"],
    ["pdf_report_builder", "query"], ["job_queue_manager", "query"],
    ["environment_manager", "query"], ["collaboration", "generic_runner"],
    ["counts_matrix_qc", "generic_runner"], ["volcano_plot", "generic_runner"],
    ["heatmap_generator", "generic_runner"], ["pca_analysis", "informational"],
    ["differential_abundance", "informational"], ["immune_deconvolution", "informational"],
    ["mutational_signatures", "informational"], ["tcr_bcr_repertoire", "informational"],
    ["rna_velocity_analysis", "informational"], ["cell_comm_visualization", "async_analysis"],
    ["clinical_trial_matching", "generic_runner"], ["privacy_deidentification", "generic_runner"],
    ["clinical_data_quality_validator", "generic_runner"], ["clinical_consent_manager", "generic_runner"],
    ["gnomad", "query"],
  ])("uses the additional dedicated React renderer for %s", (slug, family) => {
    expect(resolveWorkbenchRenderer(family, slug)).toBeTruthy();
    expect(resolveWorkbenchRenderer(family, slug)).not.toBe(resolveWorkbenchRenderer(family));
  });

  it.each([
    ["fastq_trimmer", "generic_runner"], ["variant_qc_filtering", "generic_runner"],
    ["vcf_liftover", "generic_runner"], ["bedtools_intersect", "generic_runner"],
    ["deepvariant", "generic_runner"], ["prs_builder", "generic_runner"],
    ["spliceai", "generic_runner"], ["scanpy_qc_metrics", "async_analysis"],
    ["scanpy_markers", "async_analysis"], ["single_cell_annotation", "async_analysis"],
    ["spatial_clustering", "async_analysis"], ["spatial_marker_identification", "async_analysis"],
    ["atac_peak_calling", "generic_runner"], ["atac_differential", "generic_runner"],
    ["chipseq_qc_metrics", "async_analysis"], ["chipseq_peak_annotation", "async_analysis"],
    ["methylation_qc", "generic_runner"], ["admet_prediction", "async_analysis"],
    ["molecular_descriptors", "async_analysis"], ["toxicity_prediction", "async_analysis"],
    ["druglikeness_scoring", "async_analysis"], ["auto_ml_biomarker_discovery", "async_analysis"],
    ["clinvar", "query"], ["ensembl", "query"], ["uniprot", "query"],
  ])("uses the next dedicated React renderer for %s", (slug, family) => {
    expect(resolveWorkbenchRenderer(family, slug)).toBeTruthy();
    expect(resolveWorkbenchRenderer(family, slug)).not.toBe(resolveWorkbenchRenderer(family));
  });

  it.each([
    ["assembly_qc", "generic_runner"], ["nanopore_qc", "generic_runner"],
    ["gene_annotation", "generic_runner"], ["gwas_popgen", "generic_runner"],
    ["phenotype_association", "generic_runner"], ["protein_quantification", "generic_runner"],
    ["ptm_analysis", "generic_runner"], ["metabolomics_sample_qc", "generic_runner"],
    ["metabolomics_normalize", "generic_runner"], ["metabolomics_stats", "generic_runner"],
    ["alpha_diversity", "generic_runner"], ["beta_diversity", "generic_runner"],
    ["microbiome_taxonomic_classifier", "generic_runner"], ["amr_gene_classifier", "generic_runner"],
    ["mag_quality", "generic_runner"], ["binding_site_predictor", "generic_runner"],
    ["docking_pose_viewer", "async_analysis"], ["target_prediction", "async_analysis"],
    ["drug_response_predictor", "async_analysis"], ["protein_stability_ddg_predictor", "generic_runner"],
    ["opentargets", "query"], ["pubchem", "query"], ["rcsb_pdb", "query"],
    ["reactome", "query"], ["gtex", "query"],
  ])("uses the scientific dedicated React renderer for %s", (slug, family) => {
    expect(resolveWorkbenchRenderer(family, slug)).toBeTruthy();
    expect(resolveWorkbenchRenderer(family, slug)).not.toBe(resolveWorkbenchRenderer(family));
  });

  it.each(["search", "multi_step", "../../module", "https://evil.example", "javascript:alert(1)", "constructor", "prototype", "__proto__"])('rejects unsafe or unimplemented renderer "%s"', renderer => {
    expect(resolveWorkbenchRenderer(renderer)).toBeNull();
    expect(normalizeRendererName(renderer)).toBeNull();
  });
});
