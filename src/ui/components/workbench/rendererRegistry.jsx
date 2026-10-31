import AsyncAnalysisRenderer from "./AsyncAnalysisRenderer";
import InformationalRenderer from "./InformationalRenderer";
import QueryRenderer from "./QueryRenderer";
import MultiAgentOrchestratorRenderer from "./MultiAgentOrchestratorRenderer";
import JobMonitorRenderer from "./JobMonitorRenderer";
import BioAgentRenderer from "./BioAgentRenderer";
import { WorkflowBuilderRenderer, WorkflowCompilerRenderer } from "./WorkflowNativeRenderers";
import {
  DatasetIngestRenderer,
  Deseq2AnalysisRenderer,
  MolecularDockingRenderer,
  MultiQcRenderer,
  ReferenceGenomeManagerRenderer,
  RunInspectorRenderer,
  VariantAnnotationRenderer,
} from "./PriorityPluginRenderers";
import { EXPANDED_PLUGIN_RENDERERS } from "./ExpandedPluginRenderers";
import { ADDITIONAL_PLUGIN_RENDERERS } from "./AdditionalPluginRenderers";
import { NEXT_PLUGIN_RENDERERS } from "./NextPluginRenderers";
import { SCIENTIFIC_PLUGIN_RENDERERS } from "./ScientificPluginRenderers";
import { BROAD_PLUGIN_RENDERERS } from "./BroadPluginRenderers";
import { CENTURY_PLUGIN_RENDERERS } from "./CenturyPluginRenderers";
import { NEXT_CENTURY_PLUGIN_RENDERERS } from "./NextCenturyPluginRenderers";
import { FINAL_PLUGIN_RENDERERS } from "./FinalPluginRenderers";
import GenomeViewerRenderer from "./GenomeViewerRenderer";

// Only a browser lifecycle with evidence in the current generic family is
// registered. generic_runner is retained as a descriptor compatibility alias;
// it is not a second implementation or renderer family.
export const RENDERER_REGISTRY = Object.freeze({
  async_analysis: AsyncAnalysisRenderer,
  informational: InformationalRenderer,
  query: QueryRenderer,
});

const LEGACY_RENDERER_ALIASES = Object.freeze({ generic_runner: "async_analysis" });
const PLUGIN_RENDERER_OVERRIDES = Object.freeze({
  bio_agent: BioAgentRenderer,
  job_monitor: JobMonitorRenderer,
  multi_agent_bio_orchestrator: MultiAgentOrchestratorRenderer,
  workflow_builder: WorkflowBuilderRenderer,
  workflow_compiler: WorkflowCompilerRenderer,
  dataset_ingest: DatasetIngestRenderer,
  run_inspector: RunInspectorRenderer,
  multiqc_wrapper: MultiQcRenderer,
  reference_genome_manager: ReferenceGenomeManagerRenderer,
  deseq2_analysis: Deseq2AnalysisRenderer,
  variant_annotation: VariantAnnotationRenderer,
  molecular_docking: MolecularDockingRenderer,
  ...EXPANDED_PLUGIN_RENDERERS,
  ...ADDITIONAL_PLUGIN_RENDERERS,
  ...NEXT_PLUGIN_RENDERERS,
  ...SCIENTIFIC_PLUGIN_RENDERERS,
  ...BROAD_PLUGIN_RENDERERS,
  ...CENTURY_PLUGIN_RENDERERS,
  ...NEXT_CENTURY_PLUGIN_RENDERERS,
  ...FINAL_PLUGIN_RENDERERS,
  genome_viewer: GenomeViewerRenderer,
});

export function normalizeRendererName(renderer) {
  if (renderer === "async_analysis" || renderer === "informational" || renderer === "query") return renderer;
  return typeof renderer === "string" && Object.prototype.hasOwnProperty.call(LEGACY_RENDERER_ALIASES, renderer)
    ? LEGACY_RENDERER_ALIASES[renderer]
    : null;
}

export function resolveWorkbenchRenderer(renderer, pluginSlug) {
  if (typeof pluginSlug === "string" && Object.prototype.hasOwnProperty.call(PLUGIN_RENDERER_OVERRIDES, pluginSlug)) {
    return PLUGIN_RENDERER_OVERRIDES[pluginSlug];
  }
  const normalized = normalizeRendererName(renderer);
  return normalized && Object.prototype.hasOwnProperty.call(RENDERER_REGISTRY, normalized)
    ? RENDERER_REGISTRY[normalized]
    : null;
}
