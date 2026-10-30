import React from "react";
import { Badge } from "@omnibioai/ui";
import { Panel, PanelBody, PanelHeader } from "../UI";
import AsyncAnalysisRenderer from "./AsyncAnalysisRenderer";
import InformationalRenderer from "./InformationalRenderer";
import QueryRenderer from "./QueryRenderer";
import "./PriorityPluginRenderers.css";

const WORKFLOWS = Object.freeze({
  dataset_ingest: {
    eyebrow: "Data foundation",
    summary: "Stage a scientific dataset, validate its format and integrity, and register it for downstream workflows.",
    stages: ["Select dataset", "Validate", "Register", "Review lineage"],
    outputs: ["Registered dataset", "Validation report", "Lineage metadata"],
    note: "Original files remain governed by the Workbench storage and ownership boundary.",
    mode: "async",
  },
  run_inspector: {
    eyebrow: "Operations",
    summary: "Inspect an execution without leaving Studio: status, logs, inputs, artifacts, ownership and reproducibility evidence.",
    stages: ["Identify run", "Load evidence", "Inspect lifecycle", "Review outputs"],
    outputs: ["Run timeline", "Logs", "Artifacts and provenance"],
    note: "Run access remains owner-scoped and is enforced by the Workbench API.",
    mode: "async",
  },
  multiqc_wrapper: {
    eyebrow: "Quality control",
    summary: "Browse and compare normalized MultiQC reports, modules, samples, metrics and report-level quality signals.",
    stages: ["Choose operation", "Filter reports", "Compare metrics", "Open evidence"],
    outputs: ["QC summaries", "Per-sample metrics", "Report evidence"],
    note: "The React interface reads bounded, normalized report data; report content is never injected as raw HTML.",
    mode: "query",
  },
  reference_genome_manager: {
    eyebrow: "Reference data",
    summary: "Discover and validate genome builds, annotations and tool indexes through a single governed catalog.",
    stages: ["Choose operation", "Describe reference", "Validate files", "Review compatibility"],
    outputs: ["Reference identity", "Integrity status", "Compatible indexes"],
    note: "This deployment exposes a local draft workspace; removing a registration never silently deletes underlying files.",
    mode: "informational",
  },
  deseq2_analysis: {
    eyebrow: "RNA-seq",
    summary: "Configure a differential-expression comparison and review normalized counts, statistics and diagnostic plots.",
    stages: ["Upload counts", "Define groups", "Run DESeq2", "Review contrasts"],
    outputs: ["Differential-expression table", "MA plot", "Normalized counts"],
    note: "The analysis executes in Workbench; Studio provides the typed submission and result experience.",
    mode: "async",
  },
  variant_annotation: {
    eyebrow: "Genomics",
    summary: "Annotate variants against configured local sources and inspect evidence-rich, downloadable results.",
    stages: ["Select variants", "Configure sources", "Annotate", "Review evidence"],
    outputs: ["Annotated variants", "Source evidence", "Downloadable artifacts"],
    note: "Annotation databases and genome-build compatibility are resolved by the backend, not trusted from the browser.",
    mode: "async",
  },
  molecular_docking: {
    eyebrow: "Drug discovery",
    summary: "Validate receptor and ligand inputs, configure a bounded docking run, and inspect ranked poses and scores.",
    stages: ["Prepare structures", "Validate inputs", "Run docking", "Rank poses"],
    outputs: ["Docking scores", "Pose artifacts", "Execution evidence"],
    note: "This deployment exposes a local draft workspace; it never fabricates docking results when an engine is unavailable.",
    mode: "informational",
  },
});

export function WorkflowOverview({ workflow }) {
  return <Panel>
    <PanelHeader title={workflow.eyebrow}><Badge>Studio React</Badge></PanelHeader>
    <PanelBody>
      <p className="priority-plugin-summary">{workflow.summary}</p>
      <ol className="priority-plugin-stages" aria-label="Workflow stages">
        {workflow.stages.map((stage, index) => <li key={stage}>
          <span aria-hidden="true">{index + 1}</span><strong>{stage}</strong>
        </li>)}
      </ol>
      <div className="priority-plugin-output-row" aria-label="Expected outputs">
        {workflow.outputs.map(output => <span key={output}>{output}</span>)}
      </div>
      <p className="priority-plugin-note">{workflow.note}</p>
    </PanelBody>
  </Panel>;
}

export function GuidedPluginRenderer({ descriptor, workflow }) {
  const Renderer = descriptor.renderer === "query"
    ? QueryRenderer
    : descriptor.renderer === "informational" ? InformationalRenderer : AsyncAnalysisRenderer;
  return <div className={`priority-plugin priority-plugin--${descriptor.plugin.slug}`}>
    <WorkflowOverview workflow={workflow} />
    <Renderer descriptor={descriptor} />
  </div>;
}

export function createGuidedPluginRenderer(workflow) {
  return function DedicatedPriorityPluginRenderer({ descriptor }) {
    return <GuidedPluginRenderer descriptor={descriptor} workflow={workflow} />;
  };
}

function rendererFor(slug) {
  return createGuidedPluginRenderer(WORKFLOWS[slug]);
}

export const DatasetIngestRenderer = rendererFor("dataset_ingest");
export const RunInspectorRenderer = rendererFor("run_inspector");
export const MultiQcRenderer = rendererFor("multiqc_wrapper");
export const ReferenceGenomeManagerRenderer = rendererFor("reference_genome_manager");
export const Deseq2AnalysisRenderer = rendererFor("deseq2_analysis");
export const VariantAnnotationRenderer = rendererFor("variant_annotation");
export const MolecularDockingRenderer = rendererFor("molecular_docking");

export const PRIORITY_PLUGIN_SLUGS = Object.freeze(Object.keys(WORKFLOWS));
