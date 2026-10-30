import { createGuidedPluginRenderer } from "./PriorityPluginRenderers";

// One source of truth drives both renderer registration and Studio discovery.
// Backend descriptors remain authoritative for fields, operations and lifecycle.
export const BROAD_PLUGIN_GROUPS = Object.freeze([
  {
    name: "Scientific Visualization", color: "var(--accent3)", eyebrow: "Scientific visualization",
    stages: ["Provide evidence", "Configure view", "Render result", "Review artifacts"],
    outputs: ["Scientific visualization", "Supporting data", "Run evidence"],
    note: "Visualizations preserve source data and declared analysis parameters.",
    plugins: [
      ["manhattan_qq_plot", "Manhattan & QQ", "📊", "Association diagnostic plots"],
      ["ppi_network_plot", "PPI Network", "🕸️", "Protein interaction networks"],
      ["sashimi_plot", "Sashimi Plot", "🧬", "Splice-junction visualization"],
      ["venn_upset_plot", "Venn & UpSet", "⭕", "Set-overlap visualization"],
      ["agentic_pymol", "Agentic PyMOL", "🧩", "Governed structure visualization"],
    ],
  },
  {
    name: "Omics Reporting", color: "var(--accent2)", eyebrow: "Omics reporting",
    stages: ["Upload results", "Validate evidence", "Build summary", "Review report"],
    outputs: ["Analysis report", "Diagnostic plots", "Supporting artifacts"],
    note: "Reports cite registered inputs and never invent missing scientific results.",
    plugins: [
      ["ml_eval_plots", "ML Evaluation", "📈", "Model evaluation plots"],
      ["msa_conservation_viewer", "MSA Conservation", "🧬", "Alignment and conservation view"],
      ["omics_qc_metrics_extractor", "QC Metrics Extractor", "✅", "Extract normalized QC evidence"],
      ["omics_qc_report_generator", "Omics QC Report", "📄", "Generate quality reports"],
      ["circrna_plotter", "circRNA Plotter", "⭕", "Visualize circular RNA evidence"],
    ],
  },
  {
    name: "ChIP-seq Analysis", color: "#a78bfa", eyebrow: "ChIP-seq analysis",
    stages: ["Upload ChIP-seq evidence", "Configure analysis", "Run workflow", "Review peaks"],
    outputs: ["ChIP-seq results", "Signal plots", "Analysis artifacts"],
    note: "Reference assembly, contrasts and peak evidence remain traceable.",
    plugins: [
      ["chipseq_differential_binding", "Differential Binding", "📈", "Compare binding across groups"],
      ["chipseq_motif_analysis", "Motif Analysis", "🧬", "Discover enriched motifs"],
      ["chipseq_peakset_ops", "Peak Set Operations", "🧩", "Combine and compare peak sets"],
      ["chipseq_report_generator", "ChIP-seq Report", "📄", "Build reproducible reports"],
      ["chipseq_signal_plots", "Signal Plots", "📊", "Plot enrichment and coverage"],
    ],
  },
  {
    name: "Chromatin & Epigenomics", color: "var(--accent)", eyebrow: "Chromatin and epigenomics",
    stages: ["Upload genomic evidence", "Set analysis parameters", "Run analysis", "Review regions"],
    outputs: ["Region-level results", "Statistical evidence", "Run artifacts"],
    note: "Genome assembly and experimental design remain explicit in every result.",
    plugins: [
      ["atac_footprinting", "ATAC Footprinting", "👣", "Infer transcription-factor footprints"],
      ["chromatin_accessibility", "Accessibility QC", "✅", "Assess accessible chromatin"],
      ["chromatin_state", "Chromatin States", "🎨", "Segment regulatory states"],
      ["dmr_analysis", "DMR Analysis", "🧬", "Detect methylation regions"],
      ["hic_analysis", "Hi-C Analysis", "🗺️", "Analyze contact maps"],
    ],
  },
  {
    name: "Population Genomics", color: "var(--accent-platform)", eyebrow: "Population genomics",
    stages: ["Upload genotype evidence", "Define populations", "Run analysis", "Review structure"],
    outputs: ["Population metrics", "Statistical tables", "Analysis plots"],
    note: "Population definitions and statistical assumptions require scientific review.",
    plugins: [
      ["admixture_analysis", "ADMIXTURE", "🌍", "Estimate ancestry proportions"],
      ["eqtl_linker", "eQTL Linker", "🔗", "Link variants to expression"],
      ["fst_calculator", "FST Calculator", "📊", "Measure population differentiation"],
      ["ld_analysis", "LD Analysis", "🧬", "Calculate linkage disequilibrium"],
      ["phasing_haplotype_analysis", "Phasing & Haplotypes", "🧩", "Resolve haplotype structure"],
    ],
  },
  {
    name: "Variant & Sequence Analysis", color: "var(--accent2)", eyebrow: "Variant and sequence analysis",
    stages: ["Upload sequence evidence", "Configure analysis", "Run workflow", "Review annotations"],
    outputs: ["Sequence results", "Variant evidence", "Run artifacts"],
    note: "Predictions and associations remain research evidence, not clinical determinations.",
    plugins: [
      ["orf_finder", "ORF Finder", "🧬", "Identify open reading frames"],
      ["pathogenicity_scoring", "Pathogenicity Scoring", "⚠️", "Score variant evidence"],
      ["rare_variant_burden", "Rare Variant Burden", "📊", "Test aggregate variant burden"],
      ["selection_scan", "Selection Scan", "🔎", "Detect allele-frequency selection"],
      ["sra_submission_manager", "SRA Submission", "📦", "Prepare archive submissions"],
    ],
  },
  {
    name: "Metabolomics Processing", color: "var(--accent3)", eyebrow: "Metabolomics processing",
    stages: ["Upload metabolomics data", "Configure processing", "Run transformation", "Review features"],
    outputs: ["Processed features", "Quality evidence", "Processing artifacts"],
    note: "Every transformation preserves its source matrix and parameter provenance.",
    plugins: [
      ["metabolomics_alignment", "Peak Alignment", "📐", "Align features across samples"],
      ["metabolomics_annotate", "Metabolite Annotation", "🏷️", "Annotate detected features"],
      ["metabolomics_batch_correct", "Batch Correction", "⚖️", "Correct detected batch effects"],
      ["metabolomics_batch_detect", "Batch Detection", "🔎", "Identify technical batches"],
      ["metabolomics_biomarkers", "Metabolomics Biomarkers", "🎯", "Discover candidate biomarkers"],
    ],
  },
  {
    name: "Metabolomics Workflows", color: "#a78bfa", eyebrow: "Metabolomics workflows",
    stages: ["Upload feature evidence", "Choose operation", "Run workflow", "Review outputs"],
    outputs: ["Feature matrix", "Workflow report", "Result artifacts"],
    note: "Imputation, filtering and detection choices remain visible for reproducibility.",
    plugins: [
      ["metabolomics_feature_matrix", "Feature Matrix", "🧮", "Build analysis-ready matrices"],
      ["metabolomics_imputation", "Missing-Value Imputation", "🧩", "Impute missing measurements"],
      ["metabolomics_outlier_detect", "Outlier Detection", "🔎", "Flag anomalous samples"],
      ["metabolomics_peak_detect", "Peak Detection", "🏔️", "Detect metabolomic peaks"],
      ["metabolomics_report", "Metabolomics Report", "📄", "Generate analysis reports"],
    ],
  },
  {
    name: "Biomedical Machine Learning", color: "var(--accent)", eyebrow: "Biomedical machine learning",
    stages: ["Upload training evidence", "Configure model", "Run evaluation", "Review predictions"],
    outputs: ["Model predictions", "Evaluation metrics", "Model artifacts"],
    note: "Model outputs require held-out validation and domain-appropriate interpretation.",
    plugins: [
      ["anomaly_detection_omics", "Omics Anomaly Detection", "🔎", "Detect anomalous profiles"],
      ["celltype_classification_sc", "Cell-Type Classification", "🏷️", "Classify single cells"],
      ["deep_learning_variant_classifier", "Variant Classifier", "🧬", "Deep-learning variant classification"],
      ["explainable_ai_interpreter", "Explainable AI", "💡", "Interpret model predictions"],
      ["gene_expression_regulatory_ai", "Regulatory AI", "🤖", "Model gene regulation"],
    ],
  },
  {
    name: "Advanced Omics AI", color: "var(--accent-platform)", eyebrow: "Advanced omics AI",
    stages: ["Upload omics evidence", "Select model operation", "Run inference", "Review evidence"],
    outputs: ["AI analysis results", "Model evidence", "Interpretation artifacts"],
    note: "AI outputs remain bounded research predictions with traceable model provenance.",
    plugins: [
      ["multi_omics_integration_ai", "Multi-Omics Integration", "🧬", "Integrate multiple omics layers"],
      ["single_cell_omics_intelligence", "Single-Cell Intelligence", "🔬", "Analyze single-cell evidence"],
      ["single_cell_trajectory_inference", "Trajectory Inference", "🛤️", "Infer cellular trajectories"],
      ["variant_effect_intelligence", "Variant Effect AI", "🧬", "Interpret variant effects"],
      ["admet_property_predictor", "ADMET Property ML", "💊", "Train or apply ADMET models"],
    ],
  },
  {
    name: "Single-Cell & Spatial Tools", color: "var(--accent3)", eyebrow: "Single-cell and spatial tools",
    stages: ["Upload cell data", "Configure analysis", "Run workflow", "Review populations"],
    outputs: ["Cell-level results", "Scientific plots", "Updated data artifacts"],
    note: "Cell labels, spatial coordinates and analysis parameters remain linked to outputs.",
    plugins: [
      ["clustering", "Cell Clustering", "🔬", "Cluster single-cell profiles"],
      ["marker_identification", "Marker Identification", "🎯", "Identify population markers"],
      ["single_cell_loom_viewer", "LOOM Viewer", "👁️", "Inspect LOOM datasets"],
      ["qc_plots", "Spatial QC Plots", "✅", "Visualize Visium quality"],
      ["spatial_report_generation", "Spatial Report", "📄", "Generate spatial reports"],
    ],
  },
  {
    name: "Drug Discovery Workflows", color: "#a78bfa", eyebrow: "Drug discovery workflows",
    stages: ["Provide compound evidence", "Configure analysis", "Run workflow", "Review findings"],
    outputs: ["Compound analysis", "Prediction evidence", "Run artifacts"],
    note: "Predictions support research prioritization and are not clinical recommendations.",
    plugins: [
      ["chemoinfo_intelligence", "Chemoinfo Intelligence", "⚗️", "Analyze chemical evidence"],
      ["drug_report_generator", "Drug Report", "📄", "Build compound reports"],
      ["mechanism_analysis", "Mechanism Analysis", "⚙️", "Analyze mechanisms of action"],
      ["molecule_validation", "Molecule Validation", "✅", "Validate molecular structures"],
      ["pathway_mapping", "Pathway Mapping", "🔗", "Map targets to pathways"],
    ],
  },
  {
    name: "Genomic Reference Queries", color: "var(--accent2)", eyebrow: "Genomic reference queries",
    stages: ["Choose query", "Enter identifier", "Search reference", "Review evidence"],
    outputs: ["Reference records", "Normalized evidence", "Source provenance"],
    note: "Results retain upstream identifiers, release context and provenance.",
    plugins: [
      ["clinicaltrials_gov", "ClinicalTrials.gov", "🏥", "Search registered studies"],
      ["dbsnp", "dbSNP", "🧬", "Query variant identifiers"],
      ["encode", "ENCODE", "🧪", "Search functional genomics data"],
      ["expression_atlas", "Expression Atlas", "📊", "Query expression evidence"],
      ["gene_ontology", "Gene Ontology", "🌳", "Search functional annotations"],
    ],
  },
  {
    name: "Translational Reference Queries", color: "var(--accent)", eyebrow: "Translational reference queries",
    stages: ["Choose query", "Set filters", "Search database", "Review records"],
    outputs: ["Reference results", "Evidence summaries", "Source provenance"],
    note: "Public aggregate and association evidence remains distinct from patient-level data.",
    plugins: [
      ["all_of_us", "All of Us", "🌍", "Query public aggregate data"],
      ["bindingdb", "BindingDB", "🔗", "Search measured binding data"],
      ["cbioportal", "cBioPortal", "🧬", "Explore cancer genomics"],
      ["depmap", "DepMap", "🎯", "Query gene dependencies"],
      ["disgenet", "DisGeNET", "🏥", "Search gene–disease evidence"],
    ],
  },
  {
    name: "Research Platform Integrations", color: "var(--accent-platform)", eyebrow: "Research platform integrations",
    stages: ["Choose operation", "Configure parameters", "Run integration", "Review provenance"],
    outputs: ["Integration result", "Remote references", "Audit evidence"],
    note: "Credentials remain server-managed and operations stay within configured allowlists.",
    plugins: [
      ["aws_healthomics", "AWS HealthOmics", "☁️", "Run cloud omics operations"],
      ["benchling", "Benchling", "🧪", "Connect governed lab records"],
      ["dnanexus", "DNAnexus", "🧬", "Connect cloud genomics"],
      ["ga4gh_interoperability", "GA4GH", "🔄", "Exchange interoperable genomics"],
      ["terra", "Terra", "🌐", "Connect research workspaces"],
    ],
  },
]);

const entries = BROAD_PLUGIN_GROUPS.flatMap(group => group.plugins.map(([slug, label, icon, desc]) => [
  slug,
  createGuidedPluginRenderer({
    eyebrow: group.eyebrow,
    summary: `${label}: ${desc}.`,
    stages: group.stages,
    outputs: group.outputs,
    note: group.note,
  }),
]));

export const BROAD_PLUGIN_RENDERERS = Object.freeze(Object.fromEntries(entries));
export const BROAD_PLUGIN_SLUGS = Object.freeze(entries.map(([slug]) => slug));
