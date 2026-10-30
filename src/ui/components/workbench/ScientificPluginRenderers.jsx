import { createGuidedPluginRenderer } from "./PriorityPluginRenderers";

const WORKFLOWS = Object.freeze({
  assembly_qc: {
    eyebrow: "Assembly quality", summary: "Evaluate genome assembly contiguity and completeness from a governed assembly artifact.",
    stages: ["Upload assembly", "Validate sequences", "Compute metrics", "Review quality"],
    outputs: ["Assembly metrics", "Quality summary", "Run evidence"],
    note: "Metrics describe assembly quality and do not modify the source sequences.",
  },
  nanopore_qc: {
    eyebrow: "Long-read quality", summary: "Assess Nanopore read length, yield and quality distributions before downstream analysis.",
    stages: ["Upload reads", "Validate input", "Compute QC", "Review distributions"],
    outputs: ["Read metrics", "QC plots", "Quality report"],
    note: "Quality thresholds and source-read provenance remain attached to the run.",
  },
  gene_annotation: {
    eyebrow: "Genome annotation", summary: "Annotate genomic features against a selected reference and evidence source.",
    stages: ["Add sequences", "Select reference", "Run annotation", "Review features"],
    outputs: ["Gene annotations", "Feature table", "Annotation evidence"],
    note: "Reference identity and annotation parameters remain explicit in the result.",
  },
  gwas_popgen: {
    eyebrow: "Population genomics", summary: "Run bounded association and population-genetics analysis from genotype evidence.",
    stages: ["Upload genotypes", "Add phenotypes", "Configure analysis", "Review associations"],
    outputs: ["Association results", "Population metrics", "Analysis artifacts"],
    note: "Population structure and statistical assumptions require scientific review.",
  },
  phenotype_association: {
    eyebrow: "Genotype–phenotype", summary: "Test phenotype associations using supplied genotype, phenotype and covariate evidence.",
    stages: ["Upload data", "Map phenotype", "Set covariates", "Review results"],
    outputs: ["Association table", "Model summary", "Run evidence"],
    note: "Association does not establish causality or clinical significance.",
  },
  protein_quantification: {
    eyebrow: "Proteomics quantification", summary: "Aggregate peptide evidence into reproducible protein-level abundance estimates.",
    stages: ["Upload peptides", "Configure aggregation", "Quantify proteins", "Review abundance"],
    outputs: ["Protein matrix", "Quantification summary", "Run artifacts"],
    note: "Peptide-to-protein mapping and aggregation settings remain traceable.",
  },
  ptm_analysis: {
    eyebrow: "Post-translational modification", summary: "Analyze modification-site abundance and group-level phosphoproteomics evidence.",
    stages: ["Upload peptides", "Define groups", "Analyze sites", "Review changes"],
    outputs: ["PTM results", "Site statistics", "Analysis plots"],
    note: "Localization confidence and statistical thresholds remain visible.",
  },
  metabolomics_sample_qc: {
    eyebrow: "Metabolomics quality", summary: "Evaluate sample distributions, missingness and quality-control behavior in metabolomics data.",
    stages: ["Upload matrix", "Identify QC samples", "Compute metrics", "Review outliers"],
    outputs: ["Sample QC", "Quality plots", "QC report"],
    note: "Potential outliers are reported rather than silently removed.",
  },
  metabolomics_normalize: {
    eyebrow: "Metabolomics normalization", summary: "Normalize a metabolomics feature matrix using an explicit, reproducible method.",
    stages: ["Upload matrix", "Choose method", "Normalize features", "Review distributions"],
    outputs: ["Normalized matrix", "Method summary", "Diagnostic artifacts"],
    note: "The unmodified input matrix remains preserved as run evidence.",
  },
  metabolomics_stats: {
    eyebrow: "Metabolomics statistics", summary: "Run configured statistical comparisons on a prepared metabolomics feature matrix.",
    stages: ["Upload features", "Define groups", "Run statistics", "Review metabolites"],
    outputs: ["Statistical results", "Comparison plots", "Analysis evidence"],
    note: "Multiple-testing and group definitions remain explicit in outputs.",
  },
  alpha_diversity: {
    eyebrow: "Within-sample diversity", summary: "Calculate alpha-diversity metrics from a microbiome abundance table.",
    stages: ["Upload abundance", "Validate samples", "Compute diversity", "Review metrics"],
    outputs: ["Diversity table", "Summary plots", "Run evidence"],
    note: "Metric choice and preprocessing assumptions remain recorded.",
  },
  beta_diversity: {
    eyebrow: "Between-sample diversity", summary: "Calculate microbiome distance and ordination evidence across samples.",
    stages: ["Upload abundance", "Choose distance", "Compute ordination", "Review clusters"],
    outputs: ["Distance matrix", "PCoA coordinates", "Ordination plot"],
    note: "Distance metric and normalization assumptions remain part of the result.",
  },
  microbiome_taxonomic_classifier: {
    eyebrow: "Taxonomic classification", summary: "Train or apply the registered microbiome taxonomic classifier to sequence evidence.",
    stages: ["Choose mode", "Upload sequences", "Configure model", "Review taxa"],
    outputs: ["Taxonomic predictions", "Model metrics", "Classification artifacts"],
    note: "Predictions remain model-derived evidence and require appropriate validation.",
  },
  amr_gene_classifier: {
    eyebrow: "Antimicrobial resistance", summary: "Train or apply a bounded classifier for antimicrobial-resistance gene sequences.",
    stages: ["Choose mode", "Upload sequences", "Run classifier", "Review AMR labels"],
    outputs: ["AMR predictions", "Confidence evidence", "Model artifacts"],
    note: "Predicted resistance does not replace phenotypic susceptibility testing.",
  },
  mag_quality: {
    eyebrow: "Metagenome assemblies", summary: "Assess completeness and contamination evidence for metagenome-assembled genomes.",
    stages: ["Upload MAGs", "Validate assemblies", "Assess quality", "Review bins"],
    outputs: ["MAG quality table", "Completeness summary", "Run report"],
    note: "Quality estimates depend on the supplied assemblies and configured markers.",
  },
  binding_site_predictor: {
    eyebrow: "Protein binding sites", summary: "Predict candidate ligand-binding residues from a supplied protein structure.",
    stages: ["Upload structure", "Validate chains", "Predict sites", "Review residues"],
    outputs: ["Predicted sites", "Residue scores", "Structure evidence"],
    note: "Predicted sites are hypotheses for experimental or structural validation.",
  },
  docking_pose_viewer: {
    eyebrow: "Docking visualization", summary: "Inspect docked ligand poses alongside an optional receptor structure.",
    stages: ["Upload poses", "Add receptor", "Render structures", "Review interactions"],
    outputs: ["Pose visualization", "Interaction summary", "Viewer artifacts"],
    note: "Visualization preserves docking provenance and does not rescore poses.",
  },
  target_prediction: {
    eyebrow: "Compound targets", summary: "Predict candidate biological targets from validated compound descriptors.",
    stages: ["Add compound", "Validate features", "Predict targets", "Review ranking"],
    outputs: ["Target ranking", "Prediction scores", "Model evidence"],
    note: "Predicted targets require orthogonal experimental confirmation.",
  },
  drug_response_predictor: {
    eyebrow: "Drug response", summary: "Estimate response from molecular features using the registered predictive workflow.",
    stages: ["Upload features", "Select model", "Run prediction", "Review response"],
    outputs: ["Response predictions", "Model metrics", "Interpretation artifacts"],
    note: "Results are research-use predictions and not treatment recommendations.",
  },
  protein_stability_ddg_predictor: {
    eyebrow: "Protein stability", summary: "Train or apply a protein mutation stability predictor for ΔΔG estimation.",
    stages: ["Choose mode", "Add mutations", "Configure model", "Review ΔΔG"],
    outputs: ["Stability predictions", "Model metrics", "Run artifacts"],
    note: "Predicted ΔΔG values require structural and experimental validation.",
  },
  opentargets: {
    eyebrow: "Target–disease evidence", summary: "Query Open Targets associations, target profiles and therapeutic evidence.",
    stages: ["Choose operation", "Enter target or disease", "Query evidence", "Review associations"],
    outputs: ["Association records", "Evidence scores", "Source provenance"],
    note: "Evidence scores support prioritization and do not establish clinical utility.",
  },
  pubchem: {
    eyebrow: "Chemical reference", summary: "Search and inspect PubChem compounds, identifiers and molecular properties.",
    stages: ["Choose operation", "Search compounds", "Inspect record", "Review properties"],
    outputs: ["Compound records", "Chemical properties", "Source provenance"],
    note: "Returned identifiers and properties remain attributed to PubChem.",
  },
  rcsb_pdb: {
    eyebrow: "Macromolecular structures", summary: "Search RCSB PDB and inspect experimentally determined structure records.",
    stages: ["Choose query", "Set filters", "Search structures", "Review entries"],
    outputs: ["Structure records", "Experimental metadata", "PDB identifiers"],
    note: "Resolution, experimental method and source provenance remain visible.",
  },
  reactome: {
    eyebrow: "Pathway knowledge", summary: "Query curated Reactome pathways, participants and biological context.",
    stages: ["Choose query", "Enter identifier", "Search pathways", "Review context"],
    outputs: ["Pathway records", "Participant evidence", "Source provenance"],
    note: "Species and pathway-release context remain part of returned evidence.",
  },
  gtex: {
    eyebrow: "Tissue expression", summary: "Query GTEx tissue expression and expression quantitative-trait evidence.",
    stages: ["Choose operation", "Enter gene or variant", "Query tissues", "Review evidence"],
    outputs: ["Expression records", "Tissue comparisons", "eQTL evidence"],
    note: "Population and tissue context must be considered when interpreting results.",
  },
});

export const SCIENTIFIC_PLUGIN_RENDERERS = Object.freeze(Object.fromEntries(
  Object.entries(WORKFLOWS).map(([slug, workflow]) => [slug, createGuidedPluginRenderer(workflow)]),
));

export const SCIENTIFIC_PLUGIN_SLUGS = Object.freeze(Object.keys(WORKFLOWS));
