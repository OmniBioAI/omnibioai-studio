import React from "react";
import { Panel, PanelBody, PanelHeader } from "../UI";
import AsyncAnalysisRenderer from "./AsyncAnalysisRenderer";
import InformationalRenderer from "./InformationalRenderer";
import QueryRenderer from "./QueryRenderer";
import "./AnalysisPluginRenderers.css";

// These are the Analysis-category plugins in Workbench. Their backend
// descriptors remain authoritative for fields, endpoints, outputs and whether
// execution is enabled; this registry only supplies a focused React workspace.
export const ANALYSIS_PLUGIN_SLUGS = Object.freeze([
  "clonal_evolution_phylogenetics", "clonal_prevalence_plot", "counts_matrix_qc",
  "ctdna_liquid_biopsy", "cytof_analysis", "deseq2_analysis", "dia_analysis",
  "differential_abundance", "enrichment_dot_plot", "exome_analysis", "forest_plot",
  "group_comparison_plot", "gsea_enrichment", "heatmap_generator", "hla_typing",
  "hrd_score", "immune_deconvolution", "irfinder_analysis", "isoform_analysis",
  "kaplan_meier_plot", "karyotype_cnv_plot", "leafcutter_analysis", "longread_report",
  "mag_quality", "manhattan_qq_plot", "ml_eval_plots", "msa_conservation_viewer",
  "msi_detector", "mutation_lollipop_plot", "mutation_waterfall_plot",
  "mutational_signatures", "neoantigen_immunogenicity", "neoantigen_predictor",
  "omics_data_qc_harmonizer", "omics_qc_metrics_extractor", "omics_qc_report_generator",
  "oncoprint_plot", "pca_analysis", "ppi_network_plot", "rmats_analysis",
  "rnaseq_analysis", "rnaseq_report", "sashimi_plot", "sequence_logo_plot",
  "splice_event_viewer", "splicing_report", "suppa2_analysis", "sv_annotation",
  "tcr_bcr_repertoire", "tmb_calculator", "tumor_purity", "vaccine_epitope_design",
  "venn_upset_plot", "volcano_plot",
]);

const DISPLAY = Object.freeze({
  clonal_evolution_phylogenetics: ["🌳", "Tumor evolution"], clonal_prevalence_plot: ["📊", "Tumor evolution"],
  counts_matrix_qc: ["🧮", "Quality control"], ctdna_liquid_biopsy: ["🩸", "Cancer genomics"],
  cytof_analysis: ["🔬", "Immune profiling"], deseq2_analysis: ["🧬", "RNA-seq"],
  dia_analysis: ["🧪", "Proteomics"], differential_abundance: ["📈", "Differential analysis"],
  enrichment_dot_plot: ["🔵", "Pathway analysis"], exome_analysis: ["🧬", "Variant analysis"],
  forest_plot: ["🌲", "Scientific plotting"], group_comparison_plot: ["📊", "Scientific plotting"],
  gsea_enrichment: ["🧭", "Pathway analysis"], heatmap_generator: ["🌡️", "Scientific plotting"],
  hla_typing: ["🧬", "Cancer genomics"], hrd_score: ["🧬", "Cancer genomics"],
  immune_deconvolution: ["🛡️", "Immune profiling"], irfinder_analysis: ["🧬", "RNA splicing"],
  isoform_analysis: ["🧬", "RNA splicing"], kaplan_meier_plot: ["📉", "Survival analysis"],
  karyotype_cnv_plot: ["🧬", "Variant analysis"], leafcutter_analysis: ["🍃", "RNA splicing"],
  longread_report: ["🧵", "Sequencing reports"], mag_quality: ["🦠", "Quality control"],
  manhattan_qq_plot: ["📍", "Scientific plotting"], ml_eval_plots: ["📈", "Model evaluation"],
  msa_conservation_viewer: ["🧬", "Sequence analysis"], msi_detector: ["🧬", "Cancer genomics"],
  mutation_lollipop_plot: ["🍭", "Variant analysis"], mutation_waterfall_plot: ["🌊", "Variant analysis"],
  mutational_signatures: ["🧬", "Variant analysis"], neoantigen_immunogenicity: ["🛡️", "Immuno-oncology"],
  neoantigen_predictor: ["🎯", "Immuno-oncology"], omics_data_qc_harmonizer: ["⚖️", "Quality control"],
  omics_qc_metrics_extractor: ["✅", "Quality control"], omics_qc_report_generator: ["📋", "Quality control"],
  oncoprint_plot: ["🧬", "Variant analysis"], pca_analysis: ["🧭", "Multivariate analysis"],
  ppi_network_plot: ["🕸️", "Network analysis"], rmats_analysis: ["🧬", "RNA splicing"],
  rnaseq_analysis: ["🧬", "RNA-seq"], rnaseq_report: ["📋", "Sequencing reports"],
  sashimi_plot: ["🍣", "RNA splicing"], sequence_logo_plot: ["🔤", "Sequence analysis"],
  splice_event_viewer: ["👁️", "RNA splicing"], splicing_report: ["📋", "RNA splicing"],
  suppa2_analysis: ["🧬", "RNA splicing"], sv_annotation: ["🧬", "Variant analysis"],
  tcr_bcr_repertoire: ["🛡️", "Immune profiling"], tmb_calculator: ["🧮", "Cancer genomics"],
  tumor_purity: ["🧫", "Cancer genomics"], vaccine_epitope_design: ["💉", "Immuno-oncology"],
  venn_upset_plot: ["⭕", "Scientific plotting"], volcano_plot: ["🌋", "Scientific plotting"],
});

