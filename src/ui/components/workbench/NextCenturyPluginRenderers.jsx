import { createGuidedPluginRenderer } from "./PriorityPluginRenderers";

const EXECUTION_STAGES = ["Provide evidence", "Configure operation", "Run workflow", "Review artifacts"];
const QUERY_STAGES = ["Choose operation", "Set query filters", "Search reference", "Review provenance"];
const INFORMATION_STAGES = ["Review scope", "Inspect requirements", "Understand limitations", "Plan next steps"];

function group(name, color, eyebrow, plugins, mode = "execution") {
  const informational = mode === "informational";
  const query = mode === "query";
  return Object.freeze({
    name, color, eyebrow, plugins,
    stages: informational ? INFORMATION_STAGES : query ? QUERY_STAGES : EXECUTION_STAGES,
    outputs: informational
      ? ["Capability summary", "Input requirements", "Scientific limitations"]
      : query ? ["Reference records", "Normalized evidence", "Source provenance"]
        : ["Workflow result", "Supporting evidence", "Run artifacts"],
    note: informational
      ? "This deployment intentionally exposes a read-only React workspace because execution is disabled by the backend descriptor."
      : query ? "Results preserve upstream identifiers, release context and source provenance."
        : "Inputs, parameters and outputs remain linked through the governed Workbench lifecycle.",
  });
}

