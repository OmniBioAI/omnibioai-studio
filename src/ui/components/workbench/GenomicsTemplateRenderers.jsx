import React from "react";
import AsyncAnalysisRenderer from "./AsyncAnalysisRenderer";
import InformationalRenderer from "./InformationalRenderer";
import QueryRenderer from "./QueryRenderer";
import GenomeViewerRenderer from "./GenomeViewerRenderer";
import { Panel, PanelBody, PanelHeader } from "../UI";
import "./GenomicsTemplateRenderers.css";

// This registry was written from the historical Workbench template inventory.
// It intentionally describes the page anatomy/content, not copies of prior
// Studio React renderer definitions. The descriptor remains authoritative for
// current submission, polling, logs, artifacts, and downloads.
export const GENOMICS_TEMPLATE_PAGES = Object.freeze({
  admixture_analysis: { icon: "🌍", eyebrow: "Population structure", sections: ["Input", "Population settings", "Ancestry estimates"], summary: "Estimate ancestry proportions from genotype evidence and review population structure." },
  assembly_qc: { icon: "🧬", eyebrow: "Assembly quality", sections: ["Assembly input", "Quality metrics", "Report"], summary: "Evaluate assembly contiguity and completeness before downstream genome analysis." },
  bedtools_intersect: { icon: "🧩", eyebrow: "Interval operations", sections: ["Input Mode", "Execution Status", "DAG Graph", "Live Logs", "Artifacts", "Results", "Run History"], summary: "Intersect two genomic interval sets and inspect the run, logs, output records, and history." },
  cnvkit: { icon: "🧬", eyebrow: "Copy-number analysis", sections: ["Plugin scaffold", "Input contract", "Outputs"], scaffold: true, summary: "CNVkit copy-number analysis page registered with the Workbench." },
  deepvariant: { icon: "🧬", eyebrow: "Variant calling", sections: ["Run DeepVariant", "Status", "Artifacts", "Log tail"], summary: "Call variants from an indexed BAM/CRAM and reference genome; review run status and artifacts." },
  eqtl_linker: { icon: "🔗", eyebrow: "Variant–expression links", sections: ["Upload data", "Choose locus", "Visualization", "Results", "Warnings", "Regional plot", "Run summary", "Top GWAS variants", "Top eQTL hits"], summary: "Explore GWAS and eQTL evidence around a selected locus and inspect regional associations." },
  fastq_qc: { icon: "🧪", eyebrow: "Sequencing quality", sections: ["Inputs", "Validate", "QC Tools", "Run", "Report", "outputs.json"], summary: "Choose FASTQ inputs, validate them, run FastQC/MultiQC, then review the report and normalized outputs." },
  fastq_trimmer: { icon: "✂️", eyebrow: "Read preprocessing", sections: ["Input", "Tool", "Status & Logs"], summary: "Trim adapters and low-quality bases from FASTQ reads with fastp and inspect run output." },
  fst_calculator: { icon: "🌍", eyebrow: "Population differentiation", sections: ["Input", "Population groups", "FST results"], summary: "Estimate genetic differentiation between populations and review the resulting statistics." },
  gene_annotation: { icon: "🧬", eyebrow: "Functional annotation", sections: ["Inputs", "Options", "Results", "Gene Expression Summary", "Visualization"], summary: "Annotate a gene list or expression input and review functional, pathway, and clinical evidence." },
  genome_viewer: { icon: "🔭", eyebrow: "Genome browser", sections: ["Inputs", "Viewer"], summary: "Load a reference and genomic tracks, enter a locus, and explore the region in the genome viewer." },
  gwas_popgen: { icon: "📊", eyebrow: "Association genetics", sections: ["Create a GWAS run", "Warnings", "Steps", "Artifacts"], summary: "Configure genotype, phenotype, covariate, QC, and population parameters for a GWAS run." },
  ld_analysis: { icon: "🧬", eyebrow: "Linkage disequilibrium", sections: ["Input", "Population", "LD results"], summary: "Calculate linkage disequilibrium measures from variant evidence and inspect regional patterns." },
  nanopore_qc: { icon: "🧵", eyebrow: "Long-read quality", sections: ["Input", "Read metrics", "QC report"], summary: "Summarize Nanopore run yield, read-length, and quality distributions." },
  network_analysis: { icon: "🕸️", eyebrow: "Interaction networks", sections: ["Inputs & Analysis", "Selection", "Network view", "Results"], summary: "Build a network from uploaded or registered interaction data, then select a graph analysis and inspect results." },
  object_transform: { icon: "🔄", eyebrow: "Data transformation", sections: ["Input", "Live Logs", "DAG View", "Artifacts"], summary: "Transform a registered scientific object and follow execution logs, the workflow graph, and generated artifacts." },
  omnilink_e2t: { icon: "🧬", eyebrow: "Enhancer-to-target mapping", sections: ["Upload inputs", "Advanced scoring", "Scoring model", "Run detail", "Gene results"], summary: "Connect variants or regulatory regions to candidate target genes with interpretable activity, loop, and distance evidence." },
  orf_finder: { icon: "🔤", eyebrow: "Sequence analysis", sections: ["Input Sequence", "Results", "Error"], summary: "Find open reading frames in pasted sequence or an uploaded FASTA and review predicted translations." },
  pathogenicity_scoring: { icon: "⚠️", eyebrow: "Variant prioritization", sections: ["Start a run", "Choose OmniObject", "Upload annotated VCF", "Scoring settings", "Run", "Downloads", "Run status", "Top variants", "Live log"], summary: "Score and rank annotated variants using configurable evidence and inspect the run’s top candidates." },
  pathway_enrichment: { icon: "🧭", eyebrow: "Pathway analysis", sections: ["Pathway Enrichment", "Results Table", "Visualization", "AI Insights", "Enrichr Output", "GSEA Output"], summary: "Run enrichment on a gene list, review ranked pathways and visualizations, and inspect source outputs." },
  phasing_haplotype_analysis: { icon: "🧩", eyebrow: "Haplotype analysis", sections: ["Input", "Configure", "Run", "Steps", "QC Summary", "Artifacts", "Live Log"], summary: "Select variant and optional read evidence, configure phasing options, then inspect QC and haplotype artifacts." },
  phenotype_association: { icon: "🩺", eyebrow: "Genotype–phenotype evidence", sections: ["Inputs", "Phenotypes (HPO terms)", "Candidate variants", "Parameters", "Outputs", "Next steps"], summary: "Match HPO phenotype terms to candidate variant evidence and review gene-level association results." },
  population_pca: { icon: "🧭", eyebrow: "Population structure", sections: ["Plugin scaffold", "Input contract", "Outputs"], scaffold: true, summary: "Population PCA structure page registered with the Workbench." },
  prs_builder: { icon: "📈", eyebrow: "Polygenic risk score", sections: ["Create a PRS run", "Input data", "Columns & parameters", "Run status", "Artifacts", "Run log"], summary: "Build a reproducible polygenic risk score from summary statistics, genotype data, and optional phenotype covariates." },
  prs_deep_predictor: { icon: "🧠", eyebrow: "Nonlinear risk prediction", sections: ["Input", "Model settings", "Results", "Run log"], summary: "Train or apply a nonlinear polygenic risk model and inspect predictions and execution logs." },
  rare_variant_burden: { icon: "🧬", eyebrow: "Rare-variant association", sections: ["Inputs", "Phenotype & Covariates", "Annotation & Filters", "Run Configuration", "Live Status", "Artifacts", "Tables", "Figures", "Logs"], summary: "Configure gene-level rare-variant burden tests from VCF and sample evidence, then monitor results and artifacts." },
  read_simulator: { icon: "🧪", eyebrow: "Synthetic sequencing data", sections: ["Configuration", "Run status"], summary: "Configure simulated sequencing reads, layout, reference, coverage, and reproducibility seed." },
  restriction_digest: { icon: "✂️", eyebrow: "Restriction analysis", sections: ["Input Sequence", "Enzyme Panel", "Results", "Error"], summary: "Select restriction enzymes and inspect predicted cut sites and fragment lengths for the supplied sequence." },
  selection_scan: { icon: "🔎", eyebrow: "Evolutionary genetics", sections: ["Input", "Population settings", "Selection statistics"], summary: "Scan allele-frequency evidence for candidate signatures of selection." },
  spliceai: { icon: "🧬", eyebrow: "Splice effect annotation", sections: ["Run SpliceAI", "Steps", "Logs", "Artifacts", "Recent Runs"], summary: "Annotate variants with SpliceAI delta scores and review run history and generated artifacts." },
  sra_submission_manager: { icon: "📦", eyebrow: "Sequence archive submission", sections: ["Step 1 — Prepare & Validate", "Prepare Results", "Step 2 — Submit to NCBI"], summary: "Validate a sample sheet and prepare an SRA submission package before an explicit remote upload step." },
  sv_fusion_circos: { icon: "🧬", eyebrow: "Structural-variant visualization", sections: ["Input", "Display", "Filters", "Selection", "Viewer"], summary: "Visualize structural variants and fusions in a Circos view with sample, type, and support filters." },
  variant_annotation: { icon: "🧬", eyebrow: "Variant annotation", sections: ["Inputs", "Tool & Options", "Multi-Source Variant Annotation", "Results", "Charts"], summary: "Annotate VCF variants from selected sources and inspect normalized evidence, tables, and charts." },
  variant_classifier_finetuner: { icon: "🧠", eyebrow: "Model fine-tuning", sections: ["Training data", "Fine-tuning configuration", "Model outputs"], summary: "Fine-tune a variant pathogenicity classifier on curated lab-specific variant evidence." },
  variant_qc_filtering: { icon: "🧹", eyebrow: "Variant quality control", sections: ["Start a run", "Choose OmniObject", "Upload VCF", "QC & filtering settings", "Downloads", "Run status", "QC Summary", "Live log"], summary: "Filter variant calls by quality, depth, allele frequency, and biallelic/SNP requirements." },
  vcf_liftover: { icon: "↗️", eyebrow: "Genome-build conversion", sections: ["Input", "Source and target builds", "Converted VCF"], summary: "Lift VCF coordinates between supported genome assemblies using an explicit chain file." },
});