function pluginRenderer(descriptor) {
  if (descriptor.renderer === "query") return QueryRenderer;
  if (descriptor.renderer === "informational") return InformationalRenderer;
  return AsyncAnalysisRenderer;
}

const LEGACY_SCAFFOLDS = new Set([
  "clonal_prevalence_plot", "differential_abundance", "heatmap_generator", "longread_report",
  "msi_detector", "neoantigen_predictor", "pca_analysis", "rnaseq_report", "sashimi_plot",
  "splice_event_viewer", "splicing_report", "sv_annotation", "tmb_calculator", "tumor_purity",
  "volcano_plot",
]);

const LEGACY_PAGE_SUMMARIES = Object.freeze({
  clonal_evolution_phylogenetics: "Upload PyClone-VI-compatible cluster data to inspect clonal prevalence and tumor evolution. Research use only; the historical page marks this computation as a placeholder.",
  clonal_prevalence_plot: "Plot PyClone-VI cluster mean cellular prevalence by sample. This is a prevalence chart, not a phylogeny.",
  ctdna_liquid_biopsy: "Analyze variant allele-frequency burden from variants.vcf. Research use only; not clinically validated.",
  cytof_analysis: "Cluster cells from cells.csv using a PhenoGraph-style nearest-neighbor analysis. Research use only; not clinically validated.",
  differential_abundance: "Registered analysis scaffold for comparing abundance between groups.",
  enrichment_dot_plot: "Create a functional-enrichment dot plot from one-row-per-term pathway results.",
  forest_plot: "Plot study or subgroup effect estimates with confidence intervals and a line of no effect.",
  group_comparison_plot: "Compare numeric values across categorical groups with box, violin, or strip plots and statistical tests.",
  hla_typing: "Type HLA from one FASTQ.GZ input in DNA or RNA mode. Research use only; not clinically validated.",
  hrd_score: "Estimate genomic-scar HRD from LOH, TAI, and LST segments. Research use only; not clinically validated.",
  immune_deconvolution: "Estimate immune-cell composition from an expression matrix and signature matrix. Research use only; not clinically validated.",
  kaplan_meier_plot: "Plot Kaplan–Meier survival curves with censoring marks and confidence bands from tidy time-to-event data.",
  karyotype_cnv_plot: "Render copy-number segments as chromosome-scale gain, loss, and neutral tracks.",
  manhattan_qq_plot: "Generate genome-wide Manhattan and QQ plots and report the genomic inflation factor.",
  ml_eval_plots: "Generate ROC, precision–recall, and confusion-matrix views from model predictions.",
  msa_conservation_viewer: "Inspect an aligned multi-FASTA file with alignment blocks and per-column conservation scores.",
  mutation_lollipop_plot: "Visualize protein-position variant counts from HGVS protein-change annotations.",
  mutation_waterfall_plot: "Rank samples by tumor mutational burden in a cohort waterfall plot.",
  neoantigen_immunogenicity: "Score MHC-I presentation from peptide sequences. Research use only; not clinically validated.",
  oncoprint_plot: "Show a sample-by-gene mutation matrix, colored by consequence type.",
  ppi_network_plot: "Build an interaction network from a source/target edge list with optional edge weights.",
  sequence_logo_plot: "Create an information-content sequence logo from aligned sequence data.",
  tcr_bcr_repertoire: "Assign clonotypes and summarize repertoire diversity from AIRR/Change-O TSV data. Research use only; not clinically validated.",
  vaccine_epitope_design: "Rank candidate MHC epitopes from antigen FASTA. Research use only; not clinically validated.",
  venn_upset_plot: "Compare two or more sets with Venn (2–3 sets) and UpSet visualizations.",
});

