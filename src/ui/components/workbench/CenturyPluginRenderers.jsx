import { createGuidedPluginRenderer } from "./PriorityPluginRenderers";
import HistopathologyCVRenderer from "./HistopathologyCVRenderer";
import OmniMLStudioRenderer from "./OmniMLStudioRenderer";

const EXECUTION_STAGES = ["Provide evidence", "Configure operation", "Run workflow", "Review artifacts"];
const QUERY_STAGES = ["Choose operation", "Set query filters", "Search reference", "Review provenance"];

function workflowGroup(name, color, eyebrow, plugins, options = {}) {
  return Object.freeze({
    name, color, eyebrow, plugins,
    stages: options.stages ?? EXECUTION_STAGES,
    outputs: options.outputs ?? ["Workflow result", "Supporting evidence", "Run artifacts"],
    note: options.note ?? "Inputs, parameters and outputs remain linked through the governed Workbench run.",
  });
}

// Plugin tuple: slug, label, icon, Studio description, backend renderer family.
export const CENTURY_PLUGIN_GROUPS = Object.freeze([
  workflowGroup("Platform Intelligence", "var(--accent-platform)", "Platform intelligence", [
    ["infra_ai_copilot", "Infrastructure Copilot", "🤖", "Inspect infrastructure guidance", "query"],
    ["resource_monitoring", "Resource Monitoring", "📊", "Monitor compute and cost", "async_analysis"],
    ["alerting", "Alerts", "🔔", "Review platform alerts", "query"],
    ["api_analytics", "API Analytics", "📈", "Inspect API activity", "query"],
    ["audit_log", "Activity Explorer", "📜", "Explore governed platform activity", "query"],
  ], { outputs: ["Operational findings", "Platform evidence", "Audit context"] }),

  workflowGroup("Operations Dashboards", "var(--accent2)", "Operations dashboards", [
    ["dataset_catalog", "Dataset Catalog", "🗂️", "Browse governed datasets", "query"],
    ["integration_connections", "Integration Connections", "🔌", "Inspect connection health", "query"],
    ["notification_center", "Notification Center", "📨", "Review notifications", "query"],
    ["security_dashboard", "Security Dashboard", "🛡️", "Inspect security posture", "query"],
    ["workflow_scheduler", "Workflow Scheduler", "🗓️", "Schedule governed workflows", "async_analysis"],
  ], { outputs: ["Operational records", "Status evidence", "Governance context"] }),

  workflowGroup("Clinical & CRISPR", "var(--accent)", "Clinical and CRISPR workflows", [
    ["clinical_db_mapping", "Clinical DB Mapping", "🗺️", "Map clinical schemas", "generic_runner"],
    ["redcap", "REDCap", "🏥", "Operate governed REDCap integration", "generic_runner"],
    ["fhir_hl7", "FHIR & HL7", "🔄", "Query interoperability evidence", "query"],
    ["gdc", "GDC & TCGA", "🧬", "Query cancer genomics", "query"],
    ["crispr_guide_efficiency_predictor", "CRISPR Guide Efficiency", "✂️", "Predict guide efficiency", "generic_runner"],
  ], { note: "Clinical and predictive outputs require domain review and preserve source provenance." }),

  workflowGroup("RNA Analysis", "var(--accent3)", "RNA and proteomic analysis", [
    ["dia_analysis", "DIA Proteomics", "🧪", "Analyze DIA intensities", "generic_runner"],
    ["irfinder_analysis", "IRFinder", "🧬", "Analyze intron retention", "generic_runner"],
    ["isoform_analysis", "Isoform Analysis", "🔬", "Quantify transcript isoforms", "generic_runner"],
    ["leafcutter_analysis", "LeafCutter", "🍃", "Analyze splice junctions", "generic_runner"],
    ["rmats_analysis", "rMATS", "📊", "Compare alternative splicing", "generic_runner"],
  ], { outputs: ["RNA analysis results", "Statistical evidence", "Scientific artifacts"] }),

  workflowGroup("Specialized Analysis", "#a78bfa", "Specialized scientific analysis", [
    ["suppa2_analysis", "SUPPA2", "🧬", "Analyze isoform events", "generic_runner"],
    ["circrna_postprocess", "circRNA Postprocess", "⭕", "Postprocess circRNA calls", "async_analysis"],
    ["circtools_runner", "circTools", "🛠️", "Run circRNA workflow", "async_analysis"],
    ["tad_caller", "TAD Caller", "🗺️", "Call chromatin domains", "generic_runner"],
    ["docking_analysis", "Docking Analysis", "🧩", "Analyze molecular docking", "generic_runner"],
  ]),

  workflowGroup("Genomics Tools", "var(--accent-platform)", "Genomics tools", [
    ["genome_viewer", "Genome Viewer", "👁️", "Inspect genomic features", "generic_runner"],
    ["network_analysis", "Network Analysis", "🕸️", "Analyze biological networks", "generic_runner"],
    ["object_transform", "Object Transform", "🔄", "Transform governed objects", "generic_runner"],
    ["omnilink_e2t", "Enhancer-to-Target", "🔗", "Map enhancers to targets", "generic_runner"],
    ["read_simulator", "Read Simulator", "🧬", "Generate synthetic reads", "generic_runner"],
  ], { outputs: ["Genomic result", "Transformation evidence", "Run artifacts"] }),

  workflowGroup("Advanced Genomics", "var(--accent2)", "Advanced genomics and classifiers", [
    ["restriction_digest", "Restriction Digest", "✂️", "Simulate restriction digestion", "generic_runner"],
    ["prs_deep_predictor", "Deep PRS", "🧠", "Predict nonlinear polygenic risk", "generic_runner"],
    ["atac_accessibility_classifier", "ATAC Classifier", "🧬", "Classify accessibility", "generic_runner"],
    ["nanopore_methylation_caller", "Nanopore Methylation", "🧬", "Call methylation states", "generic_runner"],
    ["ms_spectrum_classifier", "MS Spectrum Classifier", "📈", "Classify mass spectra", "generic_runner"],
  ], { note: "Model-derived outputs remain research predictions with explicit model provenance." }),

  workflowGroup("Biomedical ML", "var(--accent)", "Biomedical machine learning", [
    ["drug_target_binding_affinity", "Binding Affinity", "🎯", "Predict drug-target affinity", "generic_runner"],
    ["histopath_nuclei_segmentation", "Nuclei Segmentation", "🔬", "Segment histology nuclei", "generic_runner"],
    ["histopath_tumor_classifier", "Tumor Classifier", "🧫", "Classify histopathology", "generic_runner"],
    ["protein_function_classifier_esm", "Protein Function ESM", "🧬", "Classify protein function", "generic_runner"],
    ["scrna_batch_integration_ae", "scRNA Batch Integration", "🔄", "Integrate single-cell batches", "generic_runner"],
  ], { outputs: ["Model result", "Evaluation metrics", "Model artifacts"] }),

  workflowGroup("ML Classifiers", "var(--accent3)", "Machine-learning classifiers", [
    ["scrna_celltype_classifier", "scRNA Cell-Type Classifier", "🏷️", "Classify cell identities", "generic_runner"],
    ["structural_variant_classifier", "SV Classifier", "🧬", "Classify structural variants", "generic_runner"],
    ["variant_pathogenicity_classifier", "Pathogenicity Classifier", "⚠️", "Predict variant pathogenicity", "generic_runner"],
    ["histopathology_cv", "Histopathology CV", "🔬", "Query vision workflows", "query"],
    ["omniml_studio", "OmniML Studio", "🤖", "Query managed ML resources", "query"],
  ], { note: "Classifier outputs require held-out validation and qualified interpretation." }),

  workflowGroup("Protein Intelligence", "#a78bfa", "Protein intelligence", [
    ["enzyme_ec_classifier", "Enzyme EC Classifier", "🧪", "Classify enzyme function", "generic_runner"],
    ["protein_interaction", "Protein Interaction", "🕸️", "Analyze interaction networks", "generic_runner"],
    ["ptm_site_predictor", "PTM Site Predictor", "🎯", "Predict modification sites", "generic_runner"],
    ["protein_evolution", "Protein Evolution", "🌳", "Analyze evolutionary evidence", "generic_runner"],
    ["bionemo", "BioNeMo", "🧠", "Run governed BioNeMo operations", "async_analysis"],
  ], { outputs: ["Protein analysis", "Prediction evidence", "Scientific artifacts"] }),

  workflowGroup("Research Integrations I", "var(--accent-platform)", "Research integrations", [
    ["atlassian", "Atlassian", "📋", "Connect research project records", "async_analysis"],
    ["cloud_integration", "Cloud Integration", "☁️", "Operate governed cloud actions", "async_analysis"],
    ["dvc", "DVC", "📦", "Connect data version control", "async_analysis"],
    ["elabftw", "eLabFTW", "📓", "Connect electronic lab notebooks", "async_analysis"],
    ["figshare", "Figshare", "🌐", "Publish and import research data", "async_analysis"],
  ], { note: "Credentials remain server-managed and operations stay within configured allowlists." }),

  workflowGroup("Research Integrations II", "var(--accent2)", "Research integrations", [
    ["jupyterhub", "JupyterHub", "📓", "Connect managed notebooks", "async_analysis"],
    ["knime", "KNIME", "🔷", "Connect analytics workflows", "async_analysis"],
    ["labkey", "LabKey", "🧪", "Connect research data", "async_analysis"],
    ["lims_integration", "LIMS", "🔬", "Operate governed LIMS actions", "async_analysis"],
    ["microsoft_graph", "Microsoft Graph", "🌐", "Connect managed Microsoft resources", "async_analysis"],
  ], { note: "Remote writes remain authenticated, auditable and operation-allowlisted." }),

  workflowGroup("Research Integrations III", "var(--accent3)", "Research integrations", [
    ["openspecimen", "OpenSpecimen", "🧫", "Connect biospecimen records", "async_analysis"],
    ["s3_integration", "AWS S3", "🪣", "Operate governed object storage", "async_analysis"],
    ["seven_bridges", "Seven Bridges", "🌉", "Connect genomics projects", "async_analysis"],
    ["zenodo", "Zenodo", "📚", "Publish citable research artifacts", "async_analysis"],
    ["spatial_imaging_io", "Spatial Imaging I/O", "🖼️", "Inspect spatial image operations", "async_analysis"],
  ], { note: "External resources retain provider provenance and server-side authorization." }),

  workflowGroup("Molecular References", "var(--accent)", "Molecular reference queries", [
    ["arrayexpress", "ArrayExpress", "📊", "Search functional genomics studies", "query"],
    ["biogrid", "BioGRID", "🕸️", "Query interaction evidence", "query"],
    ["bioportal", "BioPortal", "📚", "Search biomedical ontologies", "query"],
    ["brenda", "BRENDA", "🧪", "Query enzyme knowledge", "query"],
    ["ccle", "CCLE", "🧫", "Query cancer cell lines", "query"],
  ], { stages: QUERY_STAGES, outputs: ["Reference records", "Normalized evidence", "Source provenance"] }),

  workflowGroup("Ontologies & Annotation", "#a78bfa", "Ontology and annotation queries", [
    ["cell_ontology", "Cell Ontology", "🌳", "Search cell types", "query"],
    ["cellchat", "CellChat", "💬", "Query communication knowledge", "query"],
    ["chebi", "ChEBI", "⚗️", "Search chemical entities", "query"],
    ["clingen", "ClinGen", "🧬", "Query clinical validity", "query"],
    ["cpic", "CPIC", "💊", "Query pharmacogenomic guidance", "query"],
  ], { stages: QUERY_STAGES, outputs: ["Ontology records", "Annotation evidence", "Source provenance"] }),

  workflowGroup("Clinical References", "var(--accent-platform)", "Clinical reference queries", [
    ["dbgap", "dbGaP", "🧬", "Search genotype-phenotype studies", "query"],
    ["dbnsfp", "dbNSFP", "📊", "Query functional predictions", "query"],
    ["dgidb", "DGIdb", "💊", "Search drug-gene interactions", "query"],
    ["disease_ontology", "Disease Ontology", "🌳", "Search disease terms", "query"],
    ["drugcentral", "DrugCentral", "💊", "Query approved-drug evidence", "query"],
  ], { stages: QUERY_STAGES, outputs: ["Clinical reference records", "Evidence context", "Source provenance"] }),

  workflowGroup("Genomic References", "var(--accent2)", "Genomic reference queries", [
    ["ena", "ENA", "🧬", "Search nucleotide archives", "query"],
    ["genereviews", "GeneReviews", "📖", "Query expert disease reviews", "query"],
    ["gwas_catalog", "GWAS Catalog", "📊", "Search variant-trait evidence", "query"],
    ["gwas_summary_stats", "GWAS Summary Stats", "📈", "Discover summary statistics", "query"],
    ["hgnc", "HGNC", "🏷️", "Resolve gene nomenclature", "query"],
  ], { stages: QUERY_STAGES, outputs: ["Genomic records", "Identifier evidence", "Source provenance"] }),

  workflowGroup("Biomedical References", "var(--accent3)", "Biomedical reference queries", [
    ["hmdb", "HMDB", "⚗️", "Query human metabolites", "query"],
    ["hpa", "Human Protein Atlas", "🧪", "Query tissue protein evidence", "query"],
    ["intact", "IntAct", "🕸️", "Search molecular interactions", "query"],
    ["interpro", "InterPro", "🧬", "Query protein families", "query"],
    ["kegg", "KEGG", "🔗", "Search pathway knowledge", "query"],
  ], { stages: QUERY_STAGES, outputs: ["Biomedical records", "Functional evidence", "Source provenance"] }),

  workflowGroup("Disease & Pharmacogenomics", "var(--accent)", "Disease and pharmacogenomic queries", [
    ["medgen", "MedGen", "🏥", "Search medical genetics", "query"],
    ["mondo", "MONDO", "🌳", "Resolve disease ontology", "query"],
    ["msigdb", "MSigDB", "🧬", "Search molecular signatures", "query"],
    ["omim", "OMIM", "📖", "Query Mendelian evidence", "query"],
    ["pharmgkb", "PharmGKB", "💊", "Query pharmacogenomics", "query"],
  ], { stages: QUERY_STAGES, outputs: ["Disease records", "Pharmacogenomic evidence", "Source provenance"] }),

  workflowGroup("Research Archives", "var(--accent-platform)", "Research archive queries", [
    ["pride", "PRIDE", "🧪", "Search proteomics datasets", "query"],
    ["proteomexchange", "ProteomeXchange", "🔄", "Discover proteomics studies", "query"],
    ["sra", "SRA", "🧬", "Search sequencing archives", "query"],
    ["string_db", "STRING", "🕸️", "Query protein associations", "query"],
    ["ucsc", "UCSC Genome Browser", "🌐", "Query genome annotations", "query"],
  ], { stages: QUERY_STAGES, outputs: ["Archive records", "Dataset identifiers", "Source provenance"] }),
]);

const pluginEntries = CENTURY_PLUGIN_GROUPS.flatMap(group => group.plugins.map(
  ([slug, label, icon, desc, renderer]) => ({ slug, label, icon, desc, renderer, group }),
));

export const CENTURY_PLUGIN_SLUGS = Object.freeze(pluginEntries.map(({ slug }) => slug));
export const CENTURY_PLUGIN_MODES = Object.freeze(Object.fromEntries(
  pluginEntries.map(({ slug, renderer }) => [slug, renderer]),
));
export const CENTURY_PLUGIN_RENDERERS = Object.freeze(Object.fromEntries(pluginEntries.map(entry => [
  entry.slug,
  entry.slug === "omniml_studio" ? OmniMLStudioRenderer
    : entry.slug === "histopathology_cv" ? HistopathologyCVRenderer
      : createGuidedPluginRenderer({
        eyebrow: entry.group.eyebrow,
        summary: `${entry.label}: ${entry.desc}.`,
        stages: entry.group.stages,
        outputs: entry.group.outputs,
        note: entry.group.note,
      }),
])));
