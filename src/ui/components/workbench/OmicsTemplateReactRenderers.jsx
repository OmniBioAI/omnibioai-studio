import React from "react";
import AsyncAnalysisRenderer from "./AsyncAnalysisRenderer";
import InformationalRenderer from "./InformationalRenderer";
import { Panel, PanelBody, PanelHeader } from "../UI";
import "./OmicsTemplateReactRenderers.css";

const F = (id, label, component = "text", format = "text", options = {}) => ({
  id, label, component, format,
  description: options.description || `Historical Workbench control: ${label}.`,
  required: Boolean(options.required),
  ...(options.default !== undefined ? { default: options.default } : {}),
  ...(options.choices ? { choices: options.choices } : {}),
  ...(options.min !== undefined ? { min: options.min } : {}),
  ...(options.max !== undefined ? { max: options.max } : {}),
  ...(options.step !== undefined ? { step: options.step } : {}),
  ...(options.placeholder ? { placeholder: options.placeholder } : {}),
  ...(options.parameterPath ? { parameterPath: options.parameterPath } : {}),
  ...(options.parameterArray ? { parameterArray: options.parameterArray, parameterValue: options.parameterValue } : {}),
});

// Historical template inventory from Workbench history; current descriptors
// remain the authority for file inputs, endpoints, access, and run lifecycle.
export const OMICS_HISTORIC_TEMPLATE_FILES = Object.freeze({
  circrna_plotter: ["index.html", "run_detail.html"], circrna_postprocess: ["index.html", "run_detail.html"], circtools_runner: ["index.html", "run_detail.html"],
  atac_accessibility_classifier: ["index.html"], atac_differential: ["index.html"], atac_footprinting: ["index.html"], atac_motif_enrichment: ["index.html"], atac_peak_calling: ["index.html"], atac_report: ["index.html"],
  chipseq_differential_binding: ["configure.html", "index.html", "run_detail.html"], chipseq_motif_analysis: ["configure.html", "index.html", "run_detail.html"], chipseq_peak_annotation: ["configure.html", "index.html", "run_detail.html"],
  chipseq_peakset_ops: ["index.html", "run_detail.html"], chipseq_qc_metrics: ["index.html", "run_detail.html"], chipseq_report_generator: ["configure.html", "index.html", "run_detail.html"], chipseq_signal_plots: ["index.html", "chipseq_signal_matrix/run_detail.html"],
  chromatin_accessibility: ["index.html"], chromatin_state: ["index.html"], dmr_analysis: ["index.html"], epigenomics_report: ["index.html"], hic_analysis: ["index.html"], methylation_qc: ["index.html"], nanopore_methylation_caller: ["index.html"], tad_caller: ["index.html"],
  metabolomics_alignment: ["index.html", "run_detail.html"], metabolomics_annotate: ["index.html", "run_detail.html"], metabolomics_batch_correct: ["index.html", "run_detail.html"], metabolomics_batch_detect: ["index.html", "run_detail.html"], metabolomics_biomarkers: ["index.html", "run_detail.html"], metabolomics_feature_matrix: ["index.html", "run_detail.html"], metabolomics_importer: ["index.html", "run_detail.html"], metabolomics_imputation: ["index.html", "run_detail.html"], metabolomics_normalize: ["index.html", "run_detail.html"], metabolomics_outlier_detect: ["index.html", "run_detail.html"], metabolomics_peak_detect: ["index.html", "run_detail.html"], metabolomics_report: ["index.html", "run_detail.html"], metabolomics_sample_qc: ["index.html", "run_detail.html"], metabolomics_stats: ["index.html", "run_detail.html"],
  ms_spectrum_classifier: ["index.html"],
});

