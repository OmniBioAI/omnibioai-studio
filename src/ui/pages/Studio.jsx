import React, { useState, useEffect, useMemo } from "react";
import { isElectron, getCurrentUserSync, getCurrentUser, onSessionChange } from "../lib/session";
import { applicationUrl } from "../lib/workbenchApi";
import OmniBioAILogo from "../components/brand/OmniBioAILogo";
import { useAppearance } from "../components/AppearanceProvider";
import { openExternal } from "../lib/externalLink";
import { getStandaloneOnlyApp, standaloneAppUrl } from "../lib/standaloneApps";
import { BROAD_PLUGIN_GROUPS } from "../components/workbench/BroadPluginRenderers";
import { CENTURY_PLUGIN_GROUPS } from "../components/workbench/CenturyPluginRenderers";
import { NEXT_CENTURY_PLUGIN_GROUPS } from "../components/workbench/NextCenturyPluginRenderers";
import { FINAL_PLUGIN_GROUPS } from "../components/workbench/FinalPluginRenderers";

// Permission gate for the Admin Console tile — reuses the same permission
// string control-center's own backend gates its core admin routes on
// (services/summary/health/config/docker routers, main.py:
// `Depends(require_permission("platform.manage_infra"))`), rather than
// inventing a separate frontend-only notion of "admin". A user without it
// would just hit 403s once inside admin.omnibioai.org anyway — same
// reasoning as the existing "Roles" nav item in App.jsx, which gates on
// manage_roles for the same reason (don't show every signed-in researcher
// an entry point to a surface most of them can't use).
const ADMIN_CONSOLE_PERMISSION = "platform.manage_infra";
const MANAGE_CONFIG_PERMISSION = "manage_config";
const MANAGE_LICENSES_PERMISSION = "manage_licenses";
const MANAGE_ALL_ORGS_PERMISSION = "manage_all_orgs";
const ORCHESTRATOR_SLUG = "multi_agent_bio_orchestrator";
const ORCHESTRATOR_LAUNCH_PATH = "/plugins/multi_agent_bio_orchestrator/";

function openWorkbenchApplication(slug, launchPath, label) {
  window.dispatchEvent(new CustomEvent("open-service", {
    detail: {
      url: applicationUrl(launchPath),
      label,
      source: "workbench",
      pluginSlug: slug,
      backLabel: "Back to Studio",
    },
  }));
}

function workbenchPluginLink(label, slug, icon, desc, launchPath = `/plugins/${slug}/`) {
  return {
    label, icon, desc, url: applicationUrl(launchPath),
    action: () => openWorkbenchApplication(slug, launchPath, label),
  };
}

function getInitialHost() {
  return (
    window.__OMNIBIOAI_SERVER__ ||
    import.meta.env.VITE_HOST ||
    "webstudio.omnibioai.org"
  );
}