export const GENOMICS_PLUGIN_SLUGS = Object.freeze(Object.keys(GENOMICS_TEMPLATE_PAGES));

export const GENOMICS_HISTORIC_TEMPLATE_FILES = Object.freeze({
  admixture_analysis: ["index.html"], assembly_qc: ["index.html"], bedtools_intersect: ["index.html"], cnvkit: ["index.html"],
  deepvariant: ["index.html", "run_detail.html"], eqtl_linker: ["index.html", "ui.html"], fastq_qc: ["configure.html", "run_detail.html"],
  fastq_trimmer: ["index.html"], fst_calculator: ["index.html"], gene_annotation: ["index.html", "result.html", "upload.html"],
  genome_viewer: ["index.html"], gwas_popgen: ["index.html", "run_detail.html"], ld_analysis: ["index.html"], nanopore_qc: ["index.html"],
  network_analysis: ["index.html", "upload.html", "view_network.html"], object_transform: ["index.html"],
  omnilink_e2t: ["index.html", "run_detail.html", "upload.html"], orf_finder: ["index.html"],
  pathogenicity_scoring: ["index.html", "run_detail.html"], pathway_enrichment: ["results.html", "ui.html", "upload.html"],
  phasing_haplotype_analysis: ["index.html", "results.html", "run_detail.html", "ui.html"],
  phenotype_association: ["configure.html", "index.html", "run_detail.html"], population_pca: ["index.html"],
  prs_builder: ["index.html", "run_detail.html"], prs_deep_predictor: ["index.html"],
  rare_variant_burden: ["home.html", "index.html", "run_detail.html", "upload.html"], read_simulator: ["index.html"],
  restriction_digest: ["index.html"], selection_scan: ["index.html"], spliceai: ["index.html", "run_detail.html", "runs.html"],
  sra_submission_manager: ["index.html"], sv_fusion_circos: ["index.html"],
  variant_annotation: ["base.html", "index.html", "result.html"], variant_classifier_finetuner: ["index.html"],
  variant_qc_filtering: ["index.html", "run_detail.html"], vcf_liftover: ["index.html"],
});

