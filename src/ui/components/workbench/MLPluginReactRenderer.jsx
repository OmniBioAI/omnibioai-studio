import React, { useEffect, useMemo, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "../UI";
import { csrfToken, pluginEndpoint } from "../../lib/pluginApi";
import { safeErrorMessage } from "../../lib/safeErrorMessage";
import "./MLPluginReactRenderer.css";

// These controls mirror the historical Workbench pages instead of falling
// back to the generic descriptor form. The server remains the source of truth
// for execution, status, logs, and artifacts.
const config = (title, intro, fields, options = {}) => ({ title, intro, fields, ...options });
const F = (id, label, type = "text", extra = {}) => ({ id, label, type, ...extra });
const modelFields = (inputName, inputLabel, modelRef, options = {}) => [
  F("mode", "Operation", "select", { value: "infer", choices: ["infer", "train"] }),
  F(inputName, inputLabel, "file", { required: true, accept: options.accept || ".csv,.tsv,.txt,.h5ad,.h5,.fa,.fasta,.vcf,.vcf.gz,.sdf,.smi,.png,.jpg,.jpeg,.tif,.tiff" }),
  F("labels", options.labelsLabel || "Labels / targets (required for training)", "file", { accept: ".csv,.tsv,.txt", when: ["mode", "train"] }),
  F("model_ref", "Model reference", "text", { value: modelRef, help: "Used in inference mode, for example model@production." }),
  F("hyperparams", "Training hyperparameters (JSON)", "textarea", { value: '{"lr": 0.001, "epochs": 50}', when: ["mode", "train"] }),
];

const ML_PLUGIN_UI = Object.freeze({
  variant_effect_intelligence: config("Variant Effect Intelligence", "Run variant-effect prioritization from an annotated VCF OmniObject or upload. Outputs retain their provenance.", [
    F("input_source", "Variant source", "select", { value: "omniobject", choices: ["omniobject", "upload"] }),
    F("omniobject_id", "Annotated VCF OmniObject ID", "text", { when: ["input_source", "omniobject"], required: true }),
    F("annotated_file", "Annotated VCF file", "file", { when: ["input_source", "upload"], accept: ".vcf,.vcf.gz", required: true }),
    F("create_log", "Create execution log", "checkbox", { value: true }),
    F("create_run_object", "Register run object", "checkbox", { value: true }),
  ], { submitMode: "legacyPage" }),
  single_cell_omics_intelligence: config("Single-Cell Omics Intelligence", "Filter, normalize, reduce, cluster, and optionally infer pseudotime from an AnnData dataset.", [
    F("input_h5ad", "Input AnnData (.h5ad)", "file", { required: true, accept: ".h5ad" }),
    F("min_genes", "Minimum genes per cell", "number", { value: "200" }), F("min_cells", "Minimum cells per gene", "number", { value: "3" }),
    F("max_pct_mt", "Maximum mitochondrial percentage", "number", { value: "25", step: "0.1" }), F("n_hvgs", "Highly variable genes", "number", { value: "2000" }),
    F("n_pcs", "Principal components", "number", { value: "30" }), F("neighbors_k", "Neighbors", "number", { value: "15" }),
    F("leiden_resolution", "Leiden resolution", "number", { value: "1", step: "0.1" }), F("embedding", "Embedding", "select", { value: "umap", choices: ["umap", "tsne"] }),
    F("do_filter", "Filter low-quality cells", "checkbox", { value: true }), F("do_hvg", "Select highly variable genes", "checkbox", { value: true }),
    F("do_pseudotime", "Calculate pseudotime", "checkbox", { value: true }), F("random_seed", "Random seed", "number", { value: "0" }),
  ], { submitMode: "multipart", legacyRedirect: true, inputFileKeys: ["input_h5ad"] }),
  anomaly_detection_omics: config("Omics Anomaly Detection", "Find unusual samples in a matrix using selectable statistical and machine-learning detectors.", [
    F("matrix_path", "Omics matrix path", "text", { required: true, placeholder: "/path/to/matrix.tsv" }), F("sample_col", "Sample ID column", "text", { value: "sample_id" }),
    F("methods", "Detection methods", "multiselect", { value: ["isolation_forest", "mahalanobis", "one_class_svm"], choices: [["isolation_forest", "Isolation Forest"], ["mahalanobis", "Mahalanobis"], ["one_class_svm", "One-Class SVM"]] }),
    F("contamination", "Expected outlier fraction", "number", { value: "0.05", min: "0.01", max: "0.5", step: "0.01" }),
  ], { submitMode: "json", numeric: ["contamination"] }),
  auto_ml_biomarker_discovery: config("AutoML Biomarker Discovery", "Compare feature-selection and classification algorithms with cross-validation to rank candidate biomarkers.", [
    F("expression_matrix", "Expression matrix", "textarea", { required: true, placeholder: "Gene\\tSample1\\tSample2\\n..." }), F("labels", "Sample labels (comma-separated)", "text", { required: true, placeholder: "0,0,1,1,0,1" }),
    F("algorithms", "Algorithms", "multiselect", { value: ["random_forest", "elastic_net", "xgboost"], choices: [["random_forest", "Random Forest"], ["elastic_net", "ElasticNet"], ["xgboost", "XGBoost"], ["lightgbm", "LightGBM"]] }),
    F("cv_folds", "Cross-validation folds", "number", { value: "5", min: "2", max: "10" }), F("top_n", "Top biomarkers", "number", { value: "20", min: "5", max: "100" }),
  ], { submitMode: "json", numeric: ["cv_folds", "top_n"], integerList: ["labels"] }),
  deep_learning_variant_classifier: config("Deep-Learning Variant Classifier", "Train a classifier from variant features and inspect its run artifacts.", [
    F("vcf_path", "Variant data path", "text", { required: true, placeholder: "/path/to/variants.vcf" }), F("feature_cols", "Feature columns", "text", { required: true, placeholder: "CADD,SIFT,PolyPhen,..." }),
    F("hidden_layers", "Hidden layer widths", "text", { value: "128,64,32" }), F("threshold", "Decision threshold", "number", { value: "0.5", min: "0.1", max: "0.9", step: "0.05" }), F("max_iter", "Maximum iterations", "number", { value: "200", min: "50", max: "1000" }),
  ], { submitMode: "json", numeric: ["threshold", "max_iter"], integerLists: ["hidden_layers"], lists: ["feature_cols"] }),
  drug_response_predictor: config("Drug Response Predictor", "Predict drug response from genomic features and response measurements.", [
    F("genomics_path", "Genomics data path", "text", { required: true, placeholder: "/path/to/genomics.tsv" }), F("response_path", "Drug response data path", "text", { required: true, placeholder: "/path/to/drug_response.tsv" }),
    F("drugs", "Drugs to evaluate", "text", { required: true, placeholder: "Erlotinib,Imatinib,..." }), F("algorithm", "Algorithm", "select", { value: "xgboost", choices: ["xgboost", "gradient_boosting", "random_forest"] }), F("cv_folds", "Cross-validation folds", "number", { value: "5", min: "2", max: "10" }),
  ], { submitMode: "json", numeric: ["cv_folds"], lists: ["drugs"] }),
  explainable_ai_interpreter: config("Explainable AI Interpreter", "Generate model explanations with SHAP, permutation importance, or LIME.", [
    F("features_path", "Feature matrix path", "text", { required: true, placeholder: "/path/to/features.tsv" }), F("labels", "Labels (comma-separated)", "text", { required: true, placeholder: "0,1,0,1,..." }),
    F("model_type", "Model", "select", { value: "random_forest", choices: ["random_forest", "xgboost", "gradient_boosting", "logistic_regression"] }),
    F("explainers", "Explanation methods", "multiselect", { value: ["shap", "permutation"], choices: [["shap", "SHAP"], ["permutation", "Permutation Importance"], ["lime", "LIME"]] }), F("top_n", "Top features", "number", { value: "20", min: "5", max: "100" }),
  ], { submitMode: "json", numeric: ["top_n"], integerList: ["labels"] }),
  gene_expression_regulatory_ai: config("Gene Expression Regulatory AI", "Infer transcription-factor regulatory networks from expression data.", [
    F("expression_path", "Expression data path", "text", { required: true, placeholder: "/path/to/expression.tsv" }), F("tf_list", "Transcription-factor list path", "text", { required: true, placeholder: "/path/to/TF_list.txt" }),
    F("method", "Association method", "select", { value: "pearson", choices: ["pearson", "mutual_information", "spearman"] }), F("threshold", "Association threshold", "number", { value: "0.7", min: "0.3", max: "1.0", step: "0.05" }), F("top_hubs", "Top hub genes", "number", { value: "20", min: "5", max: "100" }),
  ], { submitMode: "json", numeric: ["threshold", "top_hubs"] }),
  multi_omics_integration_ai: config("Multi-Omics Integration AI", "Integrate transcriptomic, proteomic, and metabolomic layers into a joint analysis.", [
    F("transcriptomics", "Transcriptomics matrix", "text", { required: true, placeholder: "/path/to/rna.tsv" }), F("proteomics", "Proteomics matrix", "text", { placeholder: "/path/to/protein.tsv" }), F("metabolomics", "Metabolomics matrix", "text", { placeholder: "/path/to/metabolite.tsv" }),
    F("method", "Integration method", "select", { value: "mofa", choices: [["pca_concat", "PCA concatenation"], ["mofa", "MOFA+"]] }), F("n_clusters", "Clusters", "number", { value: "3", min: "2", max: "20" }), F("n_pcs", "Principal components per layer", "number", { value: "10", min: "2", max: "50" }),
  ], { submitMode: "json", numeric: ["n_clusters", "n_pcs"] }),
  single_cell_trajectory_inference: config("Single-Cell Trajectory Inference", "Infer developmental trajectories and pseudotime from single-cell measurements.", [
    F("h5ad_path", "AnnData path", "text", { placeholder: "/path/to/data.h5ad" }), F("counts_path", "Counts matrix path", "text", { placeholder: "/path/to/counts.tsv" }),
    F("method", "Trajectory method", "select", { value: "paga", choices: [["dpt", "Diffusion Pseudotime"], ["paga", "PAGA"], ["pc1", "PC1 Pseudotime"]] }), F("root_cell", "Root cell index", "number", { value: "0", min: "0" }), F("n_neighbors", "Neighbors", "number", { value: "15", min: "5", max: "100" }),
  ], { submitMode: "json", numeric: ["root_cell", "n_neighbors"] }),
  variant_pathogenicity_classifier: config("Variant Pathogenicity Classifier", "Train a model or infer pathogenicity from a variant table.", modelFields("variants", "Variant table", "variant_mlp@production", { accept: ".csv,.tsv,.vcf,.vcf.gz" }), { submitMode: "model" }),
  structural_variant_classifier: config("Structural Variant Classifier", "Train or infer structural variant classes using a registered 1D-CNN model.", modelFields("signal", "Structural-variant signal file", "sv_cnn1d@production", { accept: ".csv,.tsv,.npy,.npz" }), { submitMode: "model" }),
  scrna_celltype_classifier: config("scRNA-seq Cell-Type Classifier", "Train or infer cell identities from AnnData expression matrices.", modelFields("adata", "AnnData / scRNA-seq file", "celltype_mlp@production", { accept: ".h5ad,.h5,.csv,.tsv" }), { submitMode: "model" }),
  scrna_batch_integration_ae: config("scRNA-seq Batch Integration", "Train or apply a registered autoencoder to integrate single-cell batches.", modelFields("adata", "AnnData / batch data file", "batch_ae@production", { accept: ".h5ad,.h5,.csv,.tsv" }), { submitMode: "model" }),
  histopath_tumor_classifier: config("Histopathology Tumor Classifier", "Train or infer tumor classes from pathology image tiles.", modelFields("tiles", "Histopathology image tiles", "tumor_resnet@production", { accept: ".png,.jpg,.jpeg,.tif,.tiff,.zip" }), { submitMode: "model" }),
  histopath_nuclei_segmentation: config("Histopathology Nuclei Segmentation", "Train or infer nuclei masks from pathology tiles using a U-Net model.", modelFields("tiles", "Histopathology image tiles", "nuclei_unet@production", { accept: ".png,.jpg,.jpeg,.tif,.tiff,.zip" }), { submitMode: "model" }),
  protein_function_classifier_esm: config("Protein Function Classifier (ESM2)", "Classify protein function from sequence data using the selected model version.", modelFields("sequences", "Protein sequences", "esm_function_head@production", { accept: ".fa,.fasta,.faa,.csv,.tsv,.txt" }), { submitMode: "model" }),
  protein_stability_ddg_predictor: config("Protein Stability ΔΔG Predictor", "Predict mutation-induced protein stability changes.", modelFields("mutations", "Protein mutation table", "ddg_mlp@production", { accept: ".csv,.tsv,.txt" }), { submitMode: "model" }),
  admet_property_predictor: config("ADMET Property Predictor", "Predict absorption, distribution, metabolism, excretion, and toxicity properties for molecules.", modelFields("molecules", "Molecule file (SMILES / SDF)", "admet_mlp@production", { accept: ".csv,.tsv,.smi,.sdf,.txt" }), { submitMode: "model" }),
  drug_target_binding_affinity: config("Drug-Target Binding Affinity Predictor", "Predict binding affinity for drug-target pairs.", modelFields("pairs", "Drug-target pairs", "affinity_mlp@production", { accept: ".csv,.tsv,.txt" }), { submitMode: "model" }),
  protein_language_model_finetuner: config("Protein Language Model Fine-Tuner", "Fine-tune ESM-2 with LoRA on labeled sequences, or run inference with a registered version.", [F("mode", "Operation", "select", { value: "infer", choices: ["infer", "train"] }), F("protein_sequences", "Protein sequences", "file", { required: true, accept: ".fa,.fasta,.faa,.csv,.tsv,.txt" }), F("model_ref", "Model reference", "text", { value: "esm_lora_finetuner@production" }), F("model_name", "New model name", "text", { value: "esm_lora_finetuner", when: ["mode", "train"] }), F("hyperparams", "Training hyperparameters (JSON)", "textarea", { value: "{}", when: ["mode", "train"] })], { submitMode: "model" }),
  scrna_foundation_finetuner: config("scRNA Foundation Model Fine-Tuner", "Fine-tune or apply a foundation model to AnnData single-cell datasets.", [F("mode", "Operation", "select", { value: "infer", choices: ["infer", "train"] }), F("anndata_h5ad", "AnnData dataset", "file", { required: true, accept: ".h5ad" }), F("model_ref", "Model reference", "text", { value: "scrna_foundation_transformer@production" }), F("model_name", "New model name", "text", { value: "scrna_foundation_transformer", when: ["mode", "train"] }), F("hyperparams", "Training hyperparameters (JSON)", "textarea", { value: "{}", when: ["mode", "train"] })], { submitMode: "model" }),
  dna_sequence_finetuner: config("DNA Sequence Foundation Model Fine-Tuner", "Fine-tune or apply a nucleotide foundation model to DNA sequences.", [F("mode", "Operation", "select", { value: "infer", choices: ["infer", "train"] }), F("dna_sequences", "DNA sequences", "file", { required: true, accept: ".fa,.fasta,.fna,.csv,.tsv,.txt" }), F("model_ref", "Model reference", "text", { value: "nt_lora_finetuner@production" }), F("model_name", "New model name", "text", { value: "nt_lora_finetuner", when: ["mode", "train"] }), F("hyperparams", "Training hyperparameters (JSON)", "textarea", { value: "{}", when: ["mode", "train"] })], { submitMode: "model" }),
  histopath_foundation_finetuner: config("Histopathology Foundation Model Fine-Tuner", "Fine-tune or apply a pathology image foundation model to histology tiles.", [F("mode", "Operation", "select", { value: "infer", choices: ["infer", "train"] }), F("tiles", "Histopathology image tiles", "file", { required: true, multiple: true, accept: ".png,.jpg,.jpeg,.tif,.tiff,.zip" }), F("labels", "Tile labels (required for training)", "file", { when: ["mode", "train"], accept: ".csv,.tsv,.txt" }), F("model_ref", "Model reference", "text", { value: "phikon_finetuner@production" }), F("model_name", "New model name", "text", { value: "phikon_finetuner", when: ["mode", "train"] }), F("hyperparams", "Training hyperparameters (JSON)", "textarea", { value: "{}", when: ["mode", "train"] })], { submitMode: "model" }),
  chemistry_lm_finetuner: config("Chemistry Language Model Fine-Tuner", "Fine-tune or apply a molecular language model to SMILES or molecule files.", [F("mode", "Operation", "select", { value: "infer", choices: ["infer", "train"] }), F("molecules", "Molecule data", "file", { required: true, accept: ".smi,.sdf,.csv,.tsv,.txt" }), F("model_ref", "Model reference", "text", { value: "chemberta_lora_finetuner@production" }), F("model_name", "New model name", "text", { value: "chemberta_lora_finetuner", when: ["mode", "train"] }), F("hyperparams", "Training hyperparameters (JSON)", "textarea", { value: "{}", when: ["mode", "train"] })], { submitMode: "model" }),
  antibody_lm_finetuner: config("Antibody Language Model Fine-Tuner", "Fine-tune or apply an antibody sequence language model.", [F("mode", "Operation", "select", { value: "infer", choices: ["infer", "train"] }), F("antibody_sequences", "Antibody sequences", "file", { required: true, accept: ".fa,.fasta,.csv,.tsv,.txt" }), F("model_ref", "Model reference", "text", { value: "ablang_lora_finetuner@production" }), F("model_name", "New model name", "text", { value: "ablang_lora_finetuner", when: ["mode", "train"] }), F("hyperparams", "Training hyperparameters (JSON)", "textarea", { value: "{}", when: ["mode", "train"] })], { submitMode: "model" }),
  biomedical_vlm_finetuner: config("Biomedical Vision-Language Model Fine-Tuner", "Fine-tune or apply a biomedical vision-language model to image and caption pairs.", [F("mode", "Operation", "select", { value: "infer", choices: ["infer", "train"] }), F("tiles", "Biomedical image tiles", "file", { required: true, multiple: true, accept: ".png,.jpg,.jpeg,.tif,.tiff,.zip" }), F("captions", "Captions / text labels", "file", { when: ["mode", "train"], accept: ".csv,.tsv,.txt" }), F("model_ref", "Model reference", "text", { value: "biomedclip_lora_finetuner@production" }), F("model_name", "New model name", "text", { value: "biomedclip_lora_finetuner", when: ["mode", "train"] }), F("hyperparams", "Training hyperparameters (JSON)", "textarea", { value: "{}", when: ["mode", "train"] })], { submitMode: "model" }),
});

const TERMINAL = new Set(["COMPLETE", "COMPLETED", "FAILED", "ERROR", "CANCELLED", "CANCELED"]);
const conditional = (field, values) => !field.when || values[field.when[0]] === field.when[1];
function castPayload(values, schema) {
  const payload = {};
  for (const [key, value] of Object.entries(values)) {
    if (schema.numeric?.includes(key)) payload[key] = value === "" ? null : Number(value);
    else if (schema.integerList?.includes(key)) payload[key] = value.split(",").map(item => Number.parseInt(item.trim(), 10)).filter(Number.isFinite);
    else if (schema.integerLists?.includes(key)) payload[key] = value.split(",").map(item => Number.parseInt(item.trim(), 10)).filter(Number.isFinite);
    else if (schema.lists?.includes(key)) payload[key] = value.split(",").map(item => item.trim()).filter(Boolean);
    else payload[key] = value;
  }
  return payload;
}

async function requestJson(path, options = {}) {
  const response = await fetch(pluginEndpoint(path), { credentials: "same-origin", ...options, headers: { Accept: "application/json", ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.detail || `Workbench request failed (${response.status}).`);
  return payload;
}

export function MLTaskRenderer({ descriptor }) {
  const slug = descriptor?.plugin?.slug;
  const spec = ML_PLUGIN_UI[slug];
  const [values, setValues] = useState(() => Object.fromEntries((spec?.fields || []).map(field => [field.id, field.value ?? (field.type === "checkbox" ? false : field.type === "multiselect" ? [] : "")])));
  const [files, setFiles] = useState({});
  const [runId, setRunId] = useState("");
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const title = spec?.title || descriptor?.plugin?.name || slug;
  const endpoint = (suffix, id = runId) => `/plugins/${slug}/api/${suffix}${id ? `${id}/` : ""}`;

  useEffect(() => {
    if (!runId || TERMINAL.has(status?.state)) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const [next, log] = await Promise.all([requestJson(endpoint(`status/`, `${runId}`)), requestJson(endpoint(`log/`, `${runId}`))]);
        if (!active) return;
        setStatus(next); setLogs(Array.isArray(log.lines) ? log.lines : []);
        if (["COMPLETE", "COMPLETED"].includes(next.state)) {
          const artifacts = await requestJson(endpoint(`artifacts/`, `${runId}`));
          if (active) setOutputs(Array.isArray(artifacts.outputs) ? artifacts.outputs : []);
        }
      } catch (failure) { if (active) setError(safeErrorMessage(failure, "Could not refresh this run.")); }
    };
    const timer = window.setInterval(poll, 3000); poll();
    return () => { active = false; window.clearInterval(timer); };
  }, [runId, status?.state]);

  function update(field, value) { setValues(previous => ({ ...previous, [field]: value })); }
  async function submit(event) {
    event.preventDefault(); setError("");
    const activeFields = spec.fields.filter(field => conditional(field, values));
    for (const field of activeFields) {
      if (field.required && (field.type === "file" ? !(files[field.id] || []).length : !String(values[field.id] ?? "").trim())) { setError(`${field.label} is required.`); return; }
    }
    if (values.mode === "train" && spec.fields.some(field => field.id === "labels" && field.when?.[1] === "train") && !(files.labels || []).length) { setError("Training requires a labels file."); return; }
    if (values.hyperparams) { try { JSON.parse(values.hyperparams); } catch { setError("Training hyperparameters must be valid JSON."); return; } }
    setBusy(true); setRunId(""); setStatus(null); setLogs([]); setOutputs([]);
    try {
      let payload;
      const path = spec.legacyRedirect ? `/plugins/${slug}/run/` : endpoint("run/");
      if (spec.submitMode === "json") {
        payload = await requestJson(path, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken() }, body: JSON.stringify(castPayload(values, spec)) });
      } else {
        const body = new FormData();
        for (const field of activeFields) {
          const value = values[field.id];
          if (field.type === "file") (files[field.id] || []).forEach(file => body.append(field.id, file));
          else if (field.type === "checkbox") {
            if (spec.submitMode === "legacyPage") { if (value) body.append(field.id, "on"); }
            else body.append(field.id, value ? "true" : "false");
          }
          else if (field.type === "multiselect") body.append(field.id, JSON.stringify(value));
          else if (value !== "" && value !== undefined) body.append(field.id, value);
        }
        if (spec.submitMode === "legacyPage") {
          const response = await fetch(pluginEndpoint(`/plugins/${slug}/run/`), { method: "POST", body, credentials: "same-origin", headers: { Accept: "text/html", "X-CSRFToken": csrfToken() } });
          const markup = await response.text();
          if (!response.ok) throw new Error(`Workbench could not complete this analysis (${response.status}).`);
          const parsed = new DOMParser().parseFromString(markup, "text/html");
          const downloadLinks = Array.from(parsed.querySelectorAll('a[href*="/download/"]'));
          const resultOutputs = downloadLinks.map(link => {
            const match = link.getAttribute("href")?.match(/\/download\/([A-Za-z0-9_.:-]+)\/?(?:\?.*)?$/);
            if (!match) return null;
            return { label: (link.textContent || "Download result").trim(), type: "OmniObject", href: pluginEndpoint(`/plugins/${slug}/download/${match[1]}/`) };
          }).filter(Boolean);
          const pageError = parsed.querySelector("[role=alert], .error, .omni-page-message--error")?.textContent?.trim();
          if (pageError) throw new Error(pageError);
          if (!resultOutputs.length) throw new Error("The Workbench completed the request but returned no downloadable result objects.");
          setOutputs(resultOutputs); setStatus({ state: "COMPLETED", detail: "Results registered as OmniObjects." });
          payload = { directResult: true };
        } else if (spec.legacyRedirect) {
          const response = await fetch(pluginEndpoint(path), { method: "POST", body, credentials: "same-origin", headers: { Accept: "application/json", "X-CSRFToken": csrfToken() } });
          const match = response.url.match(/\/run\/([A-Za-z0-9_.:-]+)\/?(?:\?.*)?$/);
          if (!response.ok || !match) {
            const responseBody = await response.text().catch(() => "");
            throw new Error(responseBody.includes("upload") ? "The Workbench rejected this upload. Check the file and parameters." : `Unable to start run (${response.status}).`);
          }
          payload = { run_id: match[1], status: "RUNNING" };
        } else {
          payload = await requestJson(path, { method: "POST", headers: { "X-CSRFToken": csrfToken() }, body });
        }
      }
      if (payload.directResult) return;
      if (!payload.run_id) throw new Error(payload.error || "Workbench did not return a run ID.");
      setRunId(String(payload.run_id)); setStatus({ state: payload.state || payload.status || "RUNNING" });
    } catch (failure) { setError(safeErrorMessage(failure, "Could not start this analysis.")); }
    finally { setBusy(false); }
  }

  const visibleFields = useMemo(() => (spec?.fields || []).filter(field => conditional(field, values)), [spec, values]);
  return <section className={`ml-react-page ml-react-page--${slug}`}>
    <header className="ml-react-hero"><div><span className="ml-react-kicker">Workbench · Machine Learning</span><h2>{title}</h2><p>{spec?.intro}</p></div><span className="ml-react-state">{status?.state || "Ready to configure"}</span></header>
    <div className="ml-react-grid">
      <Panel><PanelHeader title="Configure analysis" /><PanelBody>
        <form className="ml-react-form" onSubmit={submit}>
          {visibleFields.map(field => <label className={`ml-react-field ml-react-field--${field.type}`} key={field.id}>
            <span>{field.label}{field.required ? " *" : ""}</span>
            {field.type === "select" ? <select value={values[field.id]} onChange={event => update(field.id, event.target.value)}>{field.choices.map(choice => { const [value, label] = Array.isArray(choice) ? choice : [choice, choice]; return <option value={value} key={value}>{label}</option>; })}</select>
              : field.type === "multiselect" ? <select multiple value={values[field.id]} onChange={event => update(field.id, Array.from(event.target.selectedOptions, option => option.value))}>{field.choices.map(choice => { const [value, label] = Array.isArray(choice) ? choice : [choice, choice]; return <option value={value} key={value}>{label}</option>; })}</select>
                : field.type === "file" ? <input type="file" accept={field.accept} multiple={field.multiple} onChange={event => setFiles(previous => ({ ...previous, [field.id]: Array.from(event.target.files || []) }))} />
                  : field.type === "checkbox" ? <input type="checkbox" checked={Boolean(values[field.id])} onChange={event => update(field.id, event.target.checked)} />
                    : field.type === "textarea" ? <textarea rows={field.id === "hyperparams" ? 4 : 5} value={values[field.id]} placeholder={field.placeholder} onChange={event => update(field.id, event.target.value)} />
                      : <input type={field.type} value={values[field.id]} placeholder={field.placeholder} min={field.min} max={field.max} step={field.step} onChange={event => update(field.id, event.target.value)} />}
            {field.help && <small>{field.help}</small>}
          </label>)}
          {error && <p className="ml-react-error" role="alert">{error}</p>}
          <button className="omni-btn omni-btn--primary omni-btn--md" type="submit" disabled={busy}>{busy ? "Submitting…" : values.mode === "train" ? "Start training" : "Run analysis"}</button>
        </form>
      </PanelBody></Panel>
      <Panel><PanelHeader title={runId ? `Run ${runId}` : "Run monitor"} /><PanelBody>
        {!runId && !outputs.length && <p className="ml-react-empty">Configure the inputs and start a run. Live state, logs, and output artifacts will appear here.</p>}
        {(runId || outputs.length > 0) && <><p role="status" className="ml-react-run-state">{status?.state || "RUNNING"}{status?.detail ? ` · ${status.detail}` : ""}</p>
          <div className="ml-react-progress" aria-hidden="true"><span className={TERMINAL.has(status?.state) ? "is-done" : "is-running"} /></div>
          <div className="ml-react-log-head"><h3>Live log</h3><button type="button" onClick={() => setAdvanced(value => !value)}>{advanced ? "Hide" : "Show"} raw log</button></div>
          {advanced && <pre className="ml-react-log">{logs.join("\n") || "Waiting for log output…"}</pre>}
          {outputs.length > 0 && <div className="ml-react-outputs"><h3>Run outputs</h3>{outputs.map((output, index) => {
            const path = output?.path; const href = output?.href || (path && runId ? pluginEndpoint(`/plugins/${slug}/api/file/${runId}/?path=${encodeURIComponent(path)}`) : "");
            return <div className="ml-react-output" key={`${output?.label || "output"}-${index}`}><strong>{String(output?.label || output?.name || `Output ${index + 1}`)}</strong><span>{String(output?.type || "artifact")}</span>{href && <a href={href} target="_blank" rel="noreferrer">Open / download</a>}</div>;
          })}</div>}
        </>}
      </PanelBody></Panel>
    </div>
  </section>;
}

