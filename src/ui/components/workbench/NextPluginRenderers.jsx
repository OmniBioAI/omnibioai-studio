import { createGuidedPluginRenderer } from "./PriorityPluginRenderers";

const WORKFLOWS = Object.freeze({
  fastq_trimmer: {
    eyebrow: "Read preprocessing", summary: "Trim adapters and low-quality sequence from FASTQ reads before downstream analysis.",
    stages: ["Upload reads", "Set trimming rules", "Run trimming", "Review quality"],
    outputs: ["Trimmed FASTQ", "Trimming summary", "Run evidence"],
    note: "Input reads and trimming parameters remain attached to the reproducible run record.",
  },
  variant_qc_filtering: {
    eyebrow: "Variant quality", summary: "Apply explicit quality filters to VCF records and retain a traceable filtering report.",
    stages: ["Upload VCF", "Set thresholds", "Filter variants", "Review counts"],
    outputs: ["Filtered VCF", "QC summary", "Filter evidence"],
    note: "Filtering never changes the source VCF artifact.",
  },
  vcf_liftover: {
    eyebrow: "Genome coordinates", summary: "Lift VCF coordinates between supported human genome assemblies with rejected-record reporting.",
    stages: ["Upload VCF", "Choose assemblies", "Lift coordinates", "Review rejects"],
    outputs: ["Lifted VCF", "Rejected variants", "Conversion report"],
    note: "Assembly direction and rejected variants remain explicit in the result.",
  },
  bedtools_intersect: {
    eyebrow: "Genomic intervals", summary: "Intersect governed BED interval sets with configurable overlap behavior.",
    stages: ["Upload intervals", "Choose overlap", "Compute intersection", "Review intervals"],
    outputs: ["Intersected BED", "Overlap summary", "Run evidence"],
    note: "The operation uses uploaded artifacts rather than browser-local file processing.",
  },
  deepvariant: {
    eyebrow: "Variant calling", summary: "Configure DeepVariant calling from aligned reads and a reference genome.",
    stages: ["Add alignments", "Select reference", "Configure model", "Call variants"],
    outputs: ["Variant calls", "gVCF evidence", "Execution artifacts"],
    note: "Compute availability and model selection remain controlled by Workbench.",
  },
  prs_builder: {
    eyebrow: "Polygenic risk", summary: "Build a polygenic score from genotype and effect-weight evidence.",
    stages: ["Upload genotypes", "Add weights", "Configure scoring", "Review scores"],
    outputs: ["Risk scores", "Variant accounting", "Scoring report"],
    note: "Scores are research outputs and are not clinical diagnoses.",
  },
  spliceai: {
    eyebrow: "Splicing impact", summary: "Annotate variants with predicted splice-impact evidence through the registered SpliceAI workflow.",
    stages: ["Upload variants", "Set reference", "Run annotation", "Review predictions"],
    outputs: ["Annotated variants", "Splice scores", "Run artifacts"],
    note: "Predictions require expert interpretation and do not establish pathogenicity.",
  },
  scanpy_qc_metrics: {
    eyebrow: "Single-cell QC", summary: "Calculate cell- and gene-level quality metrics from an AnnData object.",
    stages: ["Upload AnnData", "Validate matrix", "Compute metrics", "Review distributions"],
    outputs: ["QC metrics", "Updated AnnData", "Quality artifacts"],
    note: "The source AnnData object remains preserved as governed evidence.",
  },
  scanpy_markers: {
    eyebrow: "Marker discovery", summary: "Rank cluster marker genes from a prepared single-cell AnnData object.",
    stages: ["Upload AnnData", "Choose grouping", "Rank markers", "Review genes"],
    outputs: ["Marker table", "Ranking plots", "Analysis artifacts"],
    note: "Statistical settings and cluster labels remain recorded with the run.",
  },
  single_cell_annotation: {
    eyebrow: "Cell annotation", summary: "Annotate single-cell populations using supplied evidence and reproducible parameters.",
    stages: ["Upload cells", "Add references", "Run annotation", "Review labels"],
    outputs: ["Cell labels", "Annotation evidence", "Updated dataset"],
    note: "Automated labels remain predictions for scientific review.",
  },
  spatial_clustering: {
    eyebrow: "Spatial domains", summary: "Cluster spatial transcriptomics observations while preserving tissue coordinates.",
    stages: ["Upload spatial data", "Configure neighbors", "Cluster spots", "Review domains"],
    outputs: ["Spatial clusters", "Cluster plot", "Updated AnnData"],
    note: "Cluster parameters and spatial evidence remain reproducible.",
  },
  spatial_marker_identification: {
    eyebrow: "Spatial markers", summary: "Identify marker genes for spatial clusters and tissue domains.",
    stages: ["Upload clustered data", "Choose groups", "Rank markers", "Review regions"],
    outputs: ["Spatial markers", "Comparison plots", "Run artifacts"],
    note: "Marker results depend on the supplied clustering and statistical configuration.",
  },
  atac_peak_calling: {
    eyebrow: "Chromatin accessibility", summary: "Call accessible chromatin peaks from an ATAC-seq coverage track.",
    stages: ["Upload coverage", "Configure peaks", "Call regions", "Review signal"],
    outputs: ["Peak set", "Peak summary", "Analysis evidence"],
    note: "Peak parameters and the source coverage artifact remain linked to the result.",
  },
  atac_differential: {
    eyebrow: "Differential accessibility", summary: "Compare chromatin accessibility between experimental groups.",
    stages: ["Upload peak matrix", "Define groups", "Run comparison", "Review regions"],
    outputs: ["Differential peaks", "Statistical table", "Analysis artifacts"],
    note: "Group definitions and statistical assumptions remain explicit.",
  },
  chipseq_qc_metrics: {
    eyebrow: "ChIP-seq quality", summary: "Compute quality metrics for ChIP-seq signal and enrichment evidence.",
    stages: ["Upload evidence", "Validate inputs", "Compute QC", "Review metrics"],
    outputs: ["QC metrics", "Quality plots", "Run report"],
    note: "Quality thresholds remain visible rather than silently excluding samples.",
  },
  chipseq_peak_annotation: {
    eyebrow: "Peak annotation", summary: "Annotate ChIP-seq peaks against genomic features and nearby genes.",
    stages: ["Upload peaks", "Choose annotation", "Map features", "Review genes"],
    outputs: ["Annotated peaks", "Feature summary", "Annotation artifacts"],
    note: "Reference assembly and annotation provenance remain part of the result.",
  },
  methylation_qc: {
    eyebrow: "Methylation quality", summary: "Evaluate bisulfite-sequencing methylation tables and sample-level quality.",
    stages: ["Upload methylation", "Validate samples", "Compute QC", "Review findings"],
    outputs: ["QC table", "Quality plots", "Run evidence"],
    note: "QC reports preserve the original methylation artifact and sample identifiers.",
  },
  admet_prediction: {
    eyebrow: "ADMET profiling", summary: "Predict bounded absorption, distribution, metabolism, excretion and toxicity properties.",
    stages: ["Upload descriptors", "Validate molecules", "Run prediction", "Review flags"],
    outputs: ["ADMET predictions", "Property flags", "Result artifacts"],
    note: "Predictions are research-use estimates and not safety determinations.",
  },
  molecular_descriptors: {
    eyebrow: "Molecular features", summary: "Calculate reproducible molecular descriptors from validated compound structures.",
    stages: ["Add molecules", "Validate structures", "Compute descriptors", "Review features"],
    outputs: ["Descriptor table", "Validation findings", "Run artifacts"],
    note: "Invalid structures are reported explicitly rather than silently discarded.",
  },
  toxicity_prediction: {
    eyebrow: "Toxicity prediction", summary: "Estimate configured molecular toxicity endpoints from governed compound evidence.",
    stages: ["Add compounds", "Select endpoints", "Run prediction", "Review risks"],
    outputs: ["Toxicity predictions", "Endpoint summary", "Model evidence"],
    note: "Outputs support research triage and do not replace toxicology studies.",
  },
  druglikeness_scoring: {
    eyebrow: "Compound triage", summary: "Score compounds against interpretable drug-likeness rules and molecular properties.",
    stages: ["Add compounds", "Choose rules", "Calculate scores", "Review violations"],
    outputs: ["Drug-likeness scores", "Rule violations", "Property evidence"],
    note: "Rule-based scores are prioritization aids rather than efficacy claims.",
  },
  auto_ml_biomarker_discovery: {
    eyebrow: "Biomarker ML", summary: "Train and evaluate bounded machine-learning candidates for biomarker discovery.",
    stages: ["Upload features", "Define outcome", "Train models", "Review evidence"],
    outputs: ["Model metrics", "Feature rankings", "Validation artifacts"],
    note: "Held-out evaluation and leakage controls remain essential for interpretation.",
  },
  clinvar: {
    eyebrow: "Clinical variants", summary: "Query normalized ClinVar assertions and supporting variant evidence.",
    stages: ["Choose query", "Enter variant", "Search assertions", "Review evidence"],
    outputs: ["ClinVar records", "Clinical significance", "Source provenance"],
    note: "Assertions can conflict and require qualified clinical interpretation.",
  },
  ensembl: {
    eyebrow: "Genome reference", summary: "Query Ensembl genes, transcripts, variants and comparative genomic evidence.",
    stages: ["Choose operation", "Enter identifier", "Query Ensembl", "Review records"],
    outputs: ["Reference records", "Feature annotations", "Source provenance"],
    note: "Species, assembly and release context remain visible in returned evidence.",
  },
  uniprot: {
    eyebrow: "Protein knowledge", summary: "Search and inspect UniProt protein function, sequence and annotation evidence.",
    stages: ["Choose operation", "Search proteins", "Inspect entry", "Review provenance"],
    outputs: ["Protein records", "Functional annotations", "Sequence evidence"],
    note: "Reviewed and unreviewed evidence remains distinguishable in query results.",
  },
});

export const NEXT_PLUGIN_RENDERERS = Object.freeze(Object.fromEntries(
  Object.entries(WORKFLOWS).map(([slug, workflow]) => [slug, createGuidedPluginRenderer(workflow)]),
));

export const NEXT_PLUGIN_SLUGS = Object.freeze(Object.keys(WORKFLOWS));
