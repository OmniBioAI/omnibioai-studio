import React from "react";
import { Badge } from "@omnibioai/ui";
import { Panel, PanelBody, PanelHeader } from "../UI";
import AsyncAnalysisRenderer from "./AsyncAnalysisRenderer";
import InformationalRenderer from "./InformationalRenderer";

const WORKFLOWS = Object.freeze({
  crispr_guide_efficiency_predictor: { category: "CRISPR · guide design", icon: "✂️", title: "Guide efficiency prediction", summary: "Estimate guide performance from the selected sequence or guide dataset, with model and training options declared by the Workbench input contract.", stages: ["Choose prediction or training mode", "Provide guide data", "Run the model", "Review scores and artifacts"] },
  crispr_screen_analysis: { category: "CRISPR · screen analysis", icon: "🧪", title: "CRISPR screen analysis", summary: "Review the registered screen-analysis capability and its input/output contract. This backend descriptor is currently read-only; no analysis is submitted from this page.", stages: ["Review screen inputs", "Check analysis requirements", "Inspect output contract", "Plan a future run"] },
  crispr_off_target_analysis: { category: "CRISPR · specificity", icon: "🎯", title: "CRISPR off-target analysis", summary: "Review the registered off-target analysis capability and its requirements. The current Workbench descriptor disables execution, so this React page does not claim to calculate candidate sites.", stages: ["Review guide requirements", "Check reference requirements", "Inspect output contract", "Plan a future run"] },
  dose_response_ic50_plot: { category: "Drug Discovery · pharmacology", icon: "📈", title: "Dose-response and IC₅₀", summary: "Fit and visualize dose-response evidence using declared Workbench input fields, then review generated plots and data artifacts.", stages: ["Provide dose-response data", "Configure the fit", "Run the analysis", "Review curve and IC₅₀ outputs"] },
  docking_analysis: { category: "Drug Discovery · structure", icon: "🧩", title: "Molecular docking analysis", summary: "Submit receptor, ligand, and parameters requested by the Workbench contract, then inspect ranked docking results and downloadable artifacts.", stages: ["Select structure inputs", "Configure docking", "Run the workflow", "Review scores and poses"] },
  binding_site_predictor: { category: "Drug Discovery · structure", icon: "🧬", title: "Binding-site prediction", summary: "Provide the protein evidence requested by the plugin and inspect predicted binding-site results through the Workbench run lifecycle.", stages: ["Provide protein input", "Configure prediction", "Run the model", "Review predicted sites"] },
  chemoinfo_intelligence: { category: "Drug Discovery · cheminformatics", icon: "⚗️", title: "Chemoinformatics analysis", summary: "Analyze an uploaded molecular structure or a selected registered object, then follow the run and review its result artifacts.", stages: ["Choose upload or registry input", "Submit the compound", "Monitor the run", "Review chemical evidence"] },
  drug_discovery_intelligence: { category: "Drug Discovery · intelligence", icon: "💊", title: "Drug discovery intelligence", summary: "Review this capability’s documented scope and declared inputs/outputs. Execution is unavailable in the current read-only Workbench descriptor.", stages: ["Review capability", "Inspect requirements", "Understand limitations", "Plan next steps"] },
  molecule_validation: { category: "Drug Discovery · molecule quality", icon: "✅", title: "Molecule validation", summary: "Validate molecular input and inspect the run log and result artifacts returned by Workbench.", stages: ["Enter a structure", "Validate input", "Run validation", "Review findings"] },
  molecular_descriptors: { category: "Drug Discovery · molecular properties", icon: "📐", title: "Molecular descriptors", summary: "Calculate the molecular properties specified by the plugin contract and review structured outputs and downloadable artifacts.", stages: ["Provide molecular input", "Select declared options", "Calculate descriptors", "Review properties"] },
  admet_prediction: { category: "Drug Discovery · ADMET", icon: "🧪", title: "ADMET prediction", summary: "Estimate absorption, distribution, metabolism, excretion, and toxicity properties from the configured molecular input.", stages: ["Provide a molecule", "Set prediction limits", "Run ADMET models", "Review property estimates"] },
  druglikeness_scoring: { category: "Drug Discovery · prioritization", icon: "⭐", title: "Drug-likeness scoring", summary: "Score molecular inputs against the plugin’s declared drug-likeness criteria and inspect the generated evidence.", stages: ["Provide a molecule", "Choose scoring options", "Run scoring", "Review criteria and artifacts"] },
  toxicity_prediction: { category: "Drug Discovery · safety signals", icon: "⚠️", title: "Toxicity prediction", summary: "Estimate selected toxicity endpoints for the submitted molecular input. Predictions are research signals, not clinical safety determinations.", stages: ["Provide a molecule", "Select toxicity endpoints", "Run prediction", "Review endpoint estimates"] },
  target_prediction: { category: "Drug Discovery · target identification", icon: "🎯", title: "Target prediction", summary: "Predict candidate biological targets for the submitted compound and review the returned evidence and artifacts.", stages: ["Provide a molecule", "Configure prediction", "Run the model", "Review candidate targets"] },
  pathway_mapping: { category: "Drug Discovery · pathway context", icon: "🔗", title: "Pathway mapping", summary: "Map predicted or supplied target evidence to pathway context using options declared by the Workbench contract.", stages: ["Provide compound or target evidence", "Set mapping criteria", "Run mapping", "Review pathway results"] },
  mechanism_analysis: { category: "Drug Discovery · mechanism of action", icon: "⚙️", title: "Mechanism-of-action analysis", summary: "Explore mechanism evidence from the selected molecule and inspect structured results and supporting artifacts.", stages: ["Provide molecular evidence", "Configure analysis", "Run the workflow", "Review mechanism findings"] },
  drug_report_generator: { category: "Drug Discovery · reporting", icon: "📄", title: "Drug discovery report", summary: "Assemble a research report from molecular evidence and review the generated report and supporting run artifacts.", stages: ["Provide compound evidence", "Add report context", "Generate the report", "Review and download outputs"] },
  molecular_docking: { category: "Drug Discovery · structure", icon: "🧬", title: "Molecular docking workspace", summary: "Review docking requirements and the available result contract. This deployment uses a read-only local draft workspace and does not fabricate docking results when execution is unavailable.", stages: ["Review structure requirements", "Inspect docking options", "Review output contract", "Plan a future run"] },
});