// Tuple: slug, label, icon, Studio description, backend renderer family.
export const NEXT_CENTURY_PLUGIN_GROUPS = Object.freeze([
  group("AI & Platform", "var(--accent-platform)", "AI and platform workspaces", [
    ["omninotebook_ai", "OmniNotebook AI", "📓", "Run governed notebook assistance", "async_analysis"],
    ["home", "Workbench Home", "🏠", "Access Workbench operations", "async_analysis"],
    ["ai_evidence", "AI Evidence", "📑", "Review traceable AI evidence", "informational"],
    ["hypothesis_evaluation_agent", "Hypothesis Evaluation", "🧠", "Review hypothesis evaluation scope", "informational"],
    ["protocol_generation_agent", "Protocol Generation", "🧪", "Review protocol generation scope", "informational"],
  ]),
  group("Search & Spatial", "var(--accent2)", "Search and spatial analysis", [
    ["jaspar_search", "JASPAR Search", "🔎", "Search transcription-factor motifs", "async_analysis"],
    ["kegg_search", "KEGG Search", "🔗", "Search pathway evidence", "async_analysis"],
    ["threshold_recommendation", "Spatial Thresholds", "📏", "Recommend Visium thresholds", "async_analysis"],
    ["spatial_domain_classifier", "Spatial Domains", "🗺️", "Classify spatial domains", "generic_runner"],
    ["citeseq_celltype_classifier", "CITE-seq Classifier", "🏷️", "Classify multimodal cells", "generic_runner"],
  ]),
  group("Scientific Utilities", "var(--accent3)", "Scientific utilities", [
    ["sv_fusion_circos", "SV/Fusion Circos", "⭕", "Render structural variants", "generic_runner"],
    ["plate_designer", "Plate Designer", "🧫", "Design plate layouts", "generic_runner"],
    ["reference_registry", "Reference Registry", "📚", "Manage reference records", "generic_runner"],
    ["voice_command", "Voice Command", "🎙️", "Run governed voice operations", "generic_runner"],
    ["sample_sheet_generator", "Sample Sheets", "📋", "Generate sequencing sample sheets", "generic_runner"],
  ]),
  group("Clinical References", "var(--accent)", "Clinical reference queries", [
    ["clinvitae", "Clinvitae", "🧬", "Query clinical variants", "query"],
    ["dbmts", "dbMTS", "📊", "Query miRNA target variants", "query"],
    ["dip", "DIP", "🕸️", "Search protein interactions", "query"],
    ["drugsatfda", "Drugs@FDA", "💊", "Search approved products", "query"],
    ["ega", "EGA", "🧬", "Discover controlled genomic data", "query"],
  ], "query"),
  group("Genomic References", "#a78bfa", "Genomic reference queries", [
    ["eggnog", "eggNOG", "🥚", "Query orthology evidence", "query"],
    ["hgmd", "HGMD", "🧬", "Query mutation evidence", "query"],
    ["icgc", "ICGC", "🏥", "Query cancer genomics", "query"],
    ["lipidmaps", "LIPID MAPS", "🧪", "Search lipid knowledge", "query"],
    ["lovd", "LOVD", "🧬", "Query locus-specific variants", "query"],
  ], "query"),
  group("Variant References", "var(--accent-platform)", "Variant and study reference queries", [
    ["marrvel", "MARRVEL", "🧬", "Aggregate model-organism evidence", "query"],
    ["mastermind", "Mastermind", "📚", "Search genomic literature", "query"],
    ["mavedb", "MaveDB", "📊", "Query variant effect maps", "query"],
    ["metabolights", "MetaboLights", "⚗️", "Discover metabolomics studies", "query"],
    ["ncbi", "NCBI", "🔎", "Search NCBI resources", "query"],
  ], "query"),
  group("Disease & Structure References", "var(--accent2)", "Disease and structure queries", [
    ["orphanet", "Orphanet", "🏥", "Query rare diseases", "query"],
    ["panglaodb", "PanglaoDB", "🔬", "Query single-cell markers", "query"],
    ["panther", "PANTHER", "🌳", "Query protein classification", "query"],
    ["pdb_redo", "PDB-REDO", "🧩", "Query optimized structures", "query"],
    ["pdbe", "PDBe", "🧩", "Search macromolecular structures", "query"],
  ], "query"),
  group("Protein & Pharmacology", "var(--accent3)", "Protein and pharmacology queries", [
    ["pdbsum", "PDBsum", "🧩", "Query structure summaries", "query"],
    ["pharmvar", "PharmVar", "💊", "Query pharmacogene variation", "query"],
    ["pharos", "Pharos", "🎯", "Query target knowledge", "query"],
    ["phegeni", "PheGenI", "🧬", "Query phenotype-genotype evidence", "query"],
    ["rfam", "Rfam", "🧬", "Search RNA families", "query"],
  ], "query"),
  group("Drug & Variant Knowledge", "var(--accent)", "Drug and variant reference queries", [
    ["rxnorm", "RxNorm", "💊", "Resolve normalized drugs", "query"],
    ["sgd", "SGD", "🧫", "Query yeast genomics", "query"],
    ["sider", "SIDER", "⚠️", "Query adverse effects", "query"],
    ["snpedia", "SNPedia", "🧬", "Search variant knowledge", "query"],
    ["swisslipids", "SwissLipids", "⚗️", "Query lipid structures", "query"],
  ], "query"),
  group("Population References", "#a78bfa", "Population and cancer reference queries", [
    ["t3db", "T3DB", "☣️", "Query toxin evidence", "query"],
    ["targetscan", "TargetScan", "🎯", "Query miRNA targets", "query"],
    ["tcga", "TCGA", "🧬", "Query cancer genomics", "query"],
    ["thousand_genomes", "1000 Genomes", "🌍", "Query population variation", "query"],
    ["topmed", "TOPMed", "🧬", "Query population genomics", "query"],
  ], "query"),
  group("Research References", "var(--accent-platform)", "Research reference queries", [
    ["uk_biobank", "UK Biobank", "🏥", "Query field catalogue", "query"],
    ["wikipathways", "WikiPathways", "🔗", "Search community pathways", "query"],
    ["wormbase", "WormBase", "🪱", "Query model-organism evidence", "query"],
    ["biostudies", "BioStudies", "📚", "Search research studies", "query"],
    ["schema_registry", "Schema Registry", "📐", "Query registered schemas", "query"],
  ], "query"),
  group("Cancer Analysis", "var(--accent2)", "Cancer analysis capabilities", [
    ["clonal_evolution_phylogenetics", "Clonal Evolution", "🌳", "Review phylogenetic analysis", "informational"],
    ["ctdna_liquid_biopsy", "ctDNA Liquid Biopsy", "🩸", "Review liquid-biopsy workflow", "informational"],
    ["cytof_analysis", "CyTOF Analysis", "🔬", "Review mass-cytometry analysis", "informational"],
    ["hla_typing", "HLA Typing", "🧬", "Review HLA typing requirements", "informational"],
    ["hrd_score", "HRD Score", "📊", "Review homologous-recombination scoring", "informational"],
  ], "informational"),
  group("Advanced Oncology", "var(--accent3)", "Advanced oncology capabilities", [
    ["longread_report", "Long-Read Report", "📄", "Review long-read reporting", "informational"],
    ["msi_detector", "MSI Detection", "🧬", "Review microsatellite instability", "informational"],
    ["neoantigen_immunogenicity", "Neoantigen Immunogenicity", "🛡️", "Review immunogenicity scoring", "informational"],
    ["neoantigen_predictor", "Neoantigen Prediction", "🎯", "Review neoantigen workflow", "informational"],
    ["rnaseq_report", "RNA-seq Report", "📄", "Review RNA-seq reporting", "informational"],
  ], "informational"),
  group("Variant & Splicing Reports", "var(--accent)", "Variant and splicing capabilities", [
    ["splice_event_viewer", "Splice Event Viewer", "👁️", "Review splice visualization", "informational"],
    ["splicing_report", "Splicing Report", "📄", "Review splicing reports", "informational"],
    ["sv_annotation", "SV Annotation", "🧬", "Review structural-variant annotation", "informational"],
    ["tmb_calculator", "TMB Calculator", "🧮", "Review mutation-burden calculation", "informational"],
    ["tumor_purity", "Tumor Purity", "🧫", "Review purity estimation", "informational"],
  ], "informational"),
  group("AI Model Workflows", "#a78bfa", "AI model capabilities", [
    ["clinical_bert_finetuner", "Clinical BERT", "🤖", "Review clinical model tuning", "informational"],
    ["llm_fine_tuner", "LLM Fine-Tuner", "🧠", "Review language-model tuning", "informational"],
    ["multiomics_reasoning_agent", "Multi-Omics Reasoning", "🧬", "Review reasoning-agent scope", "informational"],
    ["pathway_reasoning_agent", "Pathway Reasoning", "🔗", "Review pathway reasoning", "informational"],
    ["vaccine_epitope_design", "Vaccine Epitope Design", "💉", "Review epitope-design workflow", "informational"],
  ], "informational"),
  group("Clinical & CRISPR Planning", "var(--accent-platform)", "Clinical and CRISPR capabilities", [
    ["clinical_report", "Clinical Genomics Report", "📋", "Review clinical reporting", "informational"],
    ["phenopacket", "GA4GH Phenopacket", "📦", "Review phenotype packaging", "informational"],
    ["crispr_off_target_analysis", "CRISPR Off-Target", "✂️", "Review off-target analysis", "informational"],
    ["crispr_screen_analysis", "CRISPR Screen", "🧪", "Review screen analysis", "informational"],
    ["atac_motif_enrichment", "ATAC Motif Enrichment", "🧬", "Review motif enrichment", "informational"],
  ], "informational"),
  group("Epigenomics & Genomics Planning", "var(--accent2)", "Epigenomics and genomics capabilities", [
    ["atac_report", "ATAC-seq Report", "📄", "Review accessibility reporting", "informational"],
    ["epigenomics_report", "Epigenomics Report", "📄", "Review epigenomics reporting", "informational"],
    ["cnvkit", "CNVkit", "🧬", "Review copy-number analysis", "informational"],
    ["population_pca", "Population PCA", "📊", "Review population structure", "informational"],
    ["variant_classifier_finetuner", "Variant Classifier Tuning", "🤖", "Review classifier training", "informational"],
  ], "informational"),
  group("Omics Reports", "var(--accent3)", "Omics reporting capabilities", [
    ["lipidomics_analysis", "Lipidomics Analysis", "⚗️", "Review lipidomics workflow", "informational"],
    ["microbiome_report", "Microbiome Report", "📄", "Review microbiome reporting", "informational"],
    ["taxonomic_abundance", "Taxonomic Abundance", "🦠", "Review abundance plots", "informational"],
    ["proteomics_qc", "Proteomics QC", "✅", "Review proteomics quality", "informational"],
    ["proteomics_report", "Proteomics Report", "📄", "Review proteomics reporting", "informational"],
  ], "informational"),
  group("Foundation-Model Tuning", "var(--accent)", "Foundation-model capabilities", [
    ["antibody_lm_finetuner", "Antibody LM", "🧬", "Review antibody-model tuning", "informational"],
    ["biomedical_vlm_finetuner", "Biomedical VLM", "🔬", "Review vision-language tuning", "informational"],
    ["chemistry_lm_finetuner", "Chemistry LM", "⚗️", "Review chemistry-model tuning", "informational"],
    ["dna_sequence_finetuner", "DNA Foundation Model", "🧬", "Review sequence-model tuning", "informational"],
    ["histopath_foundation_finetuner", "Histopath Foundation Model", "🧫", "Review histopathology tuning", "informational"],
  ], "informational"),
  group("Models & Workflow Tools", "#a78bfa", "Model and workflow capabilities", [
    ["protein_language_model_finetuner", "Protein Language Model", "🧬", "Review protein-model tuning", "informational"],
    ["scrna_foundation_finetuner", "scRNA Foundation Model", "🔬", "Review single-cell model tuning", "informational"],
    ["workflow_explorer", "Workflow Explorer", "🗺️", "Review workflow visualization", "informational"],
    ["workflow_registry_admin", "Workflow Registry", "📚", "Review registry administration", "informational"],
    ["structure_visualizer", "Structure Visualizer", "🧩", "Review protein visualization", "informational"],
  ], "informational"),
]);

const entries = NEXT_CENTURY_PLUGIN_GROUPS.flatMap(item => item.plugins.map(
  ([slug, label, icon, desc, renderer]) => ({ slug, label, icon, desc, renderer, group: item }),
));

export const NEXT_CENTURY_PLUGIN_SLUGS = Object.freeze(entries.map(({ slug }) => slug));
export const NEXT_CENTURY_PLUGIN_MODES = Object.freeze(Object.fromEntries(entries.map(
  ({ slug, renderer }) => [slug, renderer],
)));
export const NEXT_CENTURY_PLUGIN_RENDERERS = Object.freeze(Object.fromEntries(entries.map(entry => [
  entry.slug,
  createGuidedPluginRenderer({
    eyebrow: entry.group.eyebrow,
    summary: `${entry.label}: ${entry.desc}.`,
    stages: entry.group.stages,
    outputs: entry.group.outputs,
    note: entry.group.note,
  }),
])));