export const OMICS_HISTORIC_PARAMETER_FIELDS = Object.freeze({
  circrna_plotter: [F("top_n", "Top N circRNAs", "number", "integer", { default: "25", min: 5, max: 200 })],
  circrna_postprocess: [F("min_total", "Minimum total count", "number", "integer", { default: "1", min: 0 }), F("min_samples", "Minimum samples", "number", "integer", { default: "1", min: 1 })],
  circtools_runner: [F("nr_min", "Nr range minimum", "number", "integer", { default: "5", min: 0 }), F("nr_max", "Nr range maximum", "number", "integer", { default: "6", min: 0 }), ...[["flag_Pi", "-Pi"], ["flag_F", "-F"], ["flag_M", "-M"], ["flag_fg", "-fg"], ["flag_G", "-G"]].map(([id, label]) => F(id, `Enable ${label}`, "checkbox", "boolean", { default: true }))],
  atac_differential: [F("group_a", "Group A"), F("group_b", "Group B"), F("design", "Design formula", "text", "text", { default: "~ group" })],
  atac_footprinting: [F("window", "Footprint window (bp)", "number", "integer", { default: "100", min: 1 })],
  atac_peak_calling: [F("threshold", "Peak threshold", "number", "float", { min: 0 })],
  chipseq_differential_binding: [F("sample_col", "Sample column", "text", "text", { default: "sample" }), F("group_col", "Group column", "text", "text", { default: "group" }), F("contrast_a", "Contrast A"), F("contrast_b", "Contrast B"), F("pseudocount", "Pseudocount", "number", "float", { default: "1", min: 0 })],
  chipseq_motif_analysis: [F("k", "K-mer size", "number", "integer", { default: "6", min: 1 }), F("flank_bp", "Flank around peak midpoint (bp)", "number", "integer", { default: "100", min: 0 }), F("max_peaks", "Maximum peaks", "number", "integer", { default: "5000", min: 1 }), F("top_n", "Top motifs", "number", "integer", { default: "20", min: 1 }), F("pseudocount", "Pseudocount", "number", "float", { default: "1", min: 0 }), F("background_mode", "Background mode", "text", "text", { default: "reverse" })],
  chipseq_peak_annotation: [F("promoter_upstream_bp", "Promoter upstream (bp)", "number", "integer", { default: "2000", min: 0 }), F("promoter_downstream_bp", "Promoter downstream (bp)", "number", "integer", { default: "500", min: 0 }), F("assign_mode", "Assignment mode", "select", "text", { choices: ["within_promoter_then_nearest", "nearest_tss"], default: "within_promoter_then_nearest" }), F("max_distance_bp", "Maximum distance (bp)", "number", "integer", { default: "1000000", min: 0 })],
  chipseq_peakset_ops: [F("method", "Method", "select", "text", { choices: ["union", "intersect", "merge"], default: "union" }), F("merge_distance_bp", "Merge distance (bp)", "number", "integer", { default: "0", min: 0 }), F("label", "Output label")],
  chipseq_qc_metrics: [F("project_id", "Project ID", "number", "integer", { required: true, min: 1 }), F("assay_type", "Assay type", "select", "text", { choices: ["auto", "chipseq", "cutandrun", "cutandtag"], default: "auto" })],
  chipseq_report_generator: [F("title", "Report title", "text", "text", { default: "ChIP-seq Analysis Report" }), F("project", "Project"), F("genome", "Genome"), F("notes", "Notes")],
  chipseq_signal_plots: [F("signal_kind", "Signal type", "select", "text", { choices: ["bigwig", "bam"], default: "bigwig" }), F("plot_type", "Plot type", "select", "text", { choices: ["profile", "heatmap"], default: "profile" }), F("label", "Plot label")],
  chromatin_accessibility: [F("method", "Normalization method", "select", "text", { choices: ["cpm", "tfidf"], default: "cpm" })],
  chromatin_state: [F("state_column", "State column", "text", "text", { default: "state" })],
  dmr_analysis: [F("group_a", "Group A"), F("group_b", "Group B"), F("min_sites", "Minimum CpG sites", "number", "integer", { default: "3", min: 1 })],
  hic_analysis: [F("resolution", "Matrix resolution (bp)", "number", "integer", { min: 1 }), F("normalization", "Normalization", "select", "text", { choices: ["none", "observed_expected"], default: "none" })],
  methylation_qc: [F("beta_min", "Minimum beta value", "number", "float", { default: "0", min: 0, max: 1 }), F("beta_max", "Maximum beta value", "number", "float", { default: "1", min: 0, max: 1 })],
  tad_caller: [F("window", "Boundary window", "number", "integer", { default: "5", min: 1 }), F("min_strength", "Minimum boundary strength", "number", "float", { default: "0", min: 0 })],
  metabolomics_alignment: [F("peak_list", "Peak list (TSV path)", "text", "text", { required: true, placeholder: "/runs/metabolomics_peak_detect/<run>/out/peak_list.tsv" }), F("sample_manifest", "Sample manifest (JSON path)", "text", "text", { placeholder: "/runs/metabolomics_importer/<run>/out/sample_manifest.json" }), F("mz_tol_ppm", "m/z tolerance (ppm)", "number", "integer", { default: "10", min: 1, max: 50 }), F("rt_tol", "Retention-time tolerance (min)", "number", "float", { default: "0.3", min: 0.01, max: 5, step: 0.05 }), F("min_fraction", "Minimum sample fraction", "number", "float", { default: "0.5", min: 0.1, max: 1, step: 0.05 })],
  metabolomics_annotate: [F("feature_matrix", "Feature matrix (TSV path)", "text", "text", { required: true }), F("mz_ppm", "m/z tolerance (ppm)", "number", "integer", { default: "10", min: 1, max: 50 }), F("polarity", "Polarity", "select", "text", { choices: ["positive", "negative", "both"], default: "positive" }), ...[["hmdb", true], ["kegg", true], ["massbank", false], ["lipidmaps", false]].map(([db, checked]) => F(`db_${db}`, `Search ${db.toUpperCase()}`, "checkbox", "boolean", { default: checked, parameterArray: "databases", parameterValue: db }))],
  metabolomics_batch_correct: [F("normalized_matrix", "Normalized matrix (TSV path)", "text", "text", { required: true }), F("sample_manifest", "Sample manifest (JSON path)"), F("method", "Correction method", "select", "text", { choices: ["combat", "median_scaling", "loess"], default: "combat" }), F("batch_col", "Batch column", "text", "text", { default: "batch" })],
  metabolomics_batch_detect: [F("normalized_matrix", "Normalized matrix (TSV path)", "text", "text", { required: true }), F("sample_manifest", "Sample manifest (JSON path)"), F("batch_col", "Batch column", "text", "text", { default: "batch" })],
  metabolomics_biomarkers: [F("stats_results", "Statistical results (TSV path)", "text", "text", { required: true }), F("normalized_matrix", "Normalized matrix (TSV path)", "text", "text", { required: true }), F("sample_manifest", "Sample manifest (JSON path)"), F("n_top", "Top N biomarkers", "number", "integer", { default: "20", min: 5, max: 100 }), F("n_estimators", "Random-forest trees", "number", "integer", { default: "100", min: 10, max: 500 })],
  metabolomics_feature_matrix: [F("aligned_peaks", "Aligned peaks (TSV path)", "text", "text", { required: true }), F("sample_manifest", "Sample manifest (JSON path)"), F("agg_method", "Intensity aggregation", "select", "text", { choices: ["mean", "max", "sum"], default: "mean" })],
  metabolomics_importer: [F("file_format", "Input format", "select", "text", { choices: ["mzML", "csv", "tsv", "raw", "wiff", "d"], default: "mzML" }), F("raw_files", "File paths (one per line)", "textarea", "text", { required: true, placeholder: "/data/sample-1.mzML\n/data/sample-2.mzML" }), F("metadata", "Sample metadata (JSON)", "textarea", "json", { placeholder: '[{"sample_id":"S1","condition":"control","batch":"1"}]' })],
  metabolomics_imputation: [F("feature_matrix", "Feature matrix (TSV path)", "text", "text", { required: true }), F("method", "Imputation method", "select", "text", { choices: ["knn", "min_half", "qrilc", "median", "zero"], default: "knn" }), F("max_missing_pct", "Maximum missing percent", "number", "float", { default: "50", min: 0, max: 100 })],
  metabolomics_normalize: [F("imputed_matrix", "Imputed matrix (TSV path)", "text", "text", { required: true }), F("method", "Normalization method", "select", "text", { choices: ["tic", "pqn", "quantile"], default: "tic" }), F("log_transform", "Log transform", "select", "text", { choices: ["none", "log2", "log10"], default: "none" })],
  metabolomics_outlier_detect: [F("normalized_matrix", "Normalized matrix (TSV path)", "text", "text", { required: true }), F("sample_manifest", "Sample manifest (JSON path)"), F("method", "Detection method", "select", "text", { choices: ["pca_mahalanobis", "isolation_forest", "zscore"], default: "pca_mahalanobis" }), F("sd_threshold", "Standard-deviation threshold", "number", "float", { default: "3", min: 1, max: 10, step: 0.5 })],
  metabolomics_peak_detect: [F("mzml_files", "mzML files list (JSON path)", "text", "text", { required: true }), F("sample_manifest", "Sample manifest (JSON path)"), F("algorithm", "Peak-detection algorithm", "select", "text", { choices: ["centWave", "matchedFilter"], default: "centWave" }), F("ppm", "Mass tolerance (ppm)", "number", "integer", { default: "10", min: 1, max: 50 }), F("snthresh", "Signal-to-noise threshold", "number", "integer", { default: "6", min: 1, max: 50 }), F("n_features", "Expected feature count", "number", "integer", { default: "500", min: 50, max: 5000 })],
  metabolomics_report: [F("title", "Report title", "text", "text", { default: "Metabolomics Analysis Report" }), ...["qc_summary", "stats_results", "biomarkers", "annotated_features", "volcano_plot", "pca_plot", "outlier_plot", "sample_manifest"].map(id => F(id, id.replaceAll("_", " ").replace(/^./, x => x.toUpperCase()), "text", "text"))],
  metabolomics_sample_qc: [F("sample_manifest", "Sample manifest (JSON path)", "text", "text", { required: true }), F("mzml_files", "mzML files list (JSON path)"), F("missing_threshold", "Missing-value threshold (%)", "number", "float", { default: "20", min: 0, max: 100 })],
  metabolomics_stats: [F("normalized_matrix", "Normalized matrix (TSV path)", "text", "text", { required: true }), F("sample_manifest", "Sample manifest (JSON path)"), F("control", "Control condition", "text", "text", { default: "control", parameterPath: ["comparison", "control"] }), F("treated", "Treated condition", "text", "text", { default: "treated", parameterPath: ["comparison", "treated"] }), F("padj_cutoff", "Adjusted p-value cutoff", "number", "float", { default: "0.05", min: 0.001, max: 0.5, step: 0.01 }), F("log2fc_cutoff", "Absolute log2 fold-change cutoff", "number", "float", { default: "1.0", min: 0, step: 0.1 }), F("test_method", "Statistical test", "select", "text", { choices: ["welch_ttest", "mannwhitney"], default: "welch_ttest" })],
});

