import AlphaDiversityRenderer from "./omics/AlphaDiversityRenderer";
import AmrGeneClassifierRenderer from "./omics/AmrGeneClassifierRenderer";
import BetaDiversityRenderer from "./omics/BetaDiversityRenderer";
import MicrobiomeReportRenderer from "./omics/MicrobiomeReportRenderer";
import MicrobiomeTaxonomicClassifierRenderer from "./omics/MicrobiomeTaxonomicClassifierRenderer";
import TaxonomicAbundanceRenderer from "./omics/TaxonomicAbundanceRenderer";
import EnzymeEcClassifierRenderer from "./omics/EnzymeEcClassifierRenderer";
import ProteinInteractionRenderer from "./omics/ProteinInteractionRenderer";
import ProteinQuantificationRenderer from "./omics/ProteinQuantificationRenderer";
import ProteomicsRenderer from "./omics/ProteomicsRenderer";
import ProteomicsQcRenderer from "./omics/ProteomicsQcRenderer";
import ProteomicsReportRenderer from "./omics/ProteomicsReportRenderer";
import PtmAnalysisRenderer from "./omics/PtmAnalysisRenderer";
import PtmSitePredictorRenderer from "./omics/PtmSitePredictorRenderer";
import AdvSingleCellRenderer from "./omics/AdvSingleCellRenderer";
import CellCommVisualizationRenderer from "./omics/CellCommVisualizationRenderer";
import CiteseqCelltypeClassifierRenderer from "./omics/CiteseqCelltypeClassifierRenderer";
import ClusteringRenderer from "./omics/ClusteringRenderer";
import MarkerIdentificationRenderer from "./omics/MarkerIdentificationRenderer";
import RnaVelocityAnalysisRenderer from "./omics/RnaVelocityAnalysisRenderer";
import ScanpyClusteringRenderer from "./omics/ScanpyClusteringRenderer";
import ScanpyImportRenderer from "./omics/ScanpyImportRenderer";
import ScanpyMarkersRenderer from "./omics/ScanpyMarkersRenderer";
import ScanpyQcFilterRenderer from "./omics/ScanpyQcFilterRenderer";
import ScanpyQcMetricsRenderer from "./omics/ScanpyQcMetricsRenderer";
import SingleCellAnalysisRenderer from "./omics/SingleCellAnalysisRenderer";
import SingleCellAnnotationRenderer from "./omics/SingleCellAnnotationRenderer";
import SingleCellLoomViewerRenderer from "./omics/SingleCellLoomViewerRenderer";
import QcPlotsRenderer from "./omics/QcPlotsRenderer";
import SpatialAnalysisRenderer from "./omics/SpatialAnalysisRenderer";
import SpatialClusteringRenderer from "./omics/SpatialClusteringRenderer";
import SpatialDomainClassifierRenderer from "./omics/SpatialDomainClassifierRenderer";
import SpatialMarkerIdentificationRenderer from "./omics/SpatialMarkerIdentificationRenderer";
import SpatialReportGenerationRenderer from "./omics/SpatialReportGenerationRenderer";
import ThresholdRecommendationRenderer from "./omics/ThresholdRecommendationRenderer";

export const OMICS_CATEGORY_PLUGIN_RENDERERS = Object.freeze({
  alpha_diversity: AlphaDiversityRenderer,
  amr_gene_classifier: AmrGeneClassifierRenderer,
  beta_diversity: BetaDiversityRenderer,
  microbiome_report: MicrobiomeReportRenderer,
  microbiome_taxonomic_classifier: MicrobiomeTaxonomicClassifierRenderer,
  taxonomic_abundance: TaxonomicAbundanceRenderer,
  enzyme_ec_classifier: EnzymeEcClassifierRenderer,
  protein_interaction: ProteinInteractionRenderer,
  protein_quantification: ProteinQuantificationRenderer,
  proteomics: ProteomicsRenderer,
  proteomics_qc: ProteomicsQcRenderer,
  proteomics_report: ProteomicsReportRenderer,
  ptm_analysis: PtmAnalysisRenderer,
  ptm_site_predictor: PtmSitePredictorRenderer,
  adv_single_cell: AdvSingleCellRenderer,
  cell_comm_visualization: CellCommVisualizationRenderer,
  citeseq_celltype_classifier: CiteseqCelltypeClassifierRenderer,
  clustering: ClusteringRenderer,
  marker_identification: MarkerIdentificationRenderer,
  rna_velocity_analysis: RnaVelocityAnalysisRenderer,
  scanpy_clustering: ScanpyClusteringRenderer,
  scanpy_import: ScanpyImportRenderer,
  scanpy_markers: ScanpyMarkersRenderer,
  scanpy_qc_filter: ScanpyQcFilterRenderer,
  scanpy_qc_metrics: ScanpyQcMetricsRenderer,
  single_cell_analysis: SingleCellAnalysisRenderer,
  single_cell_annotation: SingleCellAnnotationRenderer,
  single_cell_loom_viewer: SingleCellLoomViewerRenderer,
  qc_plots: QcPlotsRenderer,
  spatial_analysis: SpatialAnalysisRenderer,
  spatial_clustering: SpatialClusteringRenderer,
  spatial_domain_classifier: SpatialDomainClassifierRenderer,
  spatial_marker_identification: SpatialMarkerIdentificationRenderer,
  spatial_report_generation: SpatialReportGenerationRenderer,
  threshold_recommendation: ThresholdRecommendationRenderer,
});