export const GENOMICS_HISTORIC_TEMPLATE_COUNT = Object.values(GENOMICS_HISTORIC_TEMPLATE_FILES)
  .reduce((total, files) => total + files.length, 0);

const parameterField = (id, label, component = "text", format = "text", options = {}) => ({
  id, label, component, format, description: options.description || `Historical Workbench setting: ${label}.`,
  required: Boolean(options.required), ...(options.default !== undefined ? { default: options.default } : {}),
  ...(options.choices ? { choices: component === "multiselect"
    ? options.choices.map(value => ({ value, label: value })) : options.choices } : {}),
  ...(options.conditions ? { conditions: options.conditions } : {}),
  ...(options.fileTarget ? { fileTarget: options.fileTarget, fileName: options.fileName, fileType: options.fileType } : {}),
  ...(options.fileTransform ? { fileTransform: options.fileTransform } : {}),
  ...(options.min !== undefined ? { min: options.min } : {}),
  ...(options.max !== undefined ? { max: options.max } : {}),
  ...(options.step !== undefined ? { step: options.step } : {}),
  ...(options.placeholder ? { placeholder: options.placeholder } : {}),
});

// These controls were recovered from the historical HTML forms. Values are
// sent as the plugin's `parameters` object; manifest input files remain handled
// by the server-provided descriptor and its normal multipart upload contract.
export const GENOMICS_HISTORIC_PARAMETER_FIELDS = Object.freeze({
  deepvariant: [
    parameterField("model_type", "Model type", "select", "text", { choices: ["WGS", "WES", "PACBIO", "ONT"], default: "WGS" }),
    parameterField("profile", "Execution profile", "select", "text", { choices: ["cpu", "gpu"], default: "cpu" }),
    parameterField("sample_name", "Sample name", "text", "text", { default: "sample1", required: true }),
  ],
  eqtl_linker: [
    parameterField("lead_variant", "Lead variant", "text", "text", { placeholder: "rs123 or chr1:123456" }),
    parameterField("window_kb", "Window (kb)", "number", "integer", { default: "500", min: 50, max: 5000, step: 50 }),
    parameterField("tissue", "Tissue / context"), parameterField("ld_source", "LD source"),
    parameterField("plot_mode", "Plot mode"), parameterField("compute_coloc", "Colocalization"),
    parameterField("use_demo", "Use demo files", "checkbox", "boolean", { default: false }),
    parameterField("normalize_build", "Normalize genome build", "checkbox", "boolean", { default: true }),
  ],
  // GWAS uses the current VCF + optional phenotype-file contract directly;
  // historical host-path/PLINK controls are deliberately not emitted as they
  // cannot be resolved by the authenticated Studio runner.
  network_analysis: [
    parameterField("input_source", "Input source", "select", "text", { choices: ["paste", "file"], default: "paste" }),
    parameterField("separator", "Separator", "select", "text", { choices: ["space", "tab", "comma"], default: "space" }),
    parameterField("paste_text", "Paste edge list", "textarea", "text", { placeholder: "TP53 BRCA1 0.92 ppi\nTP53 MDM2 0.88 ppi", fileTarget: "interaction_table_tsv", fileName: "interaction-table.tsv", fileTransform: "edge-list-tsv", conditions: [{ controller: "ui_input_source", operator: "equals", value: "paste", effect: "visible" }, { controller: "ui_input_source", operator: "equals", value: "paste", effect: "required" }] }),
  ],
  object_transform: [parameterField("target_format", "Output format", "select", "text", { choices: ["json", "tsv", "vcf"], default: "json" })],
  omnilink_e2t: [
    parameterField("genome_build", "Genome build", "select", "text", { choices: ["hg38", "hg19"], default: "hg38" }),
    parameterField("promoter_window_bp", "Promoter window (bp)", "number", "integer", { default: "20000", min: 0 }),
    parameterField("max_loop_distance_bp", "Max loop distance (bp)", "number", "integer", { default: "1000000", min: 1 }),
    parameterField("top_n", "Top N variant-to-gene links", "number", "integer", { default: "2000", min: 1 }),
    parameterField("min_loop_score", "Minimum loop score", "number", "float", { min: 0 }),
    parameterField("abc_d0", "ABC d0 (bp)", "number", "float", { default: "100000", min: 1 }),
    parameterField("abc_power", "ABC distance power", "number", "float", { default: "2", min: 0 }),
    parameterField("abc_promoter_boost", "Promoter boost", "number", "float", { default: "1", min: 0.1 }),
  ],
  orf_finder: [
    parameterField("input_mode", "Input source", "select", "text", { choices: ["paste", "upload"], default: "paste" }),
    parameterField("sequence", "Paste DNA / FASTA sequence", "textarea", "text", { required: false, placeholder: ">sequence\nATG…", fileTarget: "sequence", fileName: "sequence.fasta", conditions: [
      { controller: "ui_input_mode", operator: "equals", value: "paste", effect: "visible" },
      { controller: "ui_input_mode", operator: "equals", value: "paste", effect: "required" },
    ] }),
    parameterField("min_aa_length", "Minimum ORF length (aa)", "number", "integer", { default: "30", min: 1, max: 10000 }),
  ],
  pathogenicity_scoring: [
    parameterField("score_model", "Model", "select", "text", { choices: ["basic_effect_impact", "future_predictors"], default: "basic_effect_impact" }),
    parameterField("top_n", "Top N", "number", "integer", { default: "50", min: 1, max: 500 }),
    parameterField("require_pass", "Require PASS filter", "select", "text", { choices: ["false", "true"], default: "false" }),
    parameterField("worst_strategy", "Pick worst transcript by", "select", "text", { choices: ["impact", "effect"], default: "impact" }),
    parameterField("include_modifier", "Include MODIFIER variants", "select", "text", { choices: ["true", "false"], default: "true" }),
  ],
  pathway_enrichment: [
    parameterField("input_source", "Input source", "select", "text", { choices: ["upload", "paste"], default: "paste" }),
    parameterField("enrichment_types", "Methods", "multiselect", "text", { choices: ["go", "reactome", "gsea"], default: ["go"] }),
    parameterField("gene_symbols", "Paste gene symbols", "textarea", "text", { placeholder: "TP53, BRCA1, EGFR…", fileTarget: "gene_list", fileName: "gene-list.txt", fileTransform: "gene-list-text", conditions: [{ controller: "ui_input_source", operator: "equals", value: "paste", effect: "visible" }, { controller: "ui_input_source", operator: "equals", value: "paste", effect: "required" }] }),
    parameterField("organism", "Organism", "select", "text", { choices: ["Human", "Mouse"], default: "Human" }),
    parameterField("cutoff", "Adjusted p-value cutoff", "number", "float", { default: "0.05", min: 0, max: 1, step: 0.01 }),
    parameterField("top_n", "Top N terms", "number", "integer", { default: "20", min: 1 }),
    parameterField("run_llm_summary", "Generate AI summary", "checkbox", "boolean", { default: true }),
    parameterField("run_dotplot", "Generate enrichment plot", "checkbox", "boolean", { default: true }),
  ],
  prs_deep_predictor: [
    parameterField("mode", "Mode", "select", "text", { choices: ["infer", "train"], default: "infer" }),
    parameterField("model_ref", "Model reference", "text", "text", { placeholder: "prs_mlp@production" }),
    parameterField("hyperparams", "Hyperparameters (JSON)", "textarea", "json", { placeholder: '{"lr": 0.001, "epochs": 50}' }),
  ],
  restriction_digest: [
    parameterField("input_mode", "Input source", "select", "text", { choices: ["paste", "upload"], default: "paste" }),
    parameterField("sequence", "Paste DNA / FASTA sequence", "textarea", "text", { required: false, placeholder: ">sequence\nATGC…", fileTarget: "sequence", fileName: "sequence.fasta", conditions: [{ controller: "ui_input_mode", operator: "equals", value: "paste", effect: "visible" }, { controller: "ui_input_mode", operator: "equals", value: "paste", effect: "required" }] }),
    parameterField("circular", "Circular / plasmid sequence", "checkbox", "boolean", { default: false }),
    parameterField("enzymes", "Enzyme panel", "multiselect", "text", { choices: ["EcoRI", "BamHI", "HindIII", "NotI", "XhoI", "PstI", "SmaI", "KpnI", "SacI", "SalI"], default: ["EcoRI"] }),
  ],
  spliceai: [
    parameterField("genome", "Reference genome", "select", "text", { choices: ["hg38", "hg19"], default: "hg38" }),
    parameterField("distance", "Maximum splice-site distance", "number", "integer", { default: "50", min: 1, max: 500 }),
  ],
  variant_qc_filtering: [
    parameterField("require_pass", "Require PASS filter", "checkbox", "boolean", { default: true }),
    parameterField("min_qual", "Minimum QUAL", "number", "float", { default: "30", min: 0 }),
    parameterField("min_dp", "Minimum depth (DP)", "number", "integer", { default: "10", min: 0 }),
    parameterField("max_af", "Maximum allele frequency", "number", "float", { min: 0, max: 1, step: 0.0001 }),
    parameterField("biallelic_only", "Keep only biallelic", "checkbox", "boolean", { default: false }),
    parameterField("snps_only", "Keep SNPs only", "checkbox", "boolean", { default: false }),
    parameterField("note", "Notes (optional)"),
  ],
  fastq_qc: [
    parameterField("preset", "QC tools", "select", "text", { choices: ["fastqc_multiqc", "fastqc_only", "multiqc_only"], default: "fastqc_multiqc" }),
    parameterField("threads", "Threads", "number", "integer", { default: "2", min: 1 }),
    parameterField("multiqc_title", "MultiQC report title", "text", "text", { default: "FASTQ QC" }),
  ],
  gene_annotation: [
    parameterField("input_source", "Input source", "select", "text", { choices: ["paste", "upload"], default: "paste" }),
    parameterField("genes_text", "Paste gene symbols", "textarea", "text", { placeholder: "EGFR TP53 BRCA1", fileTarget: "gene_list", fileName: "gene-list.json", fileTransform: "gene-list-json", conditions: [{ controller: "ui_input_source", operator: "equals", value: "paste", effect: "visible" }, { controller: "ui_input_source", operator: "equals", value: "paste", effect: "required" }] }),
    parameterField("annot_go", "Map genes to GO terms", "checkbox", "boolean", { default: true }),
    parameterField("annot_pathways", "Map genes to KEGG pathways", "checkbox", "boolean", { default: true }),
    parameterField("annot_clinical", "Include linked clinical evidence", "checkbox", "boolean", { default: false }),
    parameterField("include_llm", "Include local LLM notes", "checkbox", "boolean", { default: false }),
  ],
  phenotype_association: [
    parameterField("phenotype_source", "Phenotype input source", "select", "text", { choices: ["upload", "paste"], default: "paste" }),
    parameterField("phenotype_text", "Paste HPO terms", "textarea", "text", { placeholder: "HP:0001250\nHP:0002373\nHP:0004322", fileTarget: "phenotype", fileName: "phenotypes.txt", conditions: [{ controller: "ui_phenotype_source", operator: "equals", value: "paste", effect: "visible" }, { controller: "ui_phenotype_source", operator: "equals", value: "paste", effect: "required" }] }),
    parameterField("candidates_source", "Candidate variants source", "select", "text", { choices: ["upload", "paste"], default: "paste" }),
    parameterField("candidates_text", "Paste candidate variants (TSV)", "textarea", "text", { placeholder: "variant_id\tgene\tpathogenicity_score", fileTarget: "clinical_mapping", fileName: "candidate-variants.tsv", conditions: [{ controller: "ui_candidates_source", operator: "equals", value: "paste", effect: "visible" }, { controller: "ui_candidates_source", operator: "equals", value: "paste", effect: "required" }] }),
    parameterField("inheritance_mode", "Inheritance mode", "select", "text", { choices: ["any", "dominant", "recessive", "de_novo", "x_linked"], default: "any" }),
    parameterField("max_genes", "Maximum genes", "number", "integer", { default: "50", min: 1 }),
    parameterField("max_variants", "Maximum variants", "number", "integer", { default: "50", min: 1 }),
    parameterField("weights", "Evidence weights (JSON)", "textarea", "json", { placeholder: "{}" }),
  ],
  phasing_haplotype_analysis: [
    parameterField("mode", "Mode", "select", "text", { choices: ["statistical", "trio", "reference", "read_backed"], default: "statistical" }),
    parameterField("engine", "Engine", "select", "text", { choices: ["whatshap", "shapeit", "beagle"], default: "whatshap" }),
    parameterField("maf", "Minimum allele frequency", "number", "float", { default: "0.01", min: 0, max: 0.5 }),
    parameterField("missingness", "Maximum missingness", "number", "float", { default: "0.05", min: 0, max: 1 }),
    parameterField("ped_path", "PED/FAM path"), parameterField("genetic_map_path", "Genetic map path"),
    parameterField("reference_panel_path", "Reference panel path"), parameterField("bam_path", "BAM/CRAM path"),
    parameterField("snps_only", "SNPs only", "checkbox", "boolean", { default: true }),
    parameterField("merge_output", "Merge per-chromosome outputs", "checkbox", "boolean", { default: false }),
  ],
  read_simulator: [
    ...[["mode", "Mode", ["WGS", "WES", "RNA-seq"]], ["layout", "Layout", ["Single-end", "Paired-end"]], ["engine", "Engine", ["Auto", "wgsim", "dwgsim"]], ["organism", "Organism", ["Human", "Mouse"]], ["ref_fasta", "Reference FASTA", ["reference"]], ["transcript_fasta", "Transcript FASTA", ["reference"]], ["gtf", "GTF", ["reference"]]].map(([id, label, choices]) => parameterField(id, label, "select", "text", { choices, default: choices[0] })),
    ...[["read_length", "Read length", "150"], ["seed", "Seed", "1"], ["coverage", "Coverage", "5"], ["num_reads", "Number of reads", "1000000"], ["frag_mean", "Fragment mean", "350"], ["frag_sd", "Fragment SD", "50"]].map(([id, label, value]) => parameterField(id, label, "number", "integer", { default: value, min: 1 })),
    parameterField("sample_name", "Sample name", "text", "text", { default: "sample" }),
  ],
  sra_submission_manager: [
    parameterField("mode", "Submission step", "select", "text", { choices: ["prepare", "submit"], default: "prepare", required: true }),
    parameterField("prepare_run_id", "Completed prepare run ID", "text", "text", { conditions: [
      { controller: "ui_mode", operator: "equals", value: "submit", effect: "visible" },
      { controller: "ui_mode", operator: "equals", value: "submit", effect: "required" },
    ] }),
    parameterField("bioproject_title", "BioProject title", "text", "text", { conditions: [
      { controller: "ui_mode", operator: "equals", value: "prepare", effect: "visible" },
      { controller: "ui_mode", operator: "equals", value: "prepare", effect: "required" },
    ] }),
    parameterField("bioproject_description", "BioProject description", "textarea", "text", { conditions: [
      { controller: "ui_mode", operator: "equals", value: "prepare", effect: "visible" },
    ] }),
    parameterField("submitter_account", "NCBI submitter account", "text", "text", { conditions: [
      { controller: "ui_mode", operator: "equals", value: "prepare", effect: "visible" },
    ] }),
    parameterField("confirm", "I reviewed the package and confirm NCBI submission", "checkbox", "boolean", { default: false, conditions: [
      { controller: "ui_mode", operator: "equals", value: "submit", effect: "visible" },
      { controller: "ui_mode", operator: "equals", value: "submit", effect: "required" },
    ] }),
  ],
  variant_annotation: [
    parameterField("input_source", "Input type", "select", "text", { choices: ["paste", "upload"], default: "upload" }),
    parameterField("vcf_text", "Paste VCF", "textarea", "text", { placeholder: "##fileformat=VCFv4.2", fileTarget: "input_vcf", fileName: "variants.vcf", conditions: [{ controller: "ui_input_source", operator: "equals", value: "paste", effect: "visible" }, { controller: "ui_input_source", operator: "equals", value: "paste", effect: "required" }] }),
    parameterField("annot_tool", "Annotation tool", "select", "text", { choices: ["snpeff", "annovar", "vep", "bcftools_csqs"], default: "vep" }),
    parameterField("organism", "Organism", "select", "text", { choices: ["human", "mouse", "rat", "zebrafish"], default: "human" }),
    parameterField("genome_build", "Genome build", "select", "text", { choices: ["GRCh38", "GRCh37"], default: "GRCh38" }),
    parameterField("create_log", "Create log", "checkbox", "boolean", { default: true }),
    parameterField("create_run_object", "Create run object", "checkbox", "boolean", { default: false }),
  ],
  rare_variant_burden: [
    parameterField("genome_build", "Genome build", "select", "text", { choices: ["GRCh38", "GRCh37"], default: "GRCh38" }),
    parameterField("sample_id_col", "Sample ID column", "text", "text", { default: "sample_id" }),
    parameterField("phenotype_type", "Phenotype type", "select", "text", { choices: ["binary", "quantitative"], default: "binary" }),
    parameterField("phenotype_col", "Phenotype column", "text", "text", { required: true }),
    parameterField("case_value", "Case value", "text", "text", { default: "1" }),
    parameterField("control_value", "Control value", "text", "text", { default: "0" }),
    parameterField("covariates", "Covariates (comma-separated)"),
    parameterField("annotation_field", "Annotation field", "select", "text", { choices: ["ANN", "CSQ"], default: "ANN" }),
    parameterField("gene_key", "Gene key", "text", "text", { default: "SYMBOL" }),
    parameterField("maf", "Maximum allele frequency", "number", "float", { default: "0.01", min: 0, max: 1, step: 0.0001 }),
    parameterField("missingness", "Maximum missing rate", "number", "float", { default: "0.05", min: 0, max: 1, step: 0.01 }),
  ],
  sv_fusion_circos: [
    parameterField("color_mode", "Color by", "select", "text", { choices: ["svtype", "sample"], default: "svtype" }),
    parameterField("filter_samples", "Samples to display", "multiselect", "text", { choices: ["all"], default: ["all"] }),
    parameterField("filter_types", "Structural-variant types", "multiselect", "text", { choices: ["DEL", "DUP", "INV", "INS", "BND", "FUSION"], default: ["DEL", "DUP", "INV", "INS", "BND", "FUSION"] }),
    parameterField("min_support", "Minimum support", "number", "integer", { min: 0, default: "0" }),
  ],
  vcf_liftover: [
    parameterField("source_build", "Source genome build", "select", "text", { choices: ["hg19", "hg38", "grch37", "grch38"], default: "hg19" }),
    parameterField("target_build", "Target genome build", "select", "text", { choices: ["hg19", "hg38", "grch37", "grch38"], default: "hg38" }),
  ],
});

