import AsyncAnalysisRenderer from "./AsyncAnalysisRenderer";
import InformationalRenderer from "./InformationalRenderer";
import QueryRenderer from "./QueryRenderer";
import MultiAgentOrchestratorRenderer from "./MultiAgentOrchestratorRenderer";
import JobMonitorRenderer from "./JobMonitorRenderer";
import RunInspectorReactRenderer from "./RunInspectorReactRenderer";
import {
  CatalogReactRenderer,
  DataLineageTrackerReactRenderer,
  EnvironmentManagerReactRenderer,
  FormatConverterReactRenderer,
  SchemaRegistryReactRenderer,
} from "./UtilityRegistryRenderers";
import {
  ClinicalConsentManagerReactRenderer,
  ClinicalDataQualityReactRenderer,
  DatasetIngestReactRenderer,
  FairDataPackagerReactRenderer,
  PrivacyDeidentificationReactRenderer,
  ResourceCostEstimatorReactRenderer,
  SpatialImagingIoReactRenderer,
  VoiceCommandReactRenderer,
} from "./UtilityClinicalRenderers";
import CollaborationReactRenderer from "./CollaborationReactRenderer";
import { ObjectRegistryExplorerReactRenderer, ReferenceRegistryReactRenderer } from "./UtilityRegistryDetailRenderers";
import {
  ChecksumIntegrityReactRenderer,
  FileTransferReactRenderer,
  JobQueueReactRenderer,
  MultiQcReactRenderer,
  PdfReportBuilderReactRenderer,
  StorageQuotaReactRenderer,
} from "./UtilityOperationsRenderers";
import BioAgentRenderer from "./BioAgentRenderer";
import { WorkflowCompilerRenderer } from "./WorkflowNativeRenderers";
import WorkflowBuilderCanvasRenderer from "./WorkflowBuilderCanvasRenderer";
import {
  Deseq2AnalysisRenderer,
  MolecularDockingRenderer,
  MultiQcRenderer,
  ReferenceGenomeManagerRenderer,
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
import DatasetCatalogRenderer from "./DatasetCatalogRenderer";
import PluginManagerRenderer from "./PluginManagerRenderer";
import AuditLogRenderer from "./AuditLogRenderer";
import WorkflowRunnerRenderer from "./WorkflowRunnerRenderer";
import OpenBabelReactRenderer from "./OpenBabelReactRenderer";
import {
  PipelineDashboardRenderer,
  WorkflowExplorerRenderer,
  WorkflowRegistryAdminRenderer,
  WorkflowSchedulerRenderer,
  WorkflowValidatorRenderer,
} from "./PipelinePluginReactRenderers";
import { ML_PLUGIN_RENDERERS } from "./MLPluginReactRenderer";
import { CRISPR_DRUG_PLUGIN_RENDERERS } from "./CrisprDrugReactRenderers";
import { SEARCH_STRUCTURE_PLUGIN_RENDERERS } from "./SearchStructureReactRenderers";
import {
  AlertingRenderer,
  ApiAnalyticsRenderer,
  DataManagerRenderer,
  HomeDashboardRenderer,
  IntegrationConnectionsRenderer,
  NotificationCenterRenderer,
  ProvenanceRenderer,
  ResourceMonitoringRenderer,
  SecurityDashboardRenderer,
} from "./DashboardPluginRenderers";
import { CLINICAL_PLUGIN_RENDERERS } from "./ClinicalPluginRenderers";

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
  workflow_builder: WorkflowBuilderCanvasRenderer,
  workflow_compiler: WorkflowCompilerRenderer,
  dataset_ingest: DatasetIngestReactRenderer,
  run_inspector: RunInspectorReactRenderer,
  catalog: CatalogReactRenderer,
  schema_registry: SchemaRegistryReactRenderer,
  data_lineage_tracker: DataLineageTrackerReactRenderer,
  environment_manager: EnvironmentManagerReactRenderer,
  format_converter: FormatConverterReactRenderer,
  storage_quota_manager: StorageQuotaReactRenderer,
  job_queue_manager: JobQueueReactRenderer,
  file_transfer_manager: FileTransferReactRenderer,
  checksum_integrity_manager: ChecksumIntegrityReactRenderer,
  pdf_report_builder: PdfReportBuilderReactRenderer,
  multiqc_wrapper: MultiQcReactRenderer,
  spatial_imaging_io: SpatialImagingIoReactRenderer,
  fair_data_packager: FairDataPackagerReactRenderer,
  privacy_deidentification: PrivacyDeidentificationReactRenderer,
  clinical_consent_manager: ClinicalConsentManagerReactRenderer,
  clinical_data_quality_validator: ClinicalDataQualityReactRenderer,
  resource_cost_estimator: ResourceCostEstimatorReactRenderer,
  voice_command: VoiceCommandReactRenderer,
  collaboration: CollaborationReactRenderer,
  object_registry_explorer: ObjectRegistryExplorerReactRenderer,
  reference_registry: ReferenceRegistryReactRenderer,
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
  ...CLINICAL_PLUGIN_RENDERERS,
  ...ML_PLUGIN_RENDERERS,
  ...CRISPR_DRUG_PLUGIN_RENDERERS,
  ...SEARCH_STRUCTURE_PLUGIN_RENDERERS,
  genome_viewer: GenomeViewerRenderer,
  dataset_catalog: DatasetCatalogRenderer,
  plugin_manager: PluginManagerRenderer,
  audit_log: AuditLogRenderer,
  workflow_runner: WorkflowRunnerRenderer,
  openbabel: OpenBabelReactRenderer,
  pipeline_dashboard: PipelineDashboardRenderer,
  workflow_scheduler: WorkflowSchedulerRenderer,
  workflow_explorer: WorkflowExplorerRenderer,
  workflow_registry_admin: WorkflowRegistryAdminRenderer,
  workflow_validator: WorkflowValidatorRenderer,
  alerting: AlertingRenderer,
  api_analytics: ApiAnalyticsRenderer,
  data_manager: DataManagerRenderer,
  home: HomeDashboardRenderer,
  integration_connections: IntegrationConnectionsRenderer,
  notification_center: NotificationCenterRenderer,
  provenance: ProvenanceRenderer,
  resource_monitoring: ResourceMonitoringRenderer,
  security_dashboard: SecurityDashboardRenderer,
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
