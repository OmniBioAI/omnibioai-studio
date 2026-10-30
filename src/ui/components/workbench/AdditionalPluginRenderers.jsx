import { createGuidedPluginRenderer } from "./PriorityPluginRenderers";

const WORKFLOWS = Object.freeze({
  data_manager: {
    eyebrow: "Dataset management", summary: "Browse governed datasets, inspect metadata and access bounded dataset operations from Studio.",
    stages: ["Choose operation", "Filter datasets", "Inspect metadata", "Open resource"],
    outputs: ["Dataset inventory", "Metadata detail", "Governed downloads"],
    note: "Ownership and download authorization remain enforced by Workbench.",
  },
  checksum_integrity_manager: {
    eyebrow: "Data integrity", summary: "Inspect cryptographic checksums, verification history and integrity evidence for scientific files.",
    stages: ["Choose source", "Select algorithm", "Verify checksum", "Review evidence"],
    outputs: ["Checksum records", "Verification status", "Integrity evidence"],
    note: "The interface never expands access beyond configured storage roots and registered objects.",
  },
  storage_quota_manager: {
    eyebrow: "Storage governance", summary: "Review storage inventory, usage, lifecycle classification, forecasts and quota guidance.",
    stages: ["Select scope", "Inspect usage", "Review forecast", "Plan cleanup"],
    outputs: ["Usage summary", "Growth forecast", "Recommendations"],
    note: "Cleanup remains recommendation-only unless an independently authorized operation exists.",
  },
  fair_data_packager: {
    eyebrow: "FAIR packaging", summary: "Prepare reproducible RO-Crate and BagIt-compatible research data packages with integrity manifests.",
    stages: ["Describe package", "Select resources", "Build metadata", "Review manifest"],
    outputs: ["FAIR package", "SHA-256 manifest", "Package metadata"],
    note: "Packaging preserves source provenance and does not silently publish data.",
  },
  format_converter: {
    eyebrow: "Format interoperability", summary: "Plan and inspect validated scientific format conversions through bounded operations.",
    stages: ["Choose formats", "Validate source", "Configure conversion", "Review result"],
    outputs: ["Compatibility result", "Conversion evidence", "Output reference"],
    note: "Unsupported or lossy conversions are reported explicitly.",
  },
  workflow_validator: {
    eyebrow: "Workflow assurance", summary: "Validate workflow definitions, dependencies and execution readiness before submission.",
    stages: ["Select workflow", "Validate schema", "Check dependencies", "Review findings"],
    outputs: ["Validation report", "Dependency findings", "Readiness status"],
    note: "Validation does not execute the workflow or bypass execution policy.",
  },
  pdf_report_builder: {
    eyebrow: "Scientific reporting", summary: "Compose reproducible PDF reports from governed runs, provenance, QC and dataset records.",
    stages: ["Choose sources", "Arrange sections", "Review evidence", "Build report"],
    outputs: ["Report plan", "PDF artifact", "Provenance references"],
    note: "Report values remain sourced from registered evidence rather than browser-supplied claims.",
  },
  job_queue_manager: {
    eyebrow: "Job operations", summary: "Inspect normalized jobs, queues, dependencies and lifecycle state across execution backends.",
    stages: ["Choose operation", "Filter jobs", "Inspect lifecycle", "Review backend"],
    outputs: ["Queue status", "Job detail", "Backend evidence"],
    note: "Submission and cancellation policy remains server-authoritative.",
  },
  environment_manager: {
    eyebrow: "Environment readiness", summary: "Inspect software, containers and dependency compatibility required by research workflows.",
    stages: ["Choose operation", "Select environment", "Compare dependencies", "Review readiness"],
    outputs: ["Environment inventory", "Compatibility findings", "Readiness evidence"],
    note: "Credentials and arbitrary commands are never exposed through the UI contract.",
  },
  collaboration: {
    eyebrow: "Research collaboration", summary: "Work with shared research spaces and inspect collaboration activity through governed operations.",
    stages: ["Choose workspace", "Review members", "Inspect activity", "Share evidence"],
    outputs: ["Workspace result", "Activity record", "Sharing evidence"],
    note: "Workspace membership and sharing authorization remain enforced by Workbench.",
  },
  counts_matrix_qc: {
    eyebrow: "Expression quality", summary: "Assess library sizes and detected features before downstream expression analysis.",
    stages: ["Upload counts", "Validate matrix", "Compute QC", "Review samples"],
    outputs: ["QC metrics", "Sample plots", "Report artifacts"],
    note: "The original matrix remains governed as an input artifact.",
  },
  volcano_plot: {
    eyebrow: "Differential expression", summary: "Render a configurable volcano plot from a validated differential-expression result table.",
    stages: ["Upload results", "Map columns", "Set thresholds", "Render plot"],
    outputs: ["Volcano plot", "Threshold summary", "Plot artifacts"],
    note: "Visualization does not recompute the underlying differential-expression model.",
  },
  heatmap_generator: {
    eyebrow: "Expression visualization", summary: "Generate clustered, z-scored heatmaps and export the corresponding clustered matrix.",
    stages: ["Upload matrix", "Configure features", "Cluster data", "Review heatmap"],
    outputs: ["Heatmap", "Clustered matrix", "Run evidence"],
    note: "Clustering parameters and artifacts remain reproducible through the run record.",
  },
  pca_analysis: {
    eyebrow: "Dimensionality reduction", summary: "Prepare a PCA analysis draft for samples-by-features data and its expected diagnostics.",
    stages: ["Describe matrix", "Plan scaling", "Review components", "Prepare outputs"],
    outputs: ["PCA plan", "Coordinate expectations", "Variance summary"],
    note: "This deployment currently exposes an informational workspace rather than executable PCA controls.",
  },
  differential_abundance: {
    eyebrow: "Microbiome analysis", summary: "Prepare a differential-abundance comparison with groups, statistical assumptions and expected plots.",
    stages: ["Describe abundance", "Define groups", "Review statistics", "Prepare outputs"],
    outputs: ["Analysis plan", "Result-table contract", "Volcano-plot contract"],
    note: "This deployment currently exposes an informational workspace rather than executable analysis controls.",
  },
  immune_deconvolution: {
    eyebrow: "Immune composition", summary: "Structure an immune-deconvolution analysis and review required matrices and interpretation boundaries.",
    stages: ["Describe expression", "Choose signatures", "Review assumptions", "Plan interpretation"],
    outputs: ["Analysis draft", "Cell-fraction contract", "Interpretation notes"],
    note: "Execution remains disabled by the current backend descriptor.",
  },
  mutational_signatures: {
    eyebrow: "Cancer genomics", summary: "Prepare mutation-context signature analysis with explicit inputs, methods and interpretation constraints.",
    stages: ["Describe mutations", "Choose context", "Plan extraction", "Review signatures"],
    outputs: ["Analysis draft", "Signature contract", "Interpretation notes"],
    note: "Execution remains disabled by the current backend descriptor.",
  },
  tcr_bcr_repertoire: {
    eyebrow: "Immune repertoire", summary: "Prepare clonotype and diversity analysis for AIRR-compatible immune-repertoire data.",
    stages: ["Describe repertoire", "Choose metrics", "Plan comparison", "Review outputs"],
    outputs: ["Analysis draft", "Diversity contract", "Clonotype expectations"],
    note: "Execution remains disabled by the current backend descriptor.",
  },
  rna_velocity_analysis: {
    eyebrow: "Single-cell dynamics", summary: "Prepare an RNA-velocity workflow using spliced and unspliced AnnData evidence.",
    stages: ["Describe AnnData", "Check layers", "Plan velocity", "Review boundaries"],
    outputs: ["Workflow draft", "Engine requirements", "Expected velocity outputs"],
    note: "The backend intentionally reports engine unavailability and never fabricates velocity.",
  },
  cell_comm_visualization: {
    eyebrow: "Cell communication", summary: "Analyze ligand-receptor communication and generate pathway-centric network and matrix artifacts.",
    stages: ["Upload interactions", "Add metadata", "Analyze pathways", "Review networks"],
    outputs: ["Network plot", "Heatmap", "Pathway enrichment"],
    note: "The execution lifecycle preserves uploaded evidence and generated artifacts.",
  },
  clinical_trial_matching: {
    eyebrow: "Trial matching", summary: "Match structured patient criteria against supplied candidate studies with explicit evidence.",
    stages: ["Describe patient", "Add studies", "Run matching", "Review eligibility"],
    outputs: ["Trial matches", "Eligibility evidence", "Run artifacts"],
    note: "Results support research review and do not determine enrollment eligibility.",
  },
  privacy_deidentification: {
    eyebrow: "Privacy protection", summary: "Scan, redact or pseudonymize common PHI and PII before analysis or sharing.",
    stages: ["Choose operation", "Provide payload", "Transform safely", "Review report"],
    outputs: ["Privacy report", "Transformed payload", "Audit evidence"],
    note: "Pseudonymization keys remain server-managed and raw matches are not exposed unnecessarily.",
  },
  clinical_data_quality_validator: {
    eyebrow: "Clinical data quality", summary: "Validate required fields, terminology, ranges and duplicates in structured clinical datasets.",
    stages: ["Choose operation", "Provide records", "Validate quality", "Review findings"],
    outputs: ["Quality summary", "Validation findings", "Audit artifacts"],
    note: "Validation findings remain traceable to the governed run.",
  },
  clinical_consent_manager: {
    eyebrow: "Consent governance", summary: "Evaluate versioned clinical consent and scope-aware access decisions with privacy-preserving evidence.",
    stages: ["Choose operation", "Describe consent", "Evaluate scope", "Review decision"],
    outputs: ["Consent decision", "Scope findings", "Audit report"],
    note: "Access decisions remain server-authoritative and auditable.",
  },
  gnomad: {
    eyebrow: "Population variation", summary: "Query population allele-frequency evidence and inspect normalized gnomAD variant records.",
    stages: ["Choose operation", "Define variant", "Query populations", "Review evidence"],
    outputs: ["Variant frequencies", "Population breakdown", "Source provenance"],
    note: "Genome build and identifier validation remain part of the backend query contract.",
  },
});

export const ADDITIONAL_PLUGIN_RENDERERS = Object.freeze(Object.fromEntries(
  Object.entries(WORKFLOWS).map(([slug, workflow]) => [slug, createGuidedPluginRenderer(workflow)]),
));

export const ADDITIONAL_PLUGIN_SLUGS = Object.freeze(Object.keys(WORKFLOWS));