export const GENOMICS_HISTORIC_INPUT_OVERRIDES = Object.freeze({
  network_analysis: { interaction_table_tsv: { required: false, conditions: [
    { controller: "ui_input_source", operator: "equals", value: "file", effect: "visible" },
    { controller: "ui_input_source", operator: "equals", value: "file", effect: "required" },
  ] } },
  gene_annotation: { gene_list: { required: false, conditions: [
    { controller: "ui_input_source", operator: "equals", value: "upload", effect: "visible" },
    { controller: "ui_input_source", operator: "equals", value: "upload", effect: "required" },
  ] } },
  orf_finder: { sequence: { required: false, conditions: [
    { controller: "ui_input_mode", operator: "equals", value: "upload", effect: "visible" },
    { controller: "ui_input_mode", operator: "equals", value: "upload", effect: "required" },
  ] } },
  restriction_digest: { sequence: { required: false, conditions: [
    { controller: "ui_input_mode", operator: "equals", value: "upload", effect: "visible" },
    { controller: "ui_input_mode", operator: "equals", value: "upload", effect: "required" },
  ] } },
  variant_annotation: { input_vcf: { required: false, conditions: [
    { controller: "ui_input_source", operator: "equals", value: "upload", effect: "visible" },
    { controller: "ui_input_source", operator: "equals", value: "upload", effect: "required" },
  ] } },
  phenotype_association: {
    phenotype: { required: false, conditions: [
      { controller: "ui_phenotype_source", operator: "equals", value: "upload", effect: "visible" },
      { controller: "ui_phenotype_source", operator: "equals", value: "upload", effect: "required" },
    ] },
    clinical_mapping: { required: false, conditions: [
      { controller: "ui_candidates_source", operator: "equals", value: "upload", effect: "visible" },
      { controller: "ui_candidates_source", operator: "equals", value: "upload", effect: "required" },
    ] },
  },
  variant_annotation: { input_vcf: { required: false, conditions: [
    { controller: "ui_input_source", operator: "equals", value: "upload", effect: "visible" },
    { controller: "ui_input_source", operator: "equals", value: "upload", effect: "required" },
  ] } },
  pathway_enrichment: { gene_list: { required: false, conditions: [
    { controller: "ui_input_source", operator: "equals", value: "upload", effect: "visible" },
    { controller: "ui_input_source", operator: "equals", value: "upload", effect: "required" },
  ] } },
});

