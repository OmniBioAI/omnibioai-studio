import React from "react";
import { Badge } from "@omnibioai/ui";
import { Panel, PanelBody, PanelHeader } from "../UI";
import AsyncAnalysisRenderer from "./AsyncAnalysisRenderer";
import InformationalRenderer from "./InformationalRenderer";
import QueryRenderer from "./QueryRenderer";

const WORKFLOWS = Object.freeze({
  chembl_search: { category: "Search · drug knowledge", icon: "💊", title: "ChEMBL compound and activity search", summary: "Search the ChEMBL knowledgebase for compound, target, or bioactivity evidence. Review the returned records and source artifacts in the governed Workbench run.", stages: ["Enter a compound or target", "Choose search type and result limit", "Run the search", "Review activity evidence"] },
  geo_search: { category: "Search · expression studies", icon: "🧬", title: "NCBI GEO search", summary: "Find GEO datasets and series using a query, organism, and experiment type, then review the resulting study metadata.", stages: ["Describe the study", "Filter by organism and experiment", "Search GEO", "Review study records"] },
  kegg_search: { category: "Search · pathways", icon: "🔗", title: "KEGG pathway and entity search", summary: "Search KEGG pathway, compound, gene, or disease records with the selected database and organism filters.", stages: ["Enter a pathway or entity", "Select the KEGG database", "Set organism and result limit", "Review pathway records"] },
  jaspar_search: { category: "Search · regulatory motifs", icon: "🧬", title: "JASPAR transcription-factor search", summary: "Search transcription-factor binding profiles and position-weight matrices by factor, species, and collection.", stages: ["Enter a transcription factor", "Choose species and collection", "Search JASPAR", "Review profile records"] },
  pubmed_search: { category: "Search · biomedical literature", icon: "📚", title: "PubMed literature search", summary: "Search biomedical literature with an optional publication date range and AI summarization setting.", stages: ["Enter a literature query", "Set date range and result limit", "Choose whether to summarize", "Review citations and summaries"] },
  europepmc: { category: "Search · life-sciences literature", icon: "📖", title: "Europe PMC", summary: "Review the Europe PMC literature integration and its documented search, article, citation, and open-access capabilities.", stages: ["Review available operations", "Inspect query requirements", "Understand source coverage", "Plan literature retrieval"] },
  gwas_catalog_search: { category: "Search · genetic associations", icon: "🧬", title: "GWAS Catalog search", summary: "Search curated genetic-association records by trait, gene, or variant, with an optional significance threshold.", stages: ["Enter trait, gene, or variant", "Set significance threshold", "Search the catalog", "Review association evidence"] },
  biostudies: { category: "Search · study archive", icon: "🗃️", title: "BioStudies study search", summary: "Search and retrieve study metadata using query, accession, title, author, and organism filters.", stages: ["Enter study filters", "Set the page size", "Search BioStudies", "Review study metadata and resources"] },
  agentic_pymol: { category: "Structure · AI visualization", icon: "🧩", title: "Agentic PyMOL", summary: "Provide a protein structure and describe the view you want. The configured agent workflow returns rendered structure artifacts and execution evidence.", stages: ["Upload or select a structure", "Describe the visualization", "Run the agent", "Review rendered outputs"] },
  structure_visualizer: { category: "Structure · protein model", icon: "🧬", title: "Protein structure visualizer", summary: "Submit a protein structure input and review the visualization and per-chain output artifacts produced by Workbench.", stages: ["Provide a PDB structure", "Validate the input", "Render the structure", "Review the model and chain summary"] },
  docking_pose_viewer: { category: "Structure · docking poses", icon: "🧩", title: "Docking pose viewer", summary: "Inspect docked ligand poses, ranked by available Vina scores, with optional receptor context when supplied by the workflow.", stages: ["Provide docked poses", "Configure the view", "Render pose evidence", "Review ranked structures"] },
  protein_evolution: { category: "Structure · sequence conservation", icon: "🌳", title: "Protein evolution analysis", summary: "Analyze an aligned protein FASTA input to produce per-position conservation evidence and a conservation plot.", stages: ["Provide aligned protein sequences", "Validate the alignment", "Calculate conservation", "Review scores and plots"] },
  alphafold: { category: "Structure · protein prediction", icon: "🧬", title: "AlphaFold / ColabFold", summary: "Submit a registered protein FASTA for ColabFold prediction, monitor execution, and review PDB, PAE, and other returned artifacts. The viewer only presents outputs exposed by the current Workbench contract.", stages: ["Select or provide a FASTA", "Configure prediction options", "Run ColabFold", "Review structure and confidence artifacts"] },
});

function WorkflowOverview({ workflow }) {
  return <Panel>
    <PanelHeader title={workflow.title}><Badge>{workflow.category}</Badge></PanelHeader>
    <PanelBody>
      <p className="priority-plugin-summary"><span aria-hidden="true" style={{ fontSize: 24, marginRight: 10 }}>{workflow.icon}</span>{workflow.summary}</p>
      <ol className="priority-plugin-stages" aria-label="Workflow steps">
        {workflow.stages.map((stage, index) => <li key={stage}><span aria-hidden="true">{index + 1}</span><strong>{stage}</strong></li>)}
      </ol>
      <p className="priority-plugin-note">Search results, run state, logs, and downloadable artifacts stay within the authenticated Workbench lifecycle. External-source records remain attributed to their provider.</p>
    </PanelBody>
  </Panel>;
}

function SearchStructureRenderer({ descriptor }) {
  const workflow = WORKFLOWS[descriptor?.plugin?.slug];
  if (!workflow) return <p role="alert">This plugin has no registered Search or Structure React workflow.</p>;
  const Renderer = descriptor.renderer === "query"
    ? QueryRenderer
    : descriptor.renderer === "informational" ? InformationalRenderer : AsyncAnalysisRenderer;
  return <div className={`priority-plugin priority-plugin--${descriptor.plugin.slug}`}>
    <WorkflowOverview workflow={workflow} />
    <Renderer descriptor={descriptor} />
  </div>;
}

export const SEARCH_STRUCTURE_PLUGIN_RENDERERS = Object.freeze(Object.fromEntries(
  Object.keys(WORKFLOWS).map(slug => [slug, SearchStructureRenderer]),
));
export const SEARCH_STRUCTURE_PLUGIN_SLUGS = Object.freeze(Object.keys(WORKFLOWS));
