import React from "react";
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

function AnalysisWorkspace({ descriptor, slug }) {
  const plugin = descriptor.plugin || {};
  const [icon, specialty] = DISPLAY[slug] || ["🧬", "Analysis"];
  const Renderer = pluginRenderer(descriptor);
  const inputs = descriptor.inputs || [];
  const outputs = descriptor.outputs || [];
  const executionEnabled = descriptor.renderer !== "informational";
  const accent = specialty === "Cancer genomics" || specialty === "Immuno-oncology" ? "#c64f73"
    : specialty === "RNA-seq" || specialty === "RNA splicing" ? "#7b61c9"
      : specialty === "Quality control" ? "#26846f"
        : specialty === "Scientific plotting" ? "#3579bd" : "#b47a28";

  return <section className="analysis-workspace" data-plugin-slug={slug} style={{ "--analysis-accent": accent }}>
    <header className="analysis-workspace__hero">
      <div className="analysis-workspace__icon" aria-hidden="true">{icon}</div>
      <div className="analysis-workspace__heading">
        <p className="analysis-workspace__eyebrow">{specialty} <span>·</span> Workbench Analysis</p>
        <h2>{plugin.name || slug.replaceAll("_", " ")}</h2>
        <p>{plugin.description || "Configure a reproducible analysis and review its outputs."}</p>
      </div>
      <span className={`analysis-workspace__mode ${executionEnabled ? "is-active" : "is-readonly"}`}>
        {executionEnabled ? "Workbench connected" : "Read-only workspace"}
      </span>
    </header>

    <nav className="analysis-workspace__steps" aria-label="Analysis workflow">
      {["Inputs", "Configure", executionEnabled ? "Run" : "Review", "Results"].map((label, index) => (
        <div className="analysis-workspace__step" key={label}>
          <span>{String(index + 1).padStart(2, "0")}</span><strong>{label}</strong>
        </div>
      ))}
    </nav>

    <section className="analysis-workspace__context" aria-label="Analysis context">
      <div><span className="analysis-workspace__metric">{inputs.length}</span><span>declared inputs</span></div>
      <div><span className="analysis-workspace__metric">{outputs.length}</span><span>expected outputs</span></div>
      <p>Input requirements, run state, logs and artifacts come from the Workbench plugin contract.</p>
    </section>

    <section className="analysis-workspace__body" aria-label="Plugin workspace">
      <Renderer descriptor={descriptor} />
    </section>
  </section>;
}

export const ANALYSIS_PLUGIN_RENDERERS = Object.freeze(Object.fromEntries(
  ANALYSIS_PLUGIN_SLUGS.map(slug => [slug, function AnalysisPluginRenderer({ descriptor }) {
    return <AnalysisWorkspace descriptor={descriptor} slug={slug} />;
  }]),
));