export const OMICS_HISTORIC_INPUT_OVERRIDES = Object.freeze({
  atac_accessibility_classifier: {
    model_ref: { placeholder: "atac_cnn@production" },
    hyperparams: { placeholder: '{"lr": 0.001, "epochs": 50}' },
  },
  ms_spectrum_classifier: {
    model_ref: { placeholder: "spectrum_mlp@production" },
    hyperparams: { placeholder: '{"lr": 0.001, "epochs": 50}' },
  },
});

const P = (title, icon, summary, formTitle, files, note = "") => ({ title, icon, summary, formTitle, files, note, sections: [formTitle, "Run status", "Live logs", "Results and artifacts"] });
const common = "Current Workbench file inputs and authenticated run lifecycle replace the legacy template transport.";
export const OMICS_HISTORIC_TEMPLATE_PAGES = Object.freeze({
  circrna_plotter: P("circRNA Plotter", "⭕", "Plot normalized circRNA abundance tables and review bar-plot and heatmap artifacts.", "Run configuration", OMICS_HISTORIC_TEMPLATE_FILES.circrna_plotter, "Legacy OmniObject selectors now use the current authorized file-input contract."),
  circrna_postprocess: P("circRNA Postprocess", "🧹", "Normalize and filter circTools output using explicit count and sample thresholds.", "Archive and filtering", OMICS_HISTORIC_TEMPLATE_FILES.circrna_postprocess),
  circtools_runner: P("circTools Runner", "🛠️", "Run circTools against STAR, annotation, repeat, and genome-reference inputs.", "References and flags", OMICS_HISTORIC_TEMPLATE_FILES.circtools_runner),
  atac_accessibility_classifier: P("ATAC Accessibility Classifier", "🧬", "Train a registered classifier or infer accessibility labels from binned Tn5 signal.", "Mode and signal", OMICS_HISTORIC_TEMPLATE_FILES.atac_accessibility_classifier),
  atac_differential: P("Differential Accessibility", "📊", "Compare accessibility across explicitly labeled experimental groups.", "Peak matrix and groups", OMICS_HISTORIC_TEMPLATE_FILES.atac_differential),
  atac_footprinting: P("ATAC Footprinting", "👣", "Estimate transcription-factor footprints from coverage and optional peak intervals.", "Coverage and peaks", OMICS_HISTORIC_TEMPLATE_FILES.atac_footprinting),
  atac_motif_enrichment: P("ATAC Motif Enrichment", "🧬", "Review motif enrichment scope and its peak and motif-score evidence requirements.", "Capability", OMICS_HISTORIC_TEMPLATE_FILES.atac_motif_enrichment, "Current backend descriptor is read-only; this page does not invent an execution route."),
  atac_peak_calling: P("ATAC-seq Peak Calling", "🏔️", "Call accessible regions from genomic-bin coverage evidence.", "Coverage input", OMICS_HISTORIC_TEMPLATE_FILES.atac_peak_calling),
  atac_report: P("ATAC-seq Report", "📄", "Review report-generation scope and its peak-statistics input requirement.", "Capability", OMICS_HISTORIC_TEMPLATE_FILES.atac_report, "Current backend descriptor is read-only; this page does not invent an execution route."),
  chipseq_differential_binding: P("ChIP-seq Differential Binding", "📈", "Compare binding evidence using uploaded peak and optional alignment inputs.", "Inputs and contrast", OMICS_HISTORIC_TEMPLATE_FILES.chipseq_differential_binding),
  chipseq_motif_analysis: P("ChIP-seq Motif Analysis", "🧬", "Scan peak-centered sequences for enriched k-mers using an explicit genome reference.", "Peakset and parameters", OMICS_HISTORIC_TEMPLATE_FILES.chipseq_motif_analysis),
  chipseq_peak_annotation: P("ChIP-seq Peak Annotation", "📍", "Assign genomic peaks to features using configured promoter and nearest-TSS rules.", "Peak annotation", OMICS_HISTORIC_TEMPLATE_FILES.chipseq_peak_annotation),
  chipseq_peakset_ops: P("ChIP-seq Peak Set Operations", "🧩", "Combine uploaded peak sets by union, intersection, or distance-based merging.", "Peak sets and operation", OMICS_HISTORIC_TEMPLATE_FILES.chipseq_peakset_ops),
  chipseq_qc_metrics: P("ChIP-seq QC Metrics", "✅", "Compute quality metrics from registered alignment and MultiQC evidence.", "Project and evidence", OMICS_HISTORIC_TEMPLATE_FILES.chipseq_qc_metrics),
  chipseq_report_generator: P("ChIP-seq Report Generator", "📄", "Assemble selected ChIP-seq artifacts into a traceable report.", "Report details and artifacts", OMICS_HISTORIC_TEMPLATE_FILES.chipseq_report_generator),
  chipseq_signal_plots: P("ChIP-seq Signal Plots", "📊", "Plot signal profiles or heatmaps over selected genomic regions.", "Regions, signals, and plot type", OMICS_HISTORIC_TEMPLATE_FILES.chipseq_signal_plots),
  chromatin_accessibility: P("Chromatin Accessibility QC", "✅", "Normalize a peak-by-sample non-negative count matrix for accessibility QC.", "Peak-count matrix", OMICS_HISTORIC_TEMPLATE_FILES.chromatin_accessibility),
  chromatin_state: P("Chromatin State Segmentation", "🎨", "Summarize genomic segments and their supplied chromatin states.", "Chromatin-state table", OMICS_HISTORIC_TEMPLATE_FILES.chromatin_state),
  dmr_analysis: P("DMR Detection Analysis", "🧬", "Detect differentially methylated regions from a supplied methylation matrix.", "Methylation matrix and contrast", OMICS_HISTORIC_TEMPLATE_FILES.dmr_analysis),
  epigenomics_report: P("Epigenomics Report", "📄", "Review reporting scope and the required DMR summary evidence.", "Capability", OMICS_HISTORIC_TEMPLATE_FILES.epigenomics_report, "Current backend descriptor is read-only; this page does not invent an execution route."),
  hic_analysis: P("Hi-C Contact Map Analysis", "🗺️", "Inspect a non-negative square contact matrix and compute contact-map summaries.", "Contact matrix", OMICS_HISTORIC_TEMPLATE_FILES.hic_analysis),
  methylation_qc: P("Methylation QC", "🧪", "Evaluate beta-value ranges, missingness, and sample-level methylation quality.", "Methylation table", OMICS_HISTORIC_TEMPLATE_FILES.methylation_qc),
  nanopore_methylation_caller: P("Nanopore Methylation Caller", "🧬", "Train a registered classifier or infer methylation states from windowed current signal.", "Mode and signal", OMICS_HISTORIC_TEMPLATE_FILES.nanopore_methylation_caller),
  tad_caller: P("TAD Caller", "🗺️", "Call topologically associating domain boundaries from a contact matrix.", "Hi-C matrix", OMICS_HISTORIC_TEMPLATE_FILES.tad_caller),
  metabolomics_alignment: P("Peak Alignment", "📐", "Align retention times and group detected peaks across metabolomics samples.", "Inputs and alignment parameters", OMICS_HISTORIC_TEMPLATE_FILES.metabolomics_alignment),
  metabolomics_annotate: P("Metabolite Annotation", "🏷️", "Annotate feature-matrix entries against explicitly selected reference databases.", "Feature matrix and databases", OMICS_HISTORIC_TEMPLATE_FILES.metabolomics_annotate),
  metabolomics_batch_correct: P("Batch Effect Correction", "⚖️", "Correct a normalized matrix using the declared batch column and method.", "Matrix and correction options", OMICS_HISTORIC_TEMPLATE_FILES.metabolomics_batch_correct),
  metabolomics_batch_detect: P("Batch Effect Detection", "🔎", "Detect technical batch structure in a normalized feature matrix.", "Matrix and batch column", OMICS_HISTORIC_TEMPLATE_FILES.metabolomics_batch_detect),
  metabolomics_biomarkers: P("Metabolomics Biomarkers", "🎯", "Rank candidate features using supplied statistical and normalized-matrix evidence.", "Input evidence and model settings", OMICS_HISTORIC_TEMPLATE_FILES.metabolomics_biomarkers),
  metabolomics_feature_matrix: P("Feature Matrix Builder", "🧮", "Aggregate aligned peaks into a sample-by-feature matrix.", "Aligned peaks and aggregation", OMICS_HISTORIC_TEMPLATE_FILES.metabolomics_feature_matrix),
  metabolomics_importer: P("Metabolomics Data Importer", "📥", "Describe source files, formats, and sample metadata for metabolomics import.", "Files and sample metadata", OMICS_HISTORIC_TEMPLATE_FILES.metabolomics_importer),
  metabolomics_imputation: P("Missing Value Imputation", "🧩", "Impute missing feature measurements using a selected method and threshold.", "Feature matrix and method", OMICS_HISTORIC_TEMPLATE_FILES.metabolomics_imputation),
  metabolomics_normalize: P("Metabolomics Normalization", "⚖️", "Normalize an imputed matrix and optionally apply a log transform.", "Matrix and normalization", OMICS_HISTORIC_TEMPLATE_FILES.metabolomics_normalize),
  metabolomics_outlier_detect: P("Metabolomics Outlier Detection", "🔎", "Flag anomalous samples using a selected multivariate or univariate method.", "Matrix and detection settings", OMICS_HISTORIC_TEMPLATE_FILES.metabolomics_outlier_detect),
  metabolomics_peak_detect: P("Metabolomics Peak Detection", "🏔️", "Detect chromatographic peaks from supplied mzML file-list and sample metadata.", "Files and peak settings", OMICS_HISTORIC_TEMPLATE_FILES.metabolomics_peak_detect),
  metabolomics_report: P("Metabolomics Report", "📄", "Assemble supplied QC, statistical, biomarker, annotation, plot, and sample evidence.", "Evidence and report title", OMICS_HISTORIC_TEMPLATE_FILES.metabolomics_report),
  metabolomics_sample_qc: P("Metabolomics Sample QC", "✅", "Evaluate sample manifest and raw-file completeness using the missingness threshold.", "Manifest and QC threshold", OMICS_HISTORIC_TEMPLATE_FILES.metabolomics_sample_qc),
  metabolomics_stats: P("Metabolomics Statistics", "📊", "Compare control and treated groups with an explicit test and effect-size threshold.", "Matrix, comparison, and cutoffs", OMICS_HISTORIC_TEMPLATE_FILES.metabolomics_stats),
  ms_spectrum_classifier: P("MS/MS Spectrum Classifier", "🧪", "Train a registered classifier or infer spectrum classes from tandem-MS evidence.", "Mode and spectra", OMICS_HISTORIC_TEMPLATE_FILES.ms_spectrum_classifier),
});