function buildCategories(BASE) {
  const categories = [
    {
      name: "Platform Services",
      color: "var(--accent-platform)",
      links: [
        // omnibioai-docs (Docusaurus) can't be proxied under a /_svc/
        // prefix the way the rest of these are — its build has baseUrl:
        // '/' (site/docusaurus.config.js), so every asset and nav link in
        // the rendered HTML is an absolute root path with no idea it might
        // be served under a prefix. nginx-router.conf's /_svc/docs redirects
        // into the already-correct docs.omnibioai.org host instead of
        // re-proxying those same broken-by-construction paths under a
        // second prefix — see that location's own comment. Was
        // /docs/guides/getting-started.html, a path that hasn't existed
        // since the docs site moved to its current dist/user/... layout.
        { label:"Getting Started",  url:"/_svc/docs/user/getting-started/", icon:"📖", desc:"Setup · Cloud · HPC · LLM guide" },
        { label:"Video Tutorials",  url:"/_svc/videos",              icon:"🎬", desc:"Tutorial videos · Walkthroughs"   },
        { label:"Workbench",        url:"",                          icon:"🏠", desc:"Application catalog", action: () => window.dispatchEvent(new CustomEvent("navigate", { detail: 13 })) },
        // Same ControlApp as the standalone site, mounted through Studio's
        // JWT gate and the existing platform.manage_infra permission check.
        { label:"Control Center",   url:"/_svc/control/",            icon:"🖥️", desc:"Overview · Evidence · Ecosystem"   },
        // Admin Console (control-center-web's AdminApp build, dist-admin) —
        // reached directly at admin.omnibioai.org, not through nginx-router
        // at all: cloudflared points both admin.omnibioai.org and
        // control.omnibioai.org straight at control-center-web:5174, whose
        // own nginx (control-center.conf) does the host-based dist-control/
        // dist-admin split and proxies to control-center's backend, gated
        // there by the same require_permission("platform.manage_infra") IAM
        // check this tile itself gates on below — a later, deliberate
        // architecture (PR14.7B/C) that superseded nginx-router.conf's own
        // now-inert /_svc/control auth_request block. Absolute cross-origin
        // URL, same reason as Getting Started above: AdminApp's own Vite
        // build has no `base` set either, so it's root-absolute-path and
        // can't be proxied under a /_svc/ prefix without breaking assets.
        { label:"Admin Console",    url:"https://admin.omnibioai.org/", icon:"🛡️", desc:"Org/user/IAM · Billing · Compliance", requiresPermission: ADMIN_CONSOLE_PERMISSION },
        // Neo4j Browser uses the same authenticated, same-origin
        // ServiceViewer path as the other Workbench services. Neo4j serves
        // its Browser UI below /browser/ (the root is JSON discovery), so
        // retain that path under the protected /neo4j/ prefix for relative
        // assets and Browser API/WebSocket URLs.
        { label:"Neo4j Browser",    url:"/neo4j/browser/",            icon:"🕸️", desc:"Knowledge-graph Cypher console", requiresPermission: ADMIN_CONSOLE_PERMISSION },
        { label:"LLM Runtime",      url:"",                                      icon:"🤖", desc:"Local models · GPU · Ollama", action: () => window.dispatchEvent(new CustomEvent("navigate", { detail: 1 })), requiresPermission: MANAGE_CONFIG_PERMISSION },
        { label:"Entitlements",     url:"https://admin.omnibioai.org/billing",    icon:"🔑", desc:"Plans · Licenses · Access", requiresPermission: MANAGE_LICENSES_PERMISSION },
        // Internal Studio page (src/ui/pages/Billing.jsx, App.jsx step 12),
        // not an nginx-proxied service view like the tiles around it —
        // billing-service exposes only a JSON API, no UI of its own — so
        // this fires the same in-app "navigate" event the offline banner
        // uses rather than open()-ing a URL in a webview. url:"" keeps the
        // tile's isLocal/clickable check (which calls url.startsWith) happy.
        // TODO: gate this behind an appropriate permission before wider
        // rollout — currently ungated for testing, unlike Admin Console/
        // Control Center/Neo4j which use platform.manage_infra. Billing
        // data (usage/limits/costs) may reasonably be visible to regular
        // org members, so revisit the right permission level (possibly
        // org membership itself, not platform.manage_infra). See #79.
        { label:"Billing",          url:"",                          icon:"💳", desc:"Plan · usage · status", action: () => window.dispatchEvent(new CustomEvent("navigate", { detail: 12 })) },
        { label:"LIMS",             url:"/_svc/lims/",               icon:"🧪", desc:"Lab data management"              },
        { label:"Model Registry",   url:"/_svc/modelregistry",       icon:"🧬", desc:"ML model versioning"              },
        { label:"RAG / Lit AI",     url:"/_svc/rag/",                icon:"📚", desc:"PubMed RAG + DeepSeek"            },
        { label:"TES / Jobs",       url:"/_svc/tes",                 icon:"🚀", desc:"Slurm/AWS/Azure/GCP"              },
        { label:"Tool Images",      url:"/_svc/toolimages",          icon:"🐳", desc:"ARM64 SIF dashboard"              },
        { label:"Launcher",          url:"/_svc/sdk",                 icon:"🔬", desc:"Jupyter · RStudio · VS Code"      },
        { label:"Workflows",        url:"/_svc/workflows",           icon:"⚡", desc:"WDL/NF/Snake/CWL"                },
        { label:"Dev Hub",          url:"/_svc/devhub",              icon:"🛠️", desc:"Knowledge graph · RAG search"    },
        { label:"Metrics",           url:"/_svc/monitor",              icon:"📊", desc:"Grafana dashboard"               },
      ]
    },
    {
      name: "Security Control Plane",
      color: "var(--color-status-danger)",
      links: [
        { label:"API Gateway",      url:"/_svc/gateway/docs",        icon:"🔐", desc:"Entry point · JWT enforcement"    },
        { label:"Auth Service",     url:"/_svc/auth/docs",           icon:"🪪", desc:"JWT · Login · Register"           },
        { label:"Policy Engine",    url:"/_svc/policy/docs",         icon:"📋", desc:"RBAC · ABAC decisions"            },
        { label:"HPC Policy",       url:"/_svc/hpc/",                icon:"⚡", desc:"GPU/CPU quota governance"         },
        { label:"Security Audit",   url:"/_svc/audit/docs",          icon:"📝", desc:"Redis Streams audit log"          },
        // Trailing slash is required, not cosmetic: nginx-router.conf's
        // `location ^~ /_svc/opa { rewrite ^/_svc/opa(/.*)$ $1 break; ... }`
        // only fires when something follows the prefix. Without it (as this
        // tile had until the 404 was diagnosed), the unrewritten "/_svc/opa"
        // path gets forwarded straight to OPA, which -- unlike the Vite dev
        // servers most other /_svc/* tiles proxy to, which fall back to
        // index.html for any unknown path -- has no such fallback and
        // genuinely 404s. Same convention already used correctly by the
        // RAG and HPC Policy tiles above (`/_svc/rag/`, `/_svc/hpc/`): any
        // tile whose nginx location strips its prefix via this rewrite
        // pattern needs a trailing slash on its url here, or it silently
        // breaks for whichever upstream doesn't paper over the raw path.
        { label:"OPA",              url:"/_svc/opa/",                icon:"🛡️", desc:"Open Policy Agent"               },
        { label:"API Keys & Service Accounts", url:"https://admin.omnibioai.org/iam/service-accounts", icon:"🔑", desc:"API Keys · OAuth · Revocation", requiresAnyPermission:["manage_api_keys", "manage_oauth_clients", MANAGE_ALL_ORGS_PERMISSION] },
        { label:"Compliance Center", url:"https://admin.omnibioai.org/hipaa-compliance", icon:"🛡️", desc:"HIPAA · Controls · Evidence", requiresPermission:MANAGE_ALL_ORGS_PERMISSION },
        { label:"Security Posture",  url:"https://admin.omnibioai.org/security-posture", icon:"🔍", desc:"Controls · Enforcement · Readiness", requiresPermission:MANAGE_ALL_ORGS_PERMISSION },
        // toolserver — already proxied at /_svc/toolserver (nginx-router.conf),
        // gated there by its own auth_request (admin cookie, MANAGE_CONFIG-
        // level), not a frontend requiresPermission check — same as every
        // other tile in this section, which rely on the backend/nginx gate
        // rather than hiding the tile client-side.
        { label:"Tool Executor",    url:"/_svc/toolserver/docs",     icon:"🧰", desc:"Register · execute · results"     },
        { label:"Audit Explorer",   url:"https://admin.omnibioai.org/audit-explorer", icon:"🔎", desc:"Events · Evidence · Investigation", requiresPermission:MANAGE_ALL_ORGS_PERMISSION },
        { label:"Audit Logs",       url:"https://admin.omnibioai.org/audit-logs", icon:"📜", desc:"Identity · Access · Changes", requiresPermission:MANAGE_ALL_ORGS_PERMISSION },
      ]
    },
    {
      name: "Core Platform",
      color: "var(--accent)",
      links: [
        workbenchPluginLink("Genome Viewer", "genome_viewer", "👁️", "Inspect genomic features"),
        workbenchPluginLink("Dataset Catalog", "dataset_catalog", "🗂️", "Browse governed datasets"),
        workbenchPluginLink("Job Monitor", "job_monitor", "📊", "Monitor jobs"),
        workbenchPluginLink("Plugin Manager", "plugin_manager", "🔌", "Manage plugins"),
        workbenchPluginLink("Activity Explorer", "audit_log", "📜", "Explore governed platform activity"),
        workbenchPluginLink("Workflow Runner", "workflow_runner", "⚡", "Run workflows"),
      ]
    },
    {
      name: "Agentic",
      color: "var(--accent2)",
      links: [
        workbenchPluginLink("OnboardAI", "onboardai", "🤖", "AI developer tools"),
      ]
    },
    {
      name: "Workflows",
      color: "var(--accent2)",
      links: [
        workbenchPluginLink("Workflow Runner", "workflow_runner", "⚡", "Run workflows"),
        workbenchPluginLink("Workflow Builder", "workflow_builder", "🔧", "Build workflows"),
        workbenchPluginLink("Agent Studio", "agent_workflow_studio", "🤝", "Multi-agent workflows"),
        workbenchPluginLink("Pipeline", "pipeline_dashboard", "🔄", "Pipeline dashboard"),
        workbenchPluginLink("Multi-Agent Orchestrator", ORCHESTRATOR_SLUG, "🤖", "Multi-agent biological workflows", ORCHESTRATOR_LAUNCH_PATH),
        workbenchPluginLink("Workflow Compiler", "workflow_compiler", "⚙️", "Compile and optimize workflows"),
      ]
    },
    {
      name: "Omics Analysis",
      color: "var(--accent3)",
      links: [
        workbenchPluginLink("RNA-Seq", "rnaseq_analysis", "🧬", "RNA-Seq analysis"),
        workbenchPluginLink("Single Cell", "single_cell_analysis", "🔬", "scRNA-Seq"),
        workbenchPluginLink("Exome Analysis", "exome_analysis", "🧫", "Exome sequencing"),
        workbenchPluginLink("FASTQ QC", "fastq_qc", "✅", "Quality control"),
        workbenchPluginLink("Proteomics", "proteomics", "⚗️", "Proteomics analysis"),
        workbenchPluginLink("Metabolomics", "metabolomics_importer", "🔭", "Import metabolomics data"),
      ]
    },
    {
      name: "Research Essentials",
      color: "var(--accent-platform)",
      links: [
        workbenchPluginLink("Dataset Ingest", "dataset_ingest", "📥", "Validate and register scientific data"),
        workbenchPluginLink("Run Inspector", "run_inspector", "🔎", "Runs, logs, artifacts and evidence"),
        workbenchPluginLink("MultiQC", "multiqc_wrapper", "📈", "Aggregate and compare QC reports"),
        workbenchPluginLink("Reference Genomes", "reference_genome_manager", "🧬", "Genomes, annotations and indexes"),
        workbenchPluginLink("DESeq2", "deseq2_analysis", "📊", "Differential expression analysis"),
        workbenchPluginLink("Variant Annotation", "variant_annotation", "🧫", "Annotate variants with local evidence"),
        workbenchPluginLink("Molecular Docking", "molecular_docking", "🧪", "Validate, dock and rank poses"),
      ]
    },
    {
      name: "Data & Reproducibility",
      color: "var(--accent2)",
      links: [
        workbenchPluginLink("Object Registry", "object_registry_explorer", "🗂️", "Browse governed scientific objects"),
        workbenchPluginLink("Artifact Manager", "artifact_manager", "📦", "Versioned artifacts and provenance"),
        workbenchPluginLink("File Transfers", "file_transfer_manager", "↔️", "Secure resumable data transfers"),
        workbenchPluginLink("Data Lineage", "data_lineage_tracker", "🕸️", "Trace datasets, tools and executions"),
        workbenchPluginLink("Cost Estimator", "resource_cost_estimator", "🧮", "Plan compute resources and cost"),
      ]
    },
    {
      name: "Advanced Analysis",
      color: "var(--accent3)",
      links: [
        workbenchPluginLink("Omics Harmonizer", "omics_data_qc_harmonizer", "🧬", "Cross-omics QC and harmonization"),
        workbenchPluginLink("GSEA", "gsea_enrichment", "📉", "Ranked-gene pathway enrichment"),
        workbenchPluginLink("Scanpy Clustering", "scanpy_clustering", "🔬", "Single-cell UMAP and clustering"),
        workbenchPluginLink("Spatial Analysis", "spatial_analysis", "🗺️", "Visium spatial transcriptomics"),
        workbenchPluginLink("AlphaFold", "alphafold", "🧩", "Protein structure prediction"),
      ]
    },
    {
      name: "Scientific Evidence",
      color: "#a78bfa",
      links: [
        workbenchPluginLink("GEO Search", "geo_search", "🔎", "Discover expression datasets"),
        workbenchPluginLink("PubMed Search", "pubmed_search", "📚", "Search literature with evidence"),
        workbenchPluginLink("GWAS Catalog", "gwas_catalog_search", "🧬", "Variant-trait associations"),
        workbenchPluginLink("ChEMBL Search", "chembl_search", "💊", "Compounds, targets and bioactivity"),
        workbenchPluginLink("CIViC", "civic", "🏥", "Curated cancer variant evidence"),
      ]
    },
    {
      name: "Research AI & Clinical",
      color: "var(--accent)",
      links: [
        workbenchPluginLink("Evidence Agent", "literature_evidence_agent", "📑", "Claim-level evidence synthesis"),
        workbenchPluginLink("Experimental Design", "experimental_design_agent", "🧪", "Controls, confounders and statistics"),
        workbenchPluginLink("Biomarker Agent", "biomarker_discovery_agent", "🎯", "Candidate ranking and validation"),
        workbenchPluginLink("Variant Interpretation", "variant_interpretation_agent", "🧬", "Evidence-aware variant reasoning"),
        workbenchPluginLink("Clinical Reports", "clinical_report_generator", "📋", "Auditable clinical report generation"),
      ]
    },
    {
      name: "Data Operations",
      color: "var(--accent-platform)",
      links: [
        workbenchPluginLink("Data Manager", "data_manager", "🗄️", "Governed dataset operations"),
        workbenchPluginLink("Integrity Manager", "checksum_integrity_manager", "🔐", "Checksums and verification evidence"),
        workbenchPluginLink("Storage Quotas", "storage_quota_manager", "💾", "Usage, forecasting and guidance"),
        workbenchPluginLink("FAIR Packager", "fair_data_packager", "📦", "RO-Crate and BagIt packaging"),
        workbenchPluginLink("Format Converter", "format_converter", "🔄", "Validated scientific conversion"),
      ]
    },
    {
      name: "Workflow Governance",
      color: "var(--accent2)",
      links: [
        workbenchPluginLink("Workflow Validator", "workflow_validator", "✅", "Validate workflow readiness"),
        workbenchPluginLink("PDF Reports", "pdf_report_builder", "📄", "Reproducible scientific reports"),
        workbenchPluginLink("Job Queue", "job_queue_manager", "📋", "Jobs, queues and dependencies"),
        workbenchPluginLink("Environments", "environment_manager", "🧰", "Software and container readiness"),
        workbenchPluginLink("Collaboration", "collaboration", "🤝", "Workspaces, sharing and activity"),
      ]
    },
    {
      name: "Analysis & Visualization",
      color: "var(--accent3)",
      links: [
        workbenchPluginLink("Counts QC", "counts_matrix_qc", "✅", "Count-matrix sample quality"),
        workbenchPluginLink("Volcano Plot", "volcano_plot", "🌋", "Differential-expression plotting"),
        workbenchPluginLink("Expression Heatmap", "heatmap_generator", "🔥", "Clustered expression heatmaps"),
        workbenchPluginLink("PCA", "pca_analysis", "📉", "Dimensionality reduction"),
        workbenchPluginLink("Differential Abundance", "differential_abundance", "🦠", "Microbiome group comparison"),
      ]
    },
    {
      name: "Advanced Biology",
      color: "#a78bfa",
      links: [
        workbenchPluginLink("Immune Deconvolution", "immune_deconvolution", "🛡️", "Estimate immune composition"),
        workbenchPluginLink("Mutational Signatures", "mutational_signatures", "🧬", "Mutation-context signatures"),
        workbenchPluginLink("TCR/BCR Repertoire", "tcr_bcr_repertoire", "🧪", "Clonotypes and diversity"),
        workbenchPluginLink("RNA Velocity", "rna_velocity_analysis", "💨", "Single-cell dynamics"),
        workbenchPluginLink("Cell Communication", "cell_comm_visualization", "🔗", "Ligand-receptor networks"),
      ]
    },
    {
      name: "Clinical Data & Reference",
      color: "var(--accent)",
      links: [
        workbenchPluginLink("Trial Matching", "clinical_trial_matching", "🏥", "Patient-to-study matching"),
        workbenchPluginLink("De-identification", "privacy_deidentification", "🕶️", "PHI and PII protection"),
        workbenchPluginLink("Clinical Data Quality", "clinical_data_quality_validator", "🩺", "Validate clinical records"),
        workbenchPluginLink("Consent Manager", "clinical_consent_manager", "✍️", "Consent and scope decisions"),
        workbenchPluginLink("gnomAD", "gnomad", "🌍", "Population variant frequencies"),
      ]
    },
    {
      name: "Genomic Processing",
      color: "var(--accent-platform)",
      links: [
        workbenchPluginLink("FASTQ Trimmer", "fastq_trimmer", "✂️", "Adapter and quality trimming"),
        workbenchPluginLink("Variant QC", "variant_qc_filtering", "✅", "Quality-filter VCF records"),
        workbenchPluginLink("VCF Liftover", "vcf_liftover", "🗺️", "Convert genome coordinates"),
        workbenchPluginLink("BED Intersect", "bedtools_intersect", "🧩", "Intersect genomic intervals"),
        workbenchPluginLink("DeepVariant", "deepvariant", "🧬", "Deep-learning variant calling"),
      ]
    },
    {
      name: "Genomic Interpretation",
      color: "var(--accent2)",
      links: [
        workbenchPluginLink("PRS Builder", "prs_builder", "📊", "Build polygenic risk scores"),
        workbenchPluginLink("SpliceAI", "spliceai", "🧬", "Predict splice impact"),
        workbenchPluginLink("ClinVar", "clinvar", "🏥", "Clinical variant assertions"),
        workbenchPluginLink("Ensembl", "ensembl", "🌐", "Genome reference records"),
        workbenchPluginLink("UniProt", "uniprot", "🧪", "Protein knowledge and sequences"),
      ]
    },
    {
      name: "Single-Cell & Spatial",
      color: "var(--accent3)",
      links: [
        workbenchPluginLink("Scanpy QC", "scanpy_qc_metrics", "✅", "Cell and gene quality metrics"),
        workbenchPluginLink("Scanpy Markers", "scanpy_markers", "🎯", "Rank cluster marker genes"),
        workbenchPluginLink("Cell Annotation", "single_cell_annotation", "🏷️", "Annotate cell populations"),
        workbenchPluginLink("Spatial Clustering", "spatial_clustering", "🗺️", "Identify spatial domains"),
        workbenchPluginLink("Spatial Markers", "spatial_marker_identification", "📍", "Find tissue-domain markers"),
      ]
    },
    {
      name: "Epigenomics",
      color: "#a78bfa",
      links: [
        workbenchPluginLink("ATAC Peak Calling", "atac_peak_calling", "🏔️", "Call accessible regions"),
        workbenchPluginLink("ATAC Differential", "atac_differential", "📈", "Compare accessibility"),
        workbenchPluginLink("ChIP-seq QC", "chipseq_qc_metrics", "✅", "Signal and enrichment quality"),
        workbenchPluginLink("ChIP Peak Annotation", "chipseq_peak_annotation", "🏷️", "Map peaks to genomic features"),
        workbenchPluginLink("Methylation QC", "methylation_qc", "🧬", "Bisulfite-seq quality review"),
      ]
    },
    {
      name: "Drug Discovery & ML",
      color: "var(--accent)",
      links: [
        workbenchPluginLink("ADMET Prediction", "admet_prediction", "💊", "Predict compound properties"),
        workbenchPluginLink("Molecular Descriptors", "molecular_descriptors", "🧮", "Calculate molecular features"),
        workbenchPluginLink("Toxicity Prediction", "toxicity_prediction", "⚠️", "Estimate toxicity endpoints"),
        workbenchPluginLink("Drug-likeness", "druglikeness_scoring", "🧪", "Score compound suitability"),
        workbenchPluginLink("AutoML Biomarkers", "auto_ml_biomarker_discovery", "🤖", "Discover predictive biomarkers"),
      ]
    },
    {
      name: "Genome Analysis",
      color: "var(--accent-platform)",
      links: [
        workbenchPluginLink("Assembly QC", "assembly_qc", "✅", "Assess genome assemblies"),
        workbenchPluginLink("Nanopore QC", "nanopore_qc", "🧬", "Long-read quality metrics"),
        workbenchPluginLink("Gene Annotation", "gene_annotation", "🏷️", "Annotate genomic features"),
        workbenchPluginLink("GWAS & PopGen", "gwas_popgen", "🌍", "Association and population analysis"),
        workbenchPluginLink("Phenotype Association", "phenotype_association", "🔗", "Test genotype–phenotype links"),
      ]
    },
    {
      name: "Proteomics & Metabolomics",
      color: "var(--accent2)",
      links: [
        workbenchPluginLink("Protein Quantification", "protein_quantification", "🧪", "Aggregate peptide abundance"),
        workbenchPluginLink("PTM Analysis", "ptm_analysis", "🔬", "Analyze modification sites"),
        workbenchPluginLink("Metabolomics QC", "metabolomics_sample_qc", "✅", "Review sample quality"),
        workbenchPluginLink("Metabolomics Normalize", "metabolomics_normalize", "⚖️", "Normalize feature matrices"),
        workbenchPluginLink("Metabolomics Statistics", "metabolomics_stats", "📊", "Compare metabolite groups"),
      ]
    },
    {
      name: "Microbiome",
      color: "var(--accent3)",
      links: [
        workbenchPluginLink("Alpha Diversity", "alpha_diversity", "🦠", "Within-sample diversity"),
        workbenchPluginLink("Beta Diversity", "beta_diversity", "📉", "Between-sample ordination"),
        workbenchPluginLink("Taxonomic Classifier", "microbiome_taxonomic_classifier", "🏷️", "Classify microbial sequences"),
        workbenchPluginLink("AMR Classifier", "amr_gene_classifier", "🛡️", "Predict resistance genes"),
        workbenchPluginLink("MAG Quality", "mag_quality", "✅", "Assess metagenome bins"),
      ]
    },
    {
      name: "Drug & Structural Biology",
      color: "#a78bfa",
      links: [
        workbenchPluginLink("Binding Sites", "binding_site_predictor", "🎯", "Predict ligand-binding residues"),
        workbenchPluginLink("Docking Poses", "docking_pose_viewer", "🧩", "Inspect docked structures"),
        workbenchPluginLink("Target Prediction", "target_prediction", "💊", "Rank candidate targets"),
        workbenchPluginLink("Drug Response", "drug_response_predictor", "📈", "Predict molecular response"),
        workbenchPluginLink("Protein Stability", "protein_stability_ddg_predictor", "🧬", "Estimate mutation ΔΔG"),
      ]
    },
    {
      name: "Molecular References",
      color: "var(--accent)",
      links: [
        workbenchPluginLink("Open Targets", "opentargets", "🎯", "Target–disease evidence"),
        workbenchPluginLink("PubChem", "pubchem", "⚗️", "Chemical structures and properties"),
        workbenchPluginLink("RCSB PDB", "rcsb_pdb", "🧩", "Macromolecular structures"),
        workbenchPluginLink("Reactome", "reactome", "🔗", "Curated biological pathways"),
        workbenchPluginLink("GTEx", "gtex", "🧬", "Tissue expression and eQTLs"),
      ]
    },
    ...BROAD_PLUGIN_GROUPS.map(group => ({
      name: group.name,
      color: group.color,
      links: group.plugins.map(([slug, label, icon, desc]) => workbenchPluginLink(label, slug, icon, desc)),
    })),
    ...CENTURY_PLUGIN_GROUPS.map(group => ({
      name: group.name,
      color: group.color,
      links: group.plugins.map(([slug, label, icon, desc]) => workbenchPluginLink(label, slug, icon, desc)),
    })),
    ...NEXT_CENTURY_PLUGIN_GROUPS.map(group => ({
      name: group.name,
      color: group.color,
      links: group.plugins.map(([slug, label, icon, desc]) => workbenchPluginLink(label, slug, icon, desc)),
    })),
    ...FINAL_PLUGIN_GROUPS.map(group => ({
      name: group.name,
      color: group.color,
      links: group.plugins.map(([slug, label, icon, desc]) => workbenchPluginLink(label, slug, icon, desc)),
    })),
    {
      name: "AI & Intelligence",
      color: "#a78bfa",
      links: [
        workbenchPluginLink("Drug Target AI", "drug_target_intelligence", "💊", "Drug target analysis"),
        { label:"Literature AI",    url:"/_svc/rag/",                                           icon:"📚", desc:"PubMed RAG + DeepSeek" },
        workbenchPluginLink("Pathway Enrichment", "pathway_enrichment", "🔗", "Pathway analysis"),
        workbenchPluginLink("Bio Hypothesis", "bio_hypothesis_ai", "🧠", "Hypothesis generation"),
        workbenchPluginLink("Literature Summarizer", "literature_summarizer", "📄", "AI-powered paper summarization"),
        workbenchPluginLink("Bio Narrator AI", "bio_narrator_ai", "🧠", "Biological narrative generation"),
      ]
    }
  ];
  // Keep the Studio landing page focused on platform entry points and its
  // six curated Core Platform plugins. The full catalog is discoverable from
  // the dedicated Discover navigation pages.
  return categories.filter(({ name }) => ["Platform Services", "Security Control Plane", "Core Platform"].includes(name));
}

