import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validatePluginDescriptor } from "../../src/ui/lib/pluginApi";
import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";
import { resolveWorkbenchComponent } from "../../src/ui/components/workbench/componentRegistry";

// Cross-repository check: generate from actual Django registry state, never a
// hand-maintained copy of 501 manifests. Opt in where the backend is available.
const source = process.env.WORKBENCH_SOURCE;
const enabled = Boolean(source);
describe.skipIf(!enabled)("generated Workbench catalog compatibility", () => {
  // Batch 5 (uk_biobank, ega, eggnog, dbnsfp, marrvel, thousand_genomes) adds
  // the campaign's own next six reference_db plugins on top of this
  // already-integrated baseline (Workbench commit 7ea5b6bf on
  // feat/refdb-batch5-uk-biobank-ega-eggnog-dbnsfp-marrvel-thousand-genomes,
  // itself Workbench's original Batch 5 commit 26ab2ac0 cherry-picked onto
  // fresh main since that branch's earlier Batches 1-4 are already present
  // here via the Claude+Codex integration merge).
  // Wave A (native-ui-501 campaign) adds 23 native plugins on top of that:
  // 5 QUERY_COMPONENT_PILOTS (artifact_manager, catalog, fhir_hl7,
  // format_converter, object_registry_explorer -- format_converter was a
  // held test anchor, now migrated), 4 ASYNC_ANALYSIS_PILOTS (agentic_pymol,
  // alphafold, docking_pose_viewer, ppi_network_plot), and 14
  // NATIVE_GENERIC_RUNNER_PILOTS (clinical_consent_manager,
  // clinical_data_quality_validator, clinical_db_mapping,
  // clinical_report_generator, clinical_trial_matching, collaboration,
  // dataset_ingest, fair_data_packager, privacy_deidentification, redcap,
  // reference_registry, resource_cost_estimator, run_inspector, and
  // voice_command). spatial_imaging_io stays legacy because its image input
  // is required for two of three operations, which schema v1 cannot express.
  // Wave G+H (native-ui-501-ghi release) adds 3 more native plugins on top
  // of that: security_dashboard (schema-v2 query, reusing the validated
  // staff/IAM-authorized query descriptor -- no new renderer), and
  // spatial_imaging_io + workflow_scheduler (schema-v1 async_analysis, now
  // that shared condition-any field support exists for spatial_imaging_io's
  // image-required-for-either-operation shape, and server-owned actor
  // injection exists for workflow_scheduler).
  // Wave L adds pipeline_dashboard (schema-v2 query): its existing
  // authenticated, owner-filtered api_dashboard view is reused verbatim
  // through a new plugin-local ui_query.py adapter that only projects the
  // response into the shared scalar table envelope -- no new renderer, no
  // new endpoint, no broadened scope.
  // Wave S3 adds workflow_runner after qualifying its authenticated lifecycle.
  it("validates integrated native descriptors and legacy fallbacks", () => {
    const exporter = path.join(source, "scripts/export_workbench_ui_compatibility.py");
    expect(existsSync(exporter)).toBe(true);
    const catalog = JSON.parse(execFileSync(process.env.PYTHON || "python3", ["-B", exporter], {
      cwd: source, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", DJANGO_DEBUG: "true", DJANGO_SETTINGS_MODULE: "omnibioai.settings_test" },
    }));
    expect(catalog.counts).toEqual({ enabled: 501, native: 488, legacy: 13 });
    expect(catalog.plugins).toHaveLength(501);
    const native = catalog.plugins.filter(plugin => plugin.descriptor.native_supported);
    expect(native.filter(plugin => plugin.schema_version === 1)).toHaveLength(373);
    expect(native.filter(plugin => plugin.schema_version === 2).map(plugin => plugin.slug).sort()).toEqual([
      "alerting", "all_of_us", "api_analytics", "artifact_manager", "audit_log",
      "bindingdb", "bio_agent", "biogrid", "bioportal", "brenda",
      "catalog", "cbioportal", "ccle", "cell_ontology", "cellchat",
      "chebi", "checksum_integrity_manager", "civic", "clingen", "clinicaltrials_gov",
      "cpic", "data_lineage_tracker", "data_manager", "dataset_catalog", "dbgap", "dbmts",
      "dbnsfp", "dbsnp", "depmap", "dgidb", "dip",
      "disease_ontology", "disgenet", "drug_target_intelligence", "drugcentral", "drugsatfda",
      "ega", "eggnog", "ena", "encode", "ensembl",
      "environment_manager", "expression_atlas", "fhir_hl7", "file_transfer_manager", "format_converter",
      "gdc", "gene_ontology", "genereviews", "gnomad", "gtex",
      "hgmd", "hgnc", "histopathology_cv", "hmdb", "hpa",
      "icgc", "infra_ai_copilot", "intact", "integration_connections", "interpro",
      "job_monitor", "job_queue_manager", "kegg", "lipidmaps", "lovd",
      "marrvel", "mastermind", "mavedb", "medgen", "metabolights",
      "mondo", "msigdb", "multiqc_wrapper", "ncbi", "notification_center",
      "object_registry_explorer", "omim", "omniml_studio", "opentargets", "orphanet",
      "panglaodb", "panther", "pdb_redo", "pdbe", "pdbsum",
      "pdf_report_builder", "pharmvar", "pharos", "phegeni", "pipeline_dashboard",
      "pride", "proteomexchange", "pubchem", "rcsb_pdb", "rfam",
      "rxnorm", "schema_registry", "security_dashboard", "sgd", "snpedia",
      "sra", "storage_quota_manager", "string_db", "swisslipids", "t3db",
      "targetscan", "tcga", "thousand_genomes", "topmed", "ucsc",
      "uk_biobank", "uniprot", "wikipathways", "workflow_validator", "wormbase",
    ]);
    expect(native.filter(plugin => plugin.schema_version === 1 && plugin.renderer === "query")).toHaveLength(9);
    expect(native.filter(plugin => plugin.schema_version === 1 && plugin.renderer === "async_analysis").map(plugin => plugin.slug).sort()).toEqual([
      "admet_prediction", "agent_workflow_studio", "agentic_pymol", "alphafold", "anomaly_detection_omics", "atlassian",
      "auto_ml_biomarker_discovery", "aws_healthomics", "benchling", "bio_hypothesis_ai", "bio_narrator_ai", "bionemo", "cell_comm_visualization",
      "celltype_classification_sc", "chembl_search", "chemoinfo_intelligence",
      "chipseq_differential_binding", "chipseq_motif_analysis", "chipseq_peak_annotation",
      "chipseq_peakset_ops", "chipseq_qc_metrics", "chipseq_report_generator", "chipseq_signal_plots", "circrna_plotter", "circrna_postprocess", "circtools_runner",
      "cloud_integration", "clustering", "deep_learning_variant_classifier", "dnanexus",
      "docking_pose_viewer", "drug_report_generator", "drug_response_predictor",
      "druglikeness_scoring", "dvc", "elabftw", "exome_analysis", "explainable_ai_interpreter",
      "figshare", "ga4gh_interoperability", "gene_expression_regulatory_ai", "geo_search", "gwas_catalog_search",
      "home", "jaspar_search", "jupyterhub", "kegg_search", "knime", "labkey", "lims_integration", "literature_summarizer", "manhattan_qq_plot",
      "marker_identification", "mechanism_analysis",
      "microsoft_graph", "ml_eval_plots", "molecular_descriptors", "molecule_validation", "msa_conservation_viewer", "multi_agent_bio_orchestrator",
      "multi_omics_integration_ai",
      "omics_data_qc_harmonizer", "omics_qc_metrics_extractor", "omics_qc_report_generator", "omninotebook_ai", "onboardai",
      "openspecimen", "pathway_mapping", "plugin_manager", "ppi_network_plot", "proteomics", "provenance", "pubmed_search", "qc_plots", "resource_monitoring",
      "rnaseq_analysis", "s3_integration", "sashimi_plot", "scanpy_clustering", "scanpy_markers", "scanpy_qc_metrics",
      "seven_bridges", "single_cell_analysis", "single_cell_annotation", "single_cell_loom_viewer",
      "single_cell_omics_intelligence", "single_cell_trajectory_inference", "spatial_analysis", "spatial_clustering", "spatial_imaging_io", "spatial_marker_identification",
      "spatial_report_generation", "target_prediction", "terra", "threshold_recommendation", "toxicity_prediction",
      "variant_effect_intelligence", "venn_upset_plot", "workflow_runner", "workflow_scheduler", "zenodo",
    ]);
    for (const entry of catalog.plugins) {
      const descriptor = validatePluginDescriptor(entry.descriptor, entry.slug);
      if (!descriptor.native_supported) {
        expect(descriptor.renderer).toBe("legacy");
        continue;
      }
      expect(resolveWorkbenchRenderer(descriptor.renderer), entry.slug).toBeTruthy();
      const inputs = descriptor.operations?.flatMap(operation => operation.inputs) ?? descriptor.inputs;
      for (const input of inputs) {
        expect(resolveWorkbenchComponent(input.component ?? input.widget), `${entry.slug}:${input.id}`).toBeTruthy();
        if (input.id === "hyperparams") expect(input.component ?? input.widget).toBe("textarea");
      }
    }
    expect(native.filter(plugin => plugin.renderer === "informational")).toHaveLength(138);
    for (const held of ["workflow_builder", "workflow_compiler", "workflow_explorer", "workflow_registry_admin"]) {
      expect(catalog.plugins.find(entry => entry.slug === held).descriptor.native_supported).toBe(false);
    }
  }, 60000);
});
