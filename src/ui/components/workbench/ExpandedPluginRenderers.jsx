import { createGuidedPluginRenderer } from "./PriorityPluginRenderers";

const WORKFLOWS = Object.freeze({
  object_registry_explorer: {
    eyebrow: "Data registry", summary: "Search governed scientific objects and inspect their status, size, metadata and storage identity.",
    stages: ["Choose operation", "Filter objects", "Inspect metadata", "Open evidence"],
    outputs: ["Object inventory", "Metadata detail", "Storage references"],
    note: "Paths and object access remain bounded by the authenticated registry API.", mode: "query",
  },
  artifact_manager: {
    eyebrow: "Artifact governance", summary: "Browse versioned computational artifacts and their integrity, provenance and storage metadata.",
    stages: ["Find artifacts", "Inspect versions", "Verify integrity", "Trace provenance"],
    outputs: ["Artifact records", "Version metadata", "Stable references"],
    note: "Downloads and mutations remain subject to owner and backend policy checks.", mode: "query",
  },
  file_transfer_manager: {
    eyebrow: "Data movement", summary: "Inspect secure, resumable transfers and their lifecycle, integrity verification and audit evidence.",
    stages: ["List transfers", "Filter lifecycle", "Inspect progress", "Verify outcome"],
    outputs: ["Transfer status", "Integrity evidence", "Audit metadata"],
    note: "The browser never receives storage credentials or arbitrary filesystem access.", mode: "query",
  },
  data_lineage_tracker: {
    eyebrow: "Reproducibility", summary: "Trace how datasets, artifacts, tools, workflows and executions relate across the research lifecycle.",
    stages: ["Choose entity", "Explore lineage", "Inspect edges", "Review evidence"],
    outputs: ["Lineage graph data", "Entity details", "Provenance edges"],
    note: "Owner-scoped data objects remain protected while platform methodology metadata stays reusable.", mode: "query",
  },
  resource_cost_estimator: {
    eyebrow: "Execution planning", summary: "Estimate resources, planning cost, warnings and a suitable execution backend before launching work.",
    stages: ["Describe workload", "Estimate resources", "Compare backend", "Review warnings"],
    outputs: ["Resource estimate", "Cost guidance", "Backend recommendation"],
    note: "Estimates are planning guidance and remain distinct from billing records.", mode: "async",
  },
  omics_data_qc_harmonizer: {
    eyebrow: "Cross-omics quality", summary: "Detect quality and batch effects, harmonize cohorts and preserve the resulting evidence as artifacts.",
    stages: ["Upload cohorts", "Assess QC", "Harmonize batches", "Review diagnostics"],
    outputs: ["QC metrics", "Harmonized data", "Batch diagnostics"],
    note: "Transformations execute in Workbench and retain downloadable provenance.", mode: "async",
  },
  gsea_enrichment: {
    eyebrow: "Pathway analysis", summary: "Run ranked-gene enrichment and review pathways, statistics, plots and downloadable result tables.",
    stages: ["Upload ranking", "Select gene sets", "Run enrichment", "Review pathways"],
    outputs: ["Enrichment table", "Pathway statistics", "Diagnostic plots"],
    note: "The backend reports whether GSEApy or the deterministic fallback produced the result.", mode: "async",
  },
  scanpy_clustering: {
    eyebrow: "Single-cell analysis", summary: "Normalize AnnData, select variable genes, compute PCA/UMAP and produce governed Leiden clusters.",
    stages: ["Select AnnData", "Configure analysis", "Cluster cells", "Review embedding"],
    outputs: ["Clustered AnnData", "UMAP plot", "Cluster metadata"],
    note: "Large single-cell inputs stay in the Workbench execution and artifact boundary.", mode: "async",
  },
  spatial_analysis: {
    eyebrow: "Spatial transcriptomics", summary: "Filter and normalize Visium data, identify variable genes and compute spatial analysis embeddings.",
    stages: ["Select dataset", "Apply thresholds", "Analyze expression", "Review spatial outputs"],
    outputs: ["Processed AnnData", "UMAP plot", "Analysis artifacts"],
    note: "Threshold and execution validation remain server-authoritative.", mode: "async",
  },
  alphafold: {
    eyebrow: "Protein structure", summary: "Submit a validated protein sequence and inspect structure-prediction status, logs and model artifacts.",
    stages: ["Enter sequence", "Validate input", "Predict structure", "Review model"],
    outputs: ["Predicted structure", "Confidence evidence", "Run logs"],
    note: "Unavailable prediction engines are reported explicitly instead of producing placeholder structures.", mode: "async",
  },
  geo_search: {
    eyebrow: "Dataset discovery", summary: "Search NCBI GEO for relevant studies and retain structured search results as research artifacts.",
    stages: ["Define query", "Search GEO", "Review studies", "Export evidence"],
    outputs: ["Study matches", "Dataset metadata", "Search artifacts"],
    note: "Queries use the bounded Workbench search contract.", mode: "async",
  },
  pubmed_search: {
    eyebrow: "Literature discovery", summary: "Search PubMed and review structured literature evidence with optional grounded summarization.",
    stages: ["Define question", "Search literature", "Review citations", "Export evidence"],
    outputs: ["Article matches", "Citation metadata", "Grounded summary"],
    note: "Summaries remain connected to retrieved citation evidence.", mode: "async",
  },
  gwas_catalog_search: {
    eyebrow: "Genetic associations", summary: "Search GWAS Catalog for variant-trait associations and preserve the resulting evidence.",
    stages: ["Define trait", "Search associations", "Inspect variants", "Export results"],
    outputs: ["Associations", "Variant evidence", "Search artifacts"],
    note: "Returned associations retain their source and study context.", mode: "async",
  },
  chembl_search: {
    eyebrow: "Compound intelligence", summary: "Discover ChEMBL compounds, targets and bioactivities through a structured scientific search workflow.",
    stages: ["Choose entity", "Define query", "Search ChEMBL", "Review activity"],
    outputs: ["Compound matches", "Target records", "Bioactivity evidence"],
    note: "Search execution and upstream error handling remain in the Workbench connector.", mode: "async",
  },
  civic: {
    eyebrow: "Clinical variant evidence", summary: "Explore curated cancer variants, evidence items and assertions with clinical interpretation context.",
    stages: ["Choose operation", "Search evidence", "Inspect assertion", "Review provenance"],
    outputs: ["Variant evidence", "Curated assertions", "Source references"],
    note: "Curation status, retractions and evidence levels remain visible in structured results.", mode: "query",
  },
  literature_evidence_agent: {
    eyebrow: "Evidence synthesis", summary: "Prepare claim-level literature synthesis with explicit supporting, contradicting and uncertain evidence.",
    stages: ["Frame question", "Provide evidence", "Draft synthesis", "Review citations"],
    outputs: ["Evidence plan", "Claim structure", "Citation requirements"],
    note: "Evidence-grounded synthesis runs in Workbench; citation identifiers are preserved from supplied or retrieved sources.", mode: "async",
  },
  experimental_design_agent: {
    eyebrow: "Study design", summary: "Develop an auditable experimental design covering controls, confounders, measurements and statistics.",
    stages: ["Define objective", "Specify constraints", "Design controls", "Review analysis plan"],
    outputs: ["Design draft", "Control checklist", "Statistical considerations"],
    note: "Review generated designs for scientific validity, ethics and regulatory requirements before use.", mode: "async",
  },
  biomarker_discovery_agent: {
    eyebrow: "Biomarker evidence", summary: "Structure biomarker candidates and the evidence required to rank and validate them responsibly.",
    stages: ["Define phenotype", "Add candidates", "Assess evidence", "Plan validation"],
    outputs: ["Candidate framework", "Evidence criteria", "Validation plan"],
    note: "Only supplied evidence is analyzed; this agent does not silently launch upstream omics workflows.", mode: "async",
  },
  variant_interpretation_agent: {
    eyebrow: "Variant reasoning", summary: "Organize supplied annotations and conflicting evidence into a cautious interpretation workflow.",
    stages: ["Describe variant", "Add evidence", "Assess conflicts", "Draft interpretation"],
    outputs: ["Evidence framework", "Conflict review", "Interpretation draft"],
    note: "Conflicting assertions and uncertainty remain explicit; this research aid is not clinical judgment.", mode: "async",
  },
  clinical_report_generator: {
    eyebrow: "Clinical reporting", summary: "Assemble auditable clinical insight artifacts into a governed report-generation workflow.",
    stages: ["Select evidence", "Configure report", "Generate draft", "Review artifacts"],
    outputs: ["Clinical report", "Evidence references", "Audit artifacts"],
    note: "Generated reports require qualified human review before clinical use.", mode: "async",
  },
});

export const EXPANDED_PLUGIN_RENDERERS = Object.freeze(Object.fromEntries(
  Object.entries(WORKFLOWS).map(([slug, workflow]) => [slug, createGuidedPluginRenderer(workflow)]),
));

export const EXPANDED_PLUGIN_SLUGS = Object.freeze(Object.keys(WORKFLOWS));