function WorkflowOverview({ workflow }) {
  return <Panel>
    <PanelHeader title={workflow.title}><Badge>{workflow.category}</Badge></PanelHeader>
    <PanelBody>
      <p className="priority-plugin-summary"><span aria-hidden="true" style={{ fontSize: 24, marginRight: 10 }}>{workflow.icon}</span>{workflow.summary}</p>
      <ol className="priority-plugin-stages" aria-label="Workflow steps">
        {workflow.stages.map((stage, index) => <li key={stage}><span aria-hidden="true">{index + 1}</span><strong>{stage}</strong></li>)}
      </ol>
      <p className="priority-plugin-note">Run controls, progress polling, logs, errors, and artifact downloads below are handled by the React Workbench lifecycle. Prediction outputs are research evidence and require scientific review.</p>
    </PanelBody>
  </Panel>;
}

function CrisprDrugRenderer({ descriptor }) {
  const workflow = WORKFLOWS[descriptor?.plugin?.slug];
  if (!workflow) return <p role="alert">This plugin has no registered CRISPR/Drug Discovery React workflow.</p>;
  const Renderer = descriptor.renderer === "informational" ? InformationalRenderer : AsyncAnalysisRenderer;
  return <div className={`priority-plugin priority-plugin--${descriptor.plugin.slug}`}>
    <WorkflowOverview workflow={workflow} />
    <Renderer descriptor={descriptor} />
  </div>;
}

export const CRISPR_DRUG_PLUGIN_RENDERERS = Object.freeze(Object.fromEntries(
  Object.keys(WORKFLOWS).map(slug => [slug, CrisprDrugRenderer]),
));
export const CRISPR_DRUG_PLUGIN_SLUGS = Object.freeze(Object.keys(WORKFLOWS));