function backendFor(descriptor) {
  if (descriptor.plugin?.slug === "genome_viewer") return GenomeViewerRenderer;
  if (descriptor.renderer === "query") return QueryRenderer;
  if (descriptor.renderer === "informational") return InformationalRenderer;
  return AsyncAnalysisRenderer;
}

function GenomicsTemplatePage({ descriptor, slug }) {
  const page = GENOMICS_TEMPLATE_PAGES[slug];
  const plugin = descriptor.plugin || {};
  const Backend = backendFor(descriptor);
  const parameterFields = GENOMICS_HISTORIC_PARAMETER_FIELDS[slug] || [];
  return <main className={`genomics-template genomics-template--${slug}`} data-plugin-slug={slug}>
    <header className="genomics-template__header">
      <span className="genomics-template__icon" aria-hidden="true">{page.icon}</span>
      <div><p>{page.eyebrow} <span>·</span> Workbench Genomics</p><h2>{plugin.name || slug.replaceAll("_", " ")}</h2>
        <div className="genomics-template__summary">{page.summary}</div></div>
    </header>
    {page.scaffold && <Panel><PanelHeader title="Plugin registration"/><PanelBody>
      <p>This historical page was a capability scaffold. The React view displays the plugin’s current input/output contract and available workflow below.</p>
      <code>plugins/{slug}/plugin.json</code>
    </PanelBody></Panel>}
    <div className="genomics-template__engine"><Backend descriptor={descriptor} parameterFields={parameterFields} inputOverrides={GENOMICS_HISTORIC_INPUT_OVERRIDES[slug] || {}}/></div>
  </main>;
}

export const GENOMICS_TEMPLATE_RENDERERS = Object.freeze(Object.fromEntries(
  GENOMICS_PLUGIN_SLUGS.map(slug => [slug, function GenomicsReactTemplateRenderer({ descriptor }) {
    return <GenomicsTemplatePage descriptor={descriptor} slug={slug}/>;
  }]),
));