export default function Studio() {
  const { resolvedTheme } = useAppearance();
  const [host,     setHost]     = useState(getInitialHost);
  const [online,   setOnline]   = useState(false);
  const [checking, setChecking] = useState(true);
  // Cached synchronously (App.jsx's own mount-time getCurrentUser() call has
  // usually already populated it by the time anyone reaches this page) so
  // permission-gated tiles like Admin Console don't flash visible-then-
  // hidden on first paint; re-subscribed below in case a user signs in/out
  // while sitting on this page.
  const [currentUser, setCurrentUser] = useState(getCurrentUserSync);

  const BASE       = "/_svc/workbench";
  const CATEGORIES = useMemo(() => buildCategories(BASE), [BASE]);

  useEffect(() => {
    let mounted = true;
    const refreshUser = async () => {
      const user = await getCurrentUser();
      if (mounted) setCurrentUser(user);
    };
    refreshUser();
    const unsubscribe = onSessionChange(refreshUser);
    return () => { mounted = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    const loadHost = async () => {
      if (window.api?.loadConfig) {
        const cfg = await window.api.loadConfig();
        const savedHost = cfg?.server?.host_ip;
        if (savedHost) setHost(savedHost);
      }
    };
    loadHost();
  }, []);

  const check = async () => {
    setChecking(true);
    try {
      const sig = AbortSignal.timeout(5000);
      await fetch(`${BASE}/health/`, { mode: "no-cors", signal: sig });
      setOnline(true);
    } catch (_) { setOnline(false); }
    finally { setChecking(false); }
  };

  useEffect(() => {
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, [BASE]);

  // Electron's <webview> needs a fully-qualified src (it isn't part of the
  // host page's browsing context, so relative URLs won't resolve). In a
  // browser tab — web/beta mode — relative /_svc/* URLs must stay relative:
  // nginx-router already proxies them on the same origin, and prefixing
  // them with http://localhost causes mixed-content blocks on HTTPS and
  // resolves to the visitor's own machine instead of the server.
  const open = (url, label) => {
    let absolute;
    if (url.startsWith('/') && isElectron()) {
      const devHost = url.startsWith('/_svc/') && import.meta.env.DEV
        ? 'http://localhost:5174'
        : 'http://localhost';
      absolute = `${devHost}${url}`;
    } else {
      absolute = url;
    }
    if (getStandaloneOnlyApp(absolute)) {
      openExternal(standaloneAppUrl(absolute, resolvedTheme));
      return;
    }
    window.dispatchEvent(new CustomEvent("open-service", { detail: { url: absolute, label: label || url } }));
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Header */}
      <div className="workbench-header">
        <div>
          <h1 className="workbench-brand-heading" aria-label="OmniBioAI Studio">
            <OmniBioAILogo variant="full" size="md" label="OmniBioAI" />
            <span>Studio</span>
          </h1>
          <div style={{ fontSize:'var(--font-size-sm)', color:"var(--color-text-muted)", fontFamily:"var(--mono)" }}>
            Unified access to OmniBioAI platform services, workflows, AI, and security
          </div>
        </div>

        <div className="workbench-header-actions">
          <div role="status" aria-live="polite" style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div
              aria-hidden="true"
              style={{
                width:7, height:7, borderRadius:"50%",
                background: checking ? "var(--warn)" : online ? "var(--accent)" : "var(--danger)",
                animation: (checking || online) ? "pulse 2s infinite" : "none",
              }}
            />
            <span style={{ fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)",
              color: checking ? "var(--warn)" : online ? "var(--accent)" : "var(--danger)",
            }}>
              {checking ? "Checking..." : online ? "Online" : "Offline"}
            </span>
          </div>

          <span style={{ fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)" }}>
            {host}
          </span>

          <button
            onClick={check}
            aria-label="Refresh connection status"
            style={{
              padding:"6px 10px", borderRadius:'var(--radius-sm)', fontSize:'var(--font-size-xs)',
              fontFamily:"var(--mono)", background:"var(--bg3)",
              border:"1px solid var(--border2)", color:"var(--color-text-muted)", cursor:"pointer",
            }}
          >↻</button>

          <button
            onClick={() => online && window.dispatchEvent(new CustomEvent("navigate", { detail: 34 }))}
            aria-disabled={!online}
            aria-label="Browse plugins"
            style={{
              padding:"8px 16px", borderRadius:'var(--radius-sm)', fontSize:'var(--font-size-sm)',
              fontFamily:"var(--font)", fontWeight:500,
              cursor: online ? "pointer" : "not-allowed",
              opacity: online ? 1 : 0.4,
              background:"rgba(0,148,255,0.12)",
              border:"1px solid rgba(0,148,255,0.25)",
              color:"var(--accent2)",
            }}
          >
            <span aria-hidden="true">📦</span> Browse Plugins
          </button>
        </div>
      </div>

      {/* Offline banner */}
      {!online && !checking && (
        <div style={{
          padding:"12px 16px", borderRadius:'var(--radius)',
          background:"rgba(255,71,87,0.06)",
          border:"1px solid rgba(255,71,87,0.15)",
          display:"flex", alignItems:"center", justifyContent:"space-between",
        }}>
          <span style={{ fontSize:'var(--font-size-sm)', fontFamily:"var(--mono)", color:"var(--danger)" }}>
            Workbench offline — start the stack first
          </span>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("navigate",{detail:4}))}
            style={{
              padding:"5px 12px", borderRadius:5, fontSize:'var(--font-size-xs)',
              fontFamily:"var(--mono)", background:"rgba(0,229,160,0.08)",
              border:"1px solid rgba(0,229,160,0.2)", color:"var(--accent)", cursor:"pointer",
            }}
          >Go to Launch →</button>
        </div>
      )}

      {/* Categories */}
      <div id="main-content">
        {CATEGORIES.map(({ name, color, links: allLinks }) => {
          // Hide tiles like Admin Console whose target is gated on a
          // permission (platform.manage_infra) the signed-in user's JWT
          // doesn't carry — same reasoning as App.jsx's showRolesNav: don't
          // advertise an entry point most researchers would just get a 403
          // from. currentUser === null (still loading, or Electron with no
          // web session concept) fails open, same as showRolesNav, rather
          // than hiding gated tiles for everyone during that window.
          const links = allLinks.filter(({ requiresPermission, requiresAnyPermission }) => {
            if (currentUser === null) return true;
            if (requiresPermission && !currentUser.permissions?.includes(requiresPermission)) return false;
            if (requiresAnyPermission && !requiresAnyPermission.some(permission => currentUser.permissions?.includes(permission))) return false;
            return true;
          });
          if (links.length === 0) return null;
          return (
          <div key={name} style={{
            background:"var(--bg3)", border:"1px solid var(--border)",
            borderRadius:'var(--radius-lg)', overflow:"hidden",
            marginBottom: 8,
          }}>
            <div style={{
              padding:"10px 16px", borderBottom:"1px solid var(--border)",
              display:"flex", alignItems:"center", gap:8,
            }}>
              <div aria-hidden="true" style={{ width:3, height:14, borderRadius:'var(--radius-xs)', background:color, flexShrink:0 }} />
              <span style={{
                fontSize:'var(--font-size-xs)', fontWeight:500, letterSpacing:"0.06em",
                textTransform:"uppercase", color:"var(--text)",
              }}>{name}</span>
              <span style={{ fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)", marginLeft:4 }}>
                {links.length} modules
              </span>
            </div>

            <div className="app-grid">
              {links.map(({ label, url, icon, desc, action, openInNewTab }) => {
                const isLocal = !url.startsWith(BASE);
                const clickable = isLocal || online;
                const standaloneOnly = !!getStandaloneOnlyApp(url);
                const tileContent = <>
                  <span aria-hidden="true" style={{ fontSize:20 }}>{icon}</span>
                  <div style={{ fontSize:'var(--font-size-xs)', fontWeight:500, color, lineHeight:1.3 }}>{label}</div>
                  <div style={{ fontSize:'var(--font-size-xs)', fontFamily:"var(--font-mono)", color:"var(--color-text-muted)" }}>{desc}</div>
                </>;
                const tileProps = {
                  key: label,
                  "aria-label": `${label} — ${desc}`,
                  "aria-disabled": !clickable,
                  title: desc,
                  style: {
                    padding:"12px 8px", background:"var(--bg3)",
                    cursor: clickable ? "pointer" : "not-allowed",
                    opacity: clickable ? 1 : 0.5,
                    border:"none", transition:"background 0.15s",
                    display:"flex", flexDirection:"column",
                    alignItems:"center", gap:5, textAlign:"center", textDecoration:"none",
                  },
                  onMouseEnter: e => { if(clickable) e.currentTarget.style.background="rgba(255,255,255,0.03)"; },
                  onMouseLeave: e => { e.currentTarget.style.background="var(--bg3)"; },
                };
                return (
                  openInNewTab || standaloneOnly ? (
                    <a {...tileProps} href={standaloneOnly ? standaloneAppUrl(url, resolvedTheme) : url} target="_blank" rel="noopener noreferrer">
                      {tileContent}
                    </a>
                  ) : (
                    <button {...tileProps} onClick={() => clickable && (action ? action() : open(url, label))}>
                      {tileContent}
                    </button>
                  )
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

    </div>
  );
}