export const OMICS_HISTORIC_TEMPLATE_SLUGS = Object.freeze(Object.keys(OMICS_HISTORIC_TEMPLATE_PAGES));
export const OMICS_HISTORIC_TEMPLATE_COUNT = Object.values(OMICS_HISTORIC_TEMPLATE_FILES).reduce((sum, files) => sum + files.length, 0);

function OmicsTemplateRenderer({ descriptor }) {
  const page = OMICS_HISTORIC_TEMPLATE_PAGES[descriptor.plugin.slug];
  const readOnly = descriptor.capabilities?.read_only === true;
  return <section className="omics-template-page" aria-label={`${page.title} React workspace`}>
    <Panel>
      <PanelHeader title={`${page.icon} ${page.formTitle}`} />
      <PanelBody>
        <p className="omics-template-summary">{page.summary}</p>
        <div className="omics-template-sections" aria-label="Converted page sections">
          {page.sections.map((section, index) => <span key={section}><i>{index + 1}</i>{section}</span>)}
        </div>
        <p className="omics-template-evidence">Converted from Workbench template(s): {page.files.join(", ")}. {common}</p>
        {(page.note || readOnly) ? <p className="omics-template-note">{page.note || "The backend descriptor is read-only; the React page will not submit a run."}</p> : null}
      </PanelBody>
    </Panel>
    {readOnly
      ? <InformationalRenderer descriptor={{ ...descriptor, content: { summary: page.summary, sections: [{ heading: "Current backend status", paragraphs: [page.note || "Read-only capability page; no execution endpoint is declared."] }] } }} />
      : <AsyncAnalysisRenderer
        descriptor={descriptor}
        parameterFields={OMICS_HISTORIC_PARAMETER_FIELDS[descriptor.plugin.slug] || []}
        inputOverrides={OMICS_HISTORIC_INPUT_OVERRIDES[descriptor.plugin.slug] || {}}
      />}
  </section>;
}

export const OMICS_TEMPLATE_REACT_RENDERERS = Object.freeze(Object.fromEntries(
  OMICS_HISTORIC_TEMPLATE_SLUGS.map(slug => [slug, OmicsTemplateRenderer]),
));
