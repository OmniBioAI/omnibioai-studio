import React from "react";
import AsyncAnalysisRenderer from "./AsyncAnalysisRenderer";
import InformationalRenderer from "./InformationalRenderer";
import QueryRenderer from "./QueryRenderer";
import { Panel, PanelBody, PanelHeader } from "../UI";
import "./OmicsCategoryReactRenderers.css";

const WORKSPACES = Object.freeze({
  alpha_diversity: ["Microbiome", "🦠", "Alpha Diversity", "Calculate Shannon, Simpson, Chao1, and observed-feature diversity from an OTU/ASV count table.", ["Select abundance table", "Validate samples and features", "Calculate diversity", "Review metrics and plots"], ["Per-sample alpha-diversity metrics", "Diversity visualizations"]],
  amr_gene_classifier: ["Microbiome", "🛡️", "AMR Gene Classifier", "Classify uploaded microbial protein sequences into antimicrobial-resistance classes or a non-AMR class.", ["Provide protein sequences", "Validate FASTA input", "Run sequence classifier", "Review class predictions"], ["Per-sequence resistance classes", "Classifier summary"]],
  beta_diversity: ["Microbiome", "📉", "Beta Diversity PCoA", "Compute Bray–Curtis distances from an OTU/ASV table and summarize sample dissimilarity with PCoA.", ["Select abundance table", "Calculate Bray–Curtis distances", "Compute PCoA", "Review distances and ordination"], ["Distance matrix", "PCoA coordinates and plot"]],
  microbiome_report: ["Microbiome", "📄", "Microbiome Report", "Summarize an OTU/ASV table with alpha diversity, Bray–Curtis beta diversity, and the most abundant taxa.", ["Provide abundance evidence", "Validate table", "Assemble report", "Review summary and figures"], ["Integrated microbiome report", "Diversity and abundance summaries"]],
  microbiome_taxonomic_classifier: ["Microbiome", "🏷️", "Microbiome Taxonomic Classifier", "Classify sequence reads into taxonomic labels with the registered sequence-classification workflow.", ["Provide sequence reads", "Validate sequence input", "Run taxonomic classifier", "Review read assignments"], ["Per-read taxonomy", "Classification summary"]],
  taxonomic_abundance: ["Microbiome", "🧬", "Taxonomic Abundance", "Aggregate OTU/ASV counts by a selected taxonomic level and calculate relative abundance.", ["Provide counts and taxonomy", "Choose taxonomic level", "Aggregate abundance", "Review composition"], ["Relative-abundance table", "Stacked composition plot"]],
  enzyme_ec_classifier: ["Proteomics", "⚗️", "Enzyme EC Classifier", "Predict top-level Enzyme Commission classes from protein sequences using the registered ESM2-based classifier.", ["Provide protein sequences", "Validate FASTA input", "Run EC classifier", "Review predicted classes"], ["EC-class predictions", "Prediction summary"]],
  protein_interaction: ["Proteomics", "🕸️", "Protein Interaction Network", "Analyze supplied protein-interaction evidence and produce a network-oriented summary.", ["Provide interaction evidence", "Validate node and edge fields", "Build interaction network", "Review network artifacts"], ["Interaction network", "Network summary"]],
  protein_quantification: ["Proteomics", "🧪", "Protein Quantification", "Roll peptide-level intensity measurements up to protein-level abundance estimates.", ["Provide peptide table", "Choose aggregation settings", "Quantify proteins", "Review abundance results"], ["Protein abundance table", "Quantification summary"]],
  proteomics: ["Proteomics", "⚗️", "Proteomics Workflow", "Submit proteomics evidence through the current Workbench run contract and review its declared progress, logs, and artifacts.", ["Provide declared analysis inputs", "Configure available parameters", "Submit through Workbench", "Review run results"], ["Workflow results", "Run details and downloadable artifacts"]],
  proteomics_qc: ["Proteomics", "✅", "Proteomics QC", "Assess peptide/protein intensity distributions, missing values, and median coefficient of variation.", ["Provide intensity table", "Validate sample columns", "Calculate QC metrics", "Review diagnostics"], ["QC metrics", "Per-sample intensity and missingness plots"]],
  proteomics_report: ["Proteomics", "📄", "Proteomics Report", "Summarize intensity distributions and top proteins, with an optional PTM-site summary.", ["Provide protein-group evidence", "Choose report options", "Generate report", "Review tables and figures"], ["Proteomics report", "Protein and PTM summaries"]],
  ptm_analysis: ["Proteomics", "🔬", "PTM Analysis", "Summarize post-translational modification site intensity, variability, and modification types.", ["Provide PTM peptide table", "Set analysis options", "Summarize modification sites", "Review PTM evidence"], ["PTM-site summary", "Modification-level metrics"]],
  ptm_site_predictor: ["Proteomics", "🧬", "PTM Site Predictor", "Predict post-translational modification types from protein sequence windows around candidate residues.", ["Provide protein sequences and sites", "Validate residue context", "Run PTM prediction", "Review site predictions"], ["Per-site PTM predictions", "Classifier summary"]],
  adv_single_cell: ["Single-cell", "🔬", "Advanced Single-Cell Analysis", "Integrate and analyze single-cell datasets through the existing Workbench analysis workflow.", ["Select single-cell datasets", "Configure integration", "Run analysis", "Review integrated results"], ["Integrated cell data", "Analysis summaries and plots"]],
  cell_comm_visualization: ["Single-cell", "🔗", "Cell-Cell Communication", "Visualize ligand–receptor communication pathways from single-cell transcriptomics evidence.", ["Provide cell and interaction evidence", "Choose communication view", "Build pathway visualization", "Review or download results"], ["Communication network", "Pathway visualization artifacts"]],
  citeseq_celltype_classifier: ["Single-cell", "🏷️", "CITE-seq Cell-Type Classifier", "Classify multimodal CITE-seq cell measurements using the declared input and model contract.", ["Provide CITE-seq measurements", "Validate modality inputs", "Run cell classifier", "Review cell labels"], ["Per-cell labels", "Classification metrics"]],
  clustering: ["Single-cell", "🧩", "Cell Clustering", "Cluster cell-level expression data and inspect the registered run and result artifacts.", ["Select cell-expression data", "Configure clustering", "Run clustering", "Review clusters"], ["Cluster assignments", "Cluster analysis artifacts"]],
  marker_identification: ["Single-cell", "🎯", "Marker Identification", "Find marker genes associated with supplied cell clusters and review downloadable results.", ["Select expression data and labels", "Configure marker test", "Identify markers", "Review ranked genes"], ["Ranked marker table", "Marker-analysis artifacts"]],
  rna_velocity_analysis: ["Single-cell", "🛤️", "RNA Velocity Analysis", "Analyze spliced and unspliced RNA evidence to estimate transcriptional state transitions.", ["Provide spliced/unspliced evidence", "Validate feature alignment", "Estimate velocity", "Review transition evidence"], ["Velocity estimates", "Trajectory visualization"]],
  scanpy_clustering: ["Single-cell", "🔬", "Scanpy Clustering", "Run the registered Scanpy clustering workflow on AnnData input and inspect its run artifacts.", ["Provide AnnData", "Configure neighborhood and clustering", "Run Scanpy", "Review cell clusters"], ["Clustered AnnData", "Embedding and cluster outputs"]],
  scanpy_import: ["Single-cell", "📥", "Scanpy Import", "Import supported single-cell source data into an AnnData workflow while preserving sample metadata.", ["Provide source dataset", "Select import format", "Create AnnData", "Review imported object"], ["AnnData object", "Import summary"]],
  scanpy_markers: ["Single-cell", "🎯", "Scanpy Markers", "Rank marker genes across Scanpy cell clusters and review the resulting table and artifacts.", ["Provide clustered AnnData", "Select group comparison", "Rank marker genes", "Review results"], ["Marker-gene table", "Scanpy marker artifacts"]],
  scanpy_qc_filter: ["Single-cell", "🧹", "Scanpy QC Filter", "Filter single-cell AnnData using the declared quality-control thresholds and review retained data.", ["Provide AnnData", "Set QC thresholds", "Filter cells and genes", "Review QC results"], ["Filtered AnnData", "QC metrics"]],
  scanpy_qc_metrics: ["Single-cell", "✅", "Scanpy QC Metrics", "Calculate cell- and gene-level quality metrics for single-cell AnnData.", ["Provide AnnData", "Validate count matrix", "Calculate QC metrics", "Review distributions"], ["QC metrics", "Diagnostic plots"]],
  single_cell_analysis: ["Single-cell", "🧬", "Single-Cell Analysis", "Run the currently declared single-cell analysis operation and review its Workbench run status, logs, and output artifacts.", ["Provide declared analysis inputs", "Configure available parameters", "Submit through Workbench", "Review run results"], ["Run manifest", "Analysis outputs and files"]],
  single_cell_annotation: ["Single-cell", "🏷️", "Single-Cell Annotation", "Assign cell-type annotations from single-cell evidence and inspect the run lifecycle and artifacts.", ["Provide single-cell data", "Choose annotation settings", "Run annotation", "Review cell labels"], ["Annotated cell data", "Run logs and artifacts"]],
  single_cell_loom_viewer: ["Single-cell", "👁️", "Single-Cell LOOM Viewer", "Run the currently declared LOOM-viewer operation with its Workbench input contract and inspect the returned run evidence.", ["Provide declared dataset input", "Configure available options", "Submit through Workbench", "Review run results"], ["Dataset summary", "Gene expression views", "Annotation export"]],
  qc_plots: ["Spatial", "✅", "Spatial QC Plots", "Generate Visium quality plots and metrics from Space Ranger output evidence.", ["Provide Space Ranger output", "Validate spot metrics", "Generate QC plots", "Review summary and images"], ["QC summary", "UMI, gene, and mitochondrial plots"]],
  spatial_analysis: ["Spatial", "🗺️", "Spatial Analysis", "Filter and normalize Visium data, identify variable genes, and compute spatial analysis embeddings.", ["Provide Visium bundle and thresholds", "Filter and normalize spots", "Compute embedding", "Review AnnData and plot"], ["Processed AnnData", "UMAP visualization"]],
  spatial_clustering: ["Spatial", "🧩", "Spatial Clustering", "Cluster Visium AnnData with the registered Leiden workflow and retain tissue coordinates.", ["Provide spatial AnnData", "Configure Leiden clustering", "Run clustering", "Review spatial clusters"], ["Clustered AnnData", "Cluster visualization"]],
  spatial_domain_classifier: ["Spatial", "🧠", "Spatial Domain Classifier", "Classify spatial spots into tissue domains using physical-coordinate graph evidence.", ["Provide spatial measurements and coordinates", "Validate graph inputs", "Run domain classifier", "Review domain labels"], ["Per-spot domain labels", "Classifier summary"]],
  spatial_marker_identification: ["Spatial", "📍", "Spatial Marker Identification", "Rank genes that distinguish clusters in clustered spatial AnnData.", ["Provide clustered AnnData", "Set marker options", "Rank cluster markers", "Review marker table"], ["Spatial marker table", "Marker summary"]],
  spatial_report_generation: ["Spatial", "📄", "Spatial Report Generation", "Assemble available Visium QC, threshold, embedding, cluster, and marker evidence into a final report.", ["Select upstream artifacts", "Validate report evidence", "Generate report", "Review report and outputs"], ["Spatial analysis report", "Optional PDF and supporting artifacts"]],
  threshold_recommendation: ["Spatial", "📏", "Threshold Recommendation", "Validate and recommend Visium QC thresholds using quality summaries and supplied workflow evidence.", ["Provide QC summary", "Review recommendations", "Validate thresholds", "Save threshold artifact"], ["Threshold configuration", "Validation summary"]],
});