export function createMLTaskRenderer(slug) {
  return function MLPluginRenderer(props) { return <MLTaskRenderer {...props} descriptor={{ ...props.descriptor, plugin: { ...props.descriptor?.plugin, slug } }} />; };
}

export const ML_PLUGIN_UI_SLUGS = Object.freeze(Object.keys(ML_PLUGIN_UI));
export const ML_PLUGIN_RENDERERS = Object.freeze({
  ...Object.fromEntries(ML_PLUGIN_UI_SLUGS.map(slug => [slug, createMLTaskRenderer(slug)])),
  drug_target_intelligence: DrugTargetIntelligenceReactRenderer,
  celltype_classification_sc: CelltypeClassificationReactRenderer,
});

export function DrugTargetIntelligenceReactRenderer() {
  const [source, setSource] = useState("study");
  const [studies, setStudies] = useState([]); const [objects, setObjects] = useState([]); const [studyFiles, setStudyFiles] = useState([]);
  const [studyId, setStudyId] = useState(""); const [selectedFiles, setSelectedFiles] = useState([]); const [selectedObjects, setSelectedObjects] = useState([]);
  const [uploads, setUploads] = useState([]); const [jsonText, setJsonText] = useState(""); const [topK, setTopK] = useState("20");
  const [result, setResult] = useState(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([requestJson("/plugins/drug_target_intelligence/api/studies/"), requestJson("/plugins/drug_target_intelligence/api/omniobjects/")])
      .then(([studyData, objectData]) => { if (active) { setStudies(studyData.items || []); setObjects(objectData.items || []); } })
      .catch(failure => { if (active) setError(safeErrorMessage(failure, "Could not load available studies and OmniObjects.")); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (source !== "study" || !studyId) { setStudyFiles([]); return undefined; }
    let active = true;
    requestJson(`/plugins/drug_target_intelligence/api/studies/${encodeURIComponent(studyId)}/files/`)
      .then(data => { if (active) setStudyFiles(data.items || []); })
      .catch(failure => { if (active) setError(safeErrorMessage(failure, "Could not load study JSON files.")); });
    return () => { active = false; };
  }, [source, studyId]);
  async function run(event) {
    event.preventDefault(); setError(""); setResult(null);
    const body = { source, top_k: Number(topK) || 20 };
    if (source === "study") { if (!studyId || !selectedFiles.length) { setError("Choose a study and at least one JSON file."); return; } body.study_id = studyId; body.files = selectedFiles; }
    if (source === "omniobjects") { if (!selectedObjects.length) { setError("Choose at least one OmniObject."); return; } body.object_ids = selectedObjects; }
    if (source === "upload") {
      if (!uploads.length) { setError("Choose one or more JSON files."); return; }
      try { body.json_texts = await Promise.all(uploads.map(file => file.text())); } catch { setError("Could not read the selected JSON files."); return; }
    }
    if (source === "paste") { if (!jsonText.trim()) { setError("Paste at least one JSON record."); return; } body.json_texts = [jsonText]; }
    setLoading(true);
    try { setResult(await requestJson("/plugins/drug_target_intelligence/api/predict/", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken() }, body: JSON.stringify(body) })); }
    catch (failure) { setError(safeErrorMessage(failure, "Could not rank drug-target evidence.")); }
    finally { setLoading(false); }
  }
  const ranked = Array.isArray(result?.ranked) ? result.ranked : [];
  const network = result?.graph && Array.isArray(result.graph.nodes) ? result.graph : { nodes: [], edges: [] };
  const graphNodes = network.nodes.slice(0, 36);
  const graphHeight = Math.max(300, graphNodes.length * 32);
  const positions = new Map(graphNodes.map((node, index) => [node.id, {
    x: node.kind === "drug" ? 170 : 710,
    y: 28 + (Math.floor(index / 2) * (graphHeight - 56)) / Math.max(1, Math.ceil(graphNodes.length / 2) - 1),
  }]));
  return <section className="ml-react-page ml-react-page--drug-target-intelligence">
    <header className="ml-react-hero"><div><span className="ml-react-kicker">Evidence network · ML</span><h2>Drug-Target Intelligence</h2><p>Load evidence from a study, OmniObjects, JSON files, or pasted JSON. Rank observed drug-target relationships and inspect the evidence behind each edge.</p></div><span className="ml-react-state">{result ? `${ranked.length} ranked pairs` : "Evidence graph"}</span></header>
    <div className="ml-react-grid"><Panel><PanelHeader title="Evidence inputs"/><PanelBody><form className="ml-react-form" onSubmit={run}>
      <label className="ml-react-field"><span>Evidence source</span><select value={source} onChange={event => { setSource(event.target.value); setError(""); }}><option value="study">Study files</option><option value="omniobjects">OmniObjects</option><option value="upload">Upload JSON</option><option value="paste">Paste JSON</option></select></label>
      {source === "study" && <><label className="ml-react-field"><span>Study</span><select value={studyId} onChange={event => { setStudyId(event.target.value); setSelectedFiles([]); }}><option value="">Choose a study</option>{studies.map(item => <option key={item.study_id} value={item.study_id}>{item.study_id}</option>)}</select></label><fieldset className="ml-react-choice-list"><legend>JSON evidence files</legend>{studyFiles.length ? studyFiles.map(file => <label key={file.name}><input type="checkbox" checked={selectedFiles.includes(file.name)} onChange={event => setSelectedFiles(previous => event.target.checked ? [...previous, file.name] : previous.filter(name => name !== file.name))}/>{file.name}</label>) : <small>Select a study to list its JSON files.</small>}</fieldset></>}
      {source === "omniobjects" && <fieldset className="ml-react-choice-list"><legend>JSON OmniObjects</legend>{objects.map(item => <label key={item.object_id}><input type="checkbox" checked={selectedObjects.includes(item.object_id)} onChange={event => setSelectedObjects(previous => event.target.checked ? [...previous, item.object_id] : previous.filter(id => id !== item.object_id))}/>{item.display || item.object_id}</label>)}</fieldset>}
      {source === "upload" && <label className="ml-react-field"><span>JSON files</span><input type="file" accept=".json,application/json" multiple onChange={event => setUploads(Array.from(event.target.files || []))}/></label>}
      {source === "paste" && <label className="ml-react-field"><span>JSON records</span><textarea rows="8" value={jsonText} onChange={event => setJsonText(event.target.value)} placeholder='Paste JSON, e.g. [{"drug":"...","target":"...","pmid":"..."}]'/></label>}
      <label className="ml-react-field"><span>Top interactions</span><input type="number" min="1" max="500" value={topK} onChange={event => setTopK(event.target.value)}/></label>
      {error && <p className="ml-react-error" role="alert">{error}</p>}<button className="omni-btn omni-btn--primary omni-btn--md" disabled={loading}>{loading ? "Analyzing evidence…" : "Rank interactions"}</button>
    </form></PanelBody></Panel>
    <Panel><PanelHeader title="Ranked interactions"/><PanelBody>{!result ? <p className="ml-react-empty">Run an evidence query to see ranked pairs, source counts, PMIDs, and network summary.</p> : <>
      <p className="ml-react-run-state">{result.summary?.n_docs ?? 0} source documents · {result.summary?.n_pairs_unique ?? 0} unique pairs · {network.nodes.length} nodes · {network.edges.length} edges · observed evidence only</p>
      {graphNodes.length > 0 && <div className="ml-react-network-wrap" aria-label="Drug-target evidence network"><svg className="ml-react-network" viewBox={`0 0 880 ${graphHeight}`} role="img" aria-label="Bipartite graph connecting drugs and targets">
        {network.edges.filter(edge => positions.has(edge.from) && positions.has(edge.to)).map((edge, index) => { const from = positions.get(edge.from); const to = positions.get(edge.to); return <line key={`${edge.from}-${edge.to}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--border2)" strokeWidth={Math.min(4, 1 + Math.log2(Number(edge.weight || 1)))} opacity=".8"/>; })}
        {graphNodes.map(node => { const point = positions.get(node.id); const drug = node.kind === "drug"; const label = String(node.label || node.id); return <g key={node.id}><circle cx={point.x} cy={point.y} r="7" fill={drug ? "var(--accent3)" : "var(--accent2)"}/><text x={point.x + (drug ? -12 : 12)} y={point.y + 4} textAnchor={drug ? "end" : "start"}>{label.length > 36 ? `${label.slice(0, 33)}…` : label}</text></g>; })}
      </svg><div className="ml-react-network-legend"><span><i className="ml-react-dot ml-react-dot--drug"/>Drugs</span><span><i className="ml-react-dot ml-react-dot--target"/>Targets</span><small>Showing {graphNodes.length} of {network.nodes.length} network nodes</small></div></div>}
      <div className="ml-react-table-wrap"><table className="ml-react-table"><thead><tr><th>Rank</th><th>Drug</th><th>Target</th><th>Score</th><th>Evidence</th></tr></thead><tbody>{ranked.map((item, index) => <tr key={`${item.drug}-${item.target}-${index}`}><td>{item.rank ?? index + 1}</td><td>{item.drug}</td><td>{item.target}</td><td>{Number(item.score || 0).toFixed(3)}</td><td>{item.evidence?.n_rows ?? 0} records{item.evidence?.pmids?.length ? ` · PMID ${item.evidence.pmids.slice(0, 3).join(", ")}` : ""}</td></tr>)}</tbody></table></div>
      {!ranked.length && <p className="ml-react-empty">No drug-target pairs were found in this evidence set.</p>}
    </>}</PanelBody></Panel></div>
  </section>;
}

export function CelltypeClassificationReactRenderer() {
  const [mode, setMode] = useState("train"); const [values, setValues] = useState({ label_key: "celltype", x_source: "X", x_pca_key: "X_pca", model_name: "celltype_classification_sc", version: "", promote_stage: "", register_upload_as_object: "1", stage: "production" });
  const [files, setFiles] = useState({}); const [result, setResult] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const training = mode === "train";
  const fields = training ? ["h5ad_object_id", "h5ad_upload", "h5ad_path", "label_key", "x_source", "x_pca_key", "model_name", "version", "promote_stage", "register_upload_as_object"] : ["query_h5ad_object_id", "query_h5ad_upload", "h5ad_path", "model_name", "stage", "x_source", "x_pca_key"];
  async function submit(event) {
    event.preventDefault(); setError(""); setResult(null);
    if (training && !values.version.trim()) { setError("Enter the model version to register."); return; }
    if (training && !files.h5ad_upload?.length && !values.h5ad_path?.trim() && !values.h5ad_object_id?.trim()) { setError("Select an existing H5AD object, upload a file, or enter a path."); return; }
    if (!training && !files.query_h5ad_upload?.length && !values.h5ad_path?.trim() && !values.query_h5ad_object_id?.trim()) { setError("Select an existing H5AD object, upload a file, or enter a path."); return; }
    const body = new FormData();
    for (const key of fields) {
      if (key.endsWith("_upload")) (files[key] || []).forEach(file => body.append(key, file));
      else if (values[key] !== undefined && values[key] !== "") body.append(key, values[key]);
    }
    setBusy(true);
    try {
      const path = `/plugins/celltype_classification_sc/${training ? "train" : "predict"}/`;
      const response = await fetch(pluginEndpoint(path), { method: "POST", body, credentials: "same-origin", headers: { Accept: "application/json", "X-CSRFToken": csrfToken() } });
      const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || payload.detail || `Workbench request failed (${response.status}).`); setResult(payload);
    } catch (failure) { setError(safeErrorMessage(failure, "Cell-type workflow failed.")); }
    finally { setBusy(false); }
  }
  const set = (key, value) => setValues(previous => ({ ...previous, [key]: value }));
  return <section className="ml-react-page ml-react-page--celltype-classification-sc"><header className="ml-react-hero"><div><span className="ml-react-kicker">Single-cell · Model registry</span><h2>scRNA-seq Cell-Type Classification</h2><p>Train and register a cell-type model, or apply a selected registered version to query AnnData.</p></div><span className="ml-react-state">{result ? "Workflow finished" : "Model workflow"}</span></header>
    <div className="ml-react-grid"><Panel><PanelHeader title="Training and prediction"/><PanelBody><form className="ml-react-form" onSubmit={submit}>
      <label className="ml-react-field"><span>Workflow</span><select value={mode} onChange={event => { setMode(event.target.value); setResult(null); }}><option value="train">Train and register</option><option value="predict">Run prediction</option></select></label>
      <label className="ml-react-field"><span>Existing H5AD OmniObject ID</span><input value={values[training ? "h5ad_object_id" : "query_h5ad_object_id"] || ""} onChange={event => set(training ? "h5ad_object_id" : "query_h5ad_object_id", event.target.value)} placeholder="Optional when uploading or specifying a path"/></label>
      <label className="ml-react-field"><span>{training ? "Training" : "Query"} AnnData (.h5ad)</span><input type="file" accept=".h5ad" onChange={event => setFiles(previous => ({ ...previous, [training ? "h5ad_upload" : "query_h5ad_upload"]: Array.from(event.target.files || []) }))}/></label>
      <label className="ml-react-field"><span>H5AD path (optional)</span><input value={values.h5ad_path || ""} onChange={event => set("h5ad_path", event.target.value)} placeholder="/abs/path/to/data.h5ad"/></label>
      {training ? <><label className="ml-react-field"><span>Cell-type label key</span><input value={values.label_key} onChange={event => set("label_key", event.target.value)}/></label><label className="ml-react-field"><span>Model version</span><input required value={values.version} onChange={event => set("version", event.target.value)} placeholder="2026-10-31_001"/></label><label className="ml-react-field"><span>Promote to stage</span><select value={values.promote_stage} onChange={event => set("promote_stage", event.target.value)}><option value="">Do not promote</option><option value="staging">Staging</option><option value="production">Production</option></select></label><label className="ml-react-field"><span>Register uploaded data as OmniObject</span><select value={values.register_upload_as_object} onChange={event => set("register_upload_as_object", event.target.value)}><option value="1">Yes</option><option value="0">No</option></select></label></> : <label className="ml-react-field"><span>Model stage</span><select value={values.stage} onChange={event => set("stage", event.target.value)}><option value="production">Production</option><option value="staging">Staging</option><option value="latest">Latest</option></select></label>}
      <label className="ml-react-field"><span>Expression source</span><select value={values.x_source} onChange={event => set("x_source", event.target.value)}><option value="X">X</option><option value="X_pca">X_pca</option></select></label><label className="ml-react-field"><span>Principal-component key</span><input value={values.x_pca_key} onChange={event => set("x_pca_key", event.target.value)}/></label><label className="ml-react-field"><span>Model name</span><input value={values.model_name} onChange={event => set("model_name", event.target.value)}/></label>
      {error && <p className="ml-react-error" role="alert">{error}</p>}<button className="omni-btn omni-btn--primary omni-btn--md" disabled={busy}>{busy ? "Working…" : training ? "Train and register model" : "Predict cell types"}</button>
    </form></PanelBody></Panel><Panel><PanelHeader title="Workflow result"/><PanelBody>{result ? <pre className="ml-react-log">{JSON.stringify(result, null, 2)}</pre> : <p className="ml-react-empty">Model registration or cell-type predictions will be summarized here.</p>}</PanelBody></Panel></div>
  </section>;
}