const LEGACY_META = Object.freeze({
  exome_analysis: ["Input: annotated VCF", "Engine: RunStore"],
  omics_qc_metrics_extractor: ["QC Harmonization", "Anomaly Detection", "PCA QC"],
  omics_qc_report_generator: ["QC report", "RunStore"],
  rnaseq_analysis: ["Mode: OmniObject-first", "Input: outputs.normalized.json", "Step: 1/2"],
});

function InputContract({ inputs, outputs }) {
  return <div className="analysis-legacy-contract">
    <div><h4>Inputs</h4>{inputs.length ? <ul>{inputs.map(input => <li key={input.id}><code>{input.id}</code><span>{input.label}</span></li>)}</ul> : <p>No input fields are declared.</p>}</div>
    <div><h4>Outputs</h4>{outputs.length ? <ul>{outputs.map(output => <li key={output.id || output.name}><code>{output.id || output.name}</code><span>{output.label || output.description || "Workbench output"}</span></li>)}</ul> : <p>Outputs are provided by the plugin run contract.</p>}</div>
  </div>;
}

function AnalysisWorkspace({ descriptor, slug }) {
  const plugin = descriptor.plugin || {};
  const [icon, specialty] = DISPLAY[slug] || ["🧬", "Analysis"];
  const Renderer = pluginRenderer(descriptor);
  const inputs = descriptor.inputs || [];
  const outputs = descriptor.outputs || [];
  const summary = LEGACY_PAGE_SUMMARIES[slug] || plugin.description || "Use the declared Workbench contract to configure this analysis and review its results.";
  const metadata = LEGACY_META[slug] || [specialty, `${inputs.length} input${inputs.length === 1 ? "" : "s"}`, `${outputs.length} output${outputs.length === 1 ? "" : "s"}`];
  const scaffold = LEGACY_SCAFFOLDS.has(slug) || !inputs.length;

  return <section className={`analysis-legacy-page${scaffold ? " is-scaffold" : ""}`} data-plugin-slug={slug}>
    <div className="analysis-legacy-meta">{metadata.map(item => <span className="analysis-legacy-pill" key={item}>{item}</span>)}</div>
    <Panel>
      <PanelHeader title={scaffold ? "Registered plugin" : (slug === "exome_analysis" ? "Run Exome Analysis" : "Analysis setup")} />
      <PanelBody>
        <p className="analysis-legacy-summary">{summary}</p>
        {scaffold && <p className="analysis-legacy-registration">This React page is connected to the registered <code>{slug}</code> Workbench plugin.</p>}
        {(scaffold || slug === "exome_analysis") && <InputContract inputs={inputs} outputs={outputs} />}
      </PanelBody>
    </Panel>
    {LEGACY_PAGE_SUMMARIES[slug] && <Panel><PanelHeader title="Analysis notes"/><PanelBody><p className="analysis-legacy-summary">{LEGACY_PAGE_SUMMARIES[slug]}</p></PanelBody></Panel>}
    <div className="analysis-legacy-run" aria-label={`${plugin.name || slug} controls`}>
      <Renderer descriptor={descriptor} />
    </div>
  </section>;
}

export const ANALYSIS_PLUGIN_RENDERERS = Object.freeze(Object.fromEntries(
  ANALYSIS_PLUGIN_SLUGS.map(slug => [slug, function AnalysisPluginRenderer({ descriptor }) {
    return <AnalysisWorkspace descriptor={descriptor} slug={slug} />;
  }]),
));