export const OMICS_CATEGORY_PLUGIN_SLUGS = Object.freeze(Object.keys(WORKSPACES));

export function createOmicsCategoryRenderer(slug) {
  const profile = WORKSPACES[slug];
  if (!profile) throw new Error(`Missing React workspace profile for ${slug}`);
  return createOmicsCategoryPage(profile);
}

function createOmicsCategoryPage([category, icon, title, summary, stages, outputs]) {
  return function OmicsCategoryRenderer({ descriptor }) {
    const slug = descriptor.plugin?.slug || "unknown-plugin";
    const pageTitle = descriptor.plugin?.name || title;
    const Renderer = descriptor.renderer === "query"
      ? QueryRenderer
      : descriptor.renderer === "informational" ? InformationalRenderer : AsyncAnalysisRenderer;
    const inputs = descriptor.inputs || [];
    const declaredOutputs = descriptor.outputs || [];
    const operations = Object.entries(descriptor.endpoints || {}).filter(([key]) => !["download"].includes(key));
    return <main
      className={`omics-category-workspace omics-category-workspace--${slug}`}
      data-plugin={slug}
      data-omics-category={category.toLowerCase().replaceAll(" ", "-")}
    >
      <Panel>
        <PanelHeader title={`${icon} ${pageTitle}`}><span className="omics-category-workspace__badge">{category} · React workspace</span></PanelHeader>
        <PanelBody>
          <p className="omics-category-workspace__summary">{summary}</p>
          <ol className="omics-category-workspace__steps" aria-label={`${title} workflow`}>
            {stages.map((stage, index) => <li key={stage}><span>{index + 1}</span>{stage}</li>)}
          </ol>
          <div className="omics-category-workspace__contracts">
            <section aria-label="Declared Workbench inputs">
              <h3>Workbench inputs</h3>
              {inputs.length ? <ul>{inputs.map(input => <li key={input.id}>
                <span><strong>{input.label || input.id}</strong><small className="omics-category-workspace__io-detail">{input.id}{input.format ? ` · ${input.format}` : ""}{input.description ? ` · ${input.description}` : ""}</small></span>
                <small>{input.required ? "Required" : "Optional"}</small>
              </li>)}</ul> : <p>This backend page declares no browser input fields.</p>}
            </section>
            <section aria-label="Expected outputs">
              <h3>Expected outputs</h3>
              <ul>{(declaredOutputs.length ? declaredOutputs : outputs.map(label => ({ id: label, label }))).map(output => <li key={output.id || output.label}>
                <span><strong>{output.label || output.id}</strong>{output.id && output.label !== output.id ? <small className="omics-category-workspace__io-detail">{output.id}{output.format ? ` · ${output.format}` : ""}</small> : output.format ? <small className="omics-category-workspace__io-detail">{output.format}</small> : null}</span>
                {output.required === false ? <small>Optional</small> : null}
              </li>)}</ul>
            </section>
          </div>
          {operations.length ? <section className="omics-category-workspace__routes" aria-label="Workbench API routes">
            <h3>Connected Workbench operations</h3>
            <ul>{operations.map(([key, route]) => <li key={key}><span>{key.replaceAll("_", " ")}</span><code>{route}</code></li>)}</ul>
          </section> : null}
          {descriptor.capabilities?.read_only === true ? <p className="omics-category-workspace__notice">Workbench currently exposes this plugin as read-only. This React page will not fabricate a submit action.</p> : null}
        </PanelBody>
      </Panel>
      <Renderer descriptor={descriptor} />
    </main>;
  };
}
