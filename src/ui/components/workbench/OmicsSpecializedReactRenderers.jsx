import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "../UI";
import { csrfToken, pluginEndpoint } from "../../lib/pluginApi";
import "./OmicsSpecializedReactRenderers.css";

async function requestJson(path, { method = "GET", body, formData } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const csrf = csrfToken();
  if (csrf && method !== "GET") headers["X-CSRFToken"] = csrf;
  const response = await fetch(pluginEndpoint(path), {
    method, headers, credentials: "same-origin",
    body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(`The Workbench returned an unreadable response (${response.status}).`); }
  if (!response.ok || payload.ok === false) {
    const detail = payload.error || payload.errors?.join(" ") || `Request failed (${response.status}).`;
    throw new Error(detail);
  }
  return payload;
}

function Notice({ error, success }) {
  if (!error && !success) return null;
  return <div className={`omics-special__notice ${error ? "is-error" : "is-success"}`} role={error ? "alert" : "status"}>{error || success}</div>;
}

export function SingleCellLoomViewerReactRenderer() {
  const [objects, setObjects] = useState([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [dataset, setDataset] = useState(null);
  const [plot, setPlot] = useState(null);
  const [gene, setGene] = useState("");
  const [geneData, setGeneData] = useState(null);
  const [annotationsText, setAnnotationsText] = useState("{\n  \"cell_annotations\": {}\n}");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshObjects = useCallback(async () => {
    setError("");
    try {
      const payload = await requestJson("/plugins/single_cell_loom_viewer/api/objects/");
      setObjects(payload.objects || []);
      if (!selectedPath && payload.objects?.length) setSelectedPath(payload.objects[0].path);
    } catch (e) { setError(e.message); }
  }, [selectedPath]);
  useEffect(() => { refreshObjects(); }, []); // initial registry browse

  async function loadDataset(path = selectedPath) {
    if (!path) return;
    setBusy(true); setError(""); setSuccess(""); setGeneData(null);
    try {
      const payload = await requestJson(`/plugins/single_cell_loom_viewer/api/load/?path=${encodeURIComponent(path)}`);
      setDataset(payload.dataset); setPlot(payload.plot); setSuccess(`Loaded ${payload.dataset.n_cells.toLocaleString()} cells and ${payload.dataset.n_genes.toLocaleString()} genes.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData(); formData.append("file", file);
    setBusy(true); setError(""); setSuccess("");
    try {
      const payload = await requestJson("/plugins/single_cell_loom_viewer/api/upload/", { method: "POST", formData });
      const objectPath = payload.object?.path;
      await refreshObjects();
      if (objectPath) { setSelectedPath(objectPath); await loadDataset(objectPath); }
      setSuccess(`Uploaded ${file.name}; the object is ready to browse.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); event.target.value = ""; }
  }

  async function lookupGene(event) {
    event.preventDefault();
    if (!dataset || !gene.trim()) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const payload = await requestJson(`/plugins/single_cell_loom_viewer/api/gene/?path=${encodeURIComponent(dataset.path)}&gene=${encodeURIComponent(gene.trim())}`);
      setGeneData(payload); setSuccess(`Expression values loaded for ${payload.gene}.`);
    } catch (e) { setError(e.message); setGeneData(null); }
    finally { setBusy(false); }
  }

  async function exportAnnotations(event) {
    event.preventDefault();
    if (!dataset) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const annotations = JSON.parse(annotationsText);
      if (!annotations || Array.isArray(annotations) || typeof annotations !== "object") throw new Error("Annotations must be a JSON object keyed by cell or annotation name.");
      const payload = await requestJson("/plugins/single_cell_loom_viewer/api/annotations/export/", {
        method: "POST", body: { dataset_path: dataset.path, annotations },
      });
      setSuccess(`Annotations exported as ${payload.object?.display_name || payload.annotation_path}.`);
      await refreshObjects();
    } catch (e) { setError(e instanceof SyntaxError ? "Enter valid JSON annotations before exporting." : e.message); }
    finally { setBusy(false); }
  }

  const points = useMemo(() => {
    if (!plot?.x?.length) return [];
    const limit = Math.min(plot.x.length, plot.y?.length || 0);
    const stride = Math.max(1, Math.ceil(limit / 15000));
    const indices = Array.from({ length: Math.ceil(limit / stride) }, (_, index) => index * stride);
    const xs = indices.map(index => Number(plot.x[index]) || 0), ys = indices.map(index => Number(plot.y[index]) || 0);
    const minX = xs.reduce((min, value) => Math.min(min, value), Infinity), maxX = xs.reduce((max, value) => Math.max(max, value), -Infinity);
    const minY = ys.reduce((min, value) => Math.min(min, value), Infinity), maxY = ys.reduce((max, value) => Math.max(max, value), -Infinity);
    const expr = geneData?.values || [];
    const maxExpr = expr.reduce((max, value) => Math.max(max, Number(value) || 0), 1);
    return indices.map((sourceIndex, i) => {
      const geneIndex = plot.plot_indices?.[sourceIndex] ?? sourceIndex;
      const value = Number(expr[geneIndex]) || 0;
      const shade = Math.max(0, Math.min(1, value / maxExpr));
      return { key: plot.cell_ids?.[sourceIndex] ?? sourceIndex, x: 10 + ((xs[i] - minX) / (maxX - minX || 1)) * 380,
        y: 230 - ((ys[i] - minY) / (maxY - minY || 1)) * 210,
        fill: geneData ? `rgb(${Math.round(27 + shade * 205)}, ${Math.round(104 - shade * 54)}, ${Math.round(165 - shade * 125)})` : "#4978d0" };
    });
  }, [plot, geneData]);

  return <main className="omics-special" data-plugin="single_cell_loom_viewer">
    <Panel><PanelHeader title="👁️ Single-Cell LOOM Viewer"><span className="omics-special__badge">Single-cell · interactive React workspace</span></PanelHeader>
      <PanelBody><p className="omics-special__intro">Browse registered LOOM/AnnData objects, inspect embeddings, look up a gene across cells, and save annotation JSON back to the object registry.</p>
        <Notice error={error} success={success}/>
        <div className="omics-special__toolbar">
          <label className="omics-special__field">Registered single-cell object<select value={selectedPath} onChange={event => setSelectedPath(event.target.value)}><option value="">Choose an object…</option>{objects.map(object => <option key={object.path} value={object.path}>{object.display_name} · {object.format}</option>)}</select></label>
          <button type="button" className="omics-special__button" disabled={!selectedPath || busy} onClick={() => loadDataset()}>Load object</button>
          <label className="omics-special__button omics-special__upload">Upload .loom / .h5ad<input type="file" accept=".loom,.h5ad" onChange={uploadFile}/></label>
          <button type="button" className="omics-special__button is-quiet" onClick={refreshObjects}>Refresh objects</button>
        </div>
        {dataset && <div className="omics-special__stats"><div><strong>{dataset.n_cells.toLocaleString()}</strong><span>Cells</span></div><div><strong>{dataset.n_genes.toLocaleString()}</strong><span>Genes</span></div><div><strong>{dataset.format}</strong><span>Format</span></div><div><strong>{dataset.embedding_key || "Not detected"}</strong><span>Embedding</span></div></div>}
      </PanelBody>
    </Panel>
    {dataset && <div className="omics-special__grid">
      <Panel><PanelHeader title="Embedding browser"/><PanelBody>
        <p className="omics-special__muted">{geneData ? `Color intensity represents ${geneData.gene} expression.` : `Showing ${points.length.toLocaleString()} sampled cells from ${dataset.embedding_key || "the available embedding"}.`}</p>
        <div className="omics-special__plot" role="img" aria-label="Single-cell embedding scatter plot"><svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid meet"><line x1="10" y1="235" x2="390" y2="235"/><line x1="10" y1="10" x2="10" y2="235"/>{points.map(point => <circle key={point.key} cx={point.x} cy={point.y} r="2.1" fill={point.fill}><title>{point.key}</title></circle>)}</svg></div>
        <form className="omics-special__inline" onSubmit={lookupGene}><label className="omics-special__field">Gene lookup<input value={gene} onChange={event => setGene(event.target.value)} placeholder="e.g. TP53"/></label><button className="omics-special__button" disabled={busy || !gene.trim()}>Find gene</button></form>
        {geneData && <p className="omics-special__muted">Resolved gene: <strong>{geneData.gene}</strong> · {geneData.values?.length?.toLocaleString() || 0} cell values</p>}
      </PanelBody></Panel>
      <Panel><PanelHeader title="Annotation export"/><PanelBody>
        <p className="omics-special__muted">Enter a JSON object of cell annotations. The viewer saves it as a registered annotation sidecar linked to this dataset.</p>
        <form onSubmit={exportAnnotations}><label className="omics-special__field">Annotations (JSON)<textarea className="omics-special__code" rows="12" value={annotationsText} onChange={event => setAnnotationsText(event.target.value)} spellCheck="false"/></label><button className="omics-special__button" disabled={busy}>Validate and export annotations</button></form>
      </PanelBody></Panel>
    </div>}
  </main>;
}

const CONFIG_DEFAULTS = { imputation: "none", imputation_constant: "0", normalization: "log2", replicate_aggregation: "none", fdr_cutoff: "0.05", lfc_cutoff: "1.0", modules: ["diffexp", "volcano", "heatmap"] };
const MODULES = [["diffexp", "Differential expression"], ["volcano", "Volcano plot"], ["heatmap", "Heatmap"], ["venn", "Venn diagram"], ["pathway", "Pathway enrichment"]];

export function ProteomicsReactRenderer() {
  const [step, setStep] = useState(1);
  const [source, setSource] = useState("upload");
  const [objects, setObjects] = useState([]);
  const [objectPaths, setObjectPaths] = useState({ expression: "", sample_sheet: "", diffexp: "" });
  const [files, setFiles] = useState({});
  const [preview, setPreview] = useState(null);
  const [cohort, setCohort] = useState(null);
  const [selection, setSelection] = useState({ conditions: [], states: [], mode: "pairwise_states", reference_state: "" });
  const [comparisons, setComparisons] = useState([]);
  const [cohortWarnings, setCohortWarnings] = useState([]);
  const [config, setConfig] = useState(CONFIG_DEFAULTS);
  const [runId, setRunId] = useState("");
  const [runStatus, setRunStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [runOutputs, setRunOutputs] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadObjects = useCallback(async () => {
    try { const payload = await requestJson("/plugins/proteomics/api/ui/objects/"); setObjects(payload.objects || []); }
    catch { setObjects([]); }
  }, []);
  useEffect(() => { loadObjects(); }, [loadObjects]);

  useEffect(() => {
    if (!runId || !runStatus || ["COMPLETED", "COMPLETE", "FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(runStatus.state)) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await requestJson(`/plugins/proteomics/api/ui/run/${encodeURIComponent(runId)}/status/`);
        if (!cancelled) { setRunStatus(status); setLogs(status.logs || []); setRunOutputs(status.outputs || []); }
      } catch (e) { if (!cancelled) setError(e.message); }
    };
    poll();
    const timer = window.setInterval(poll, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [runId, runStatus?.state]);

  async function action(fn) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function toggleSelection(key, value) {
    setSelection(previous => ({ ...previous, [key]: previous[key].includes(value) ? previous[key].filter(x => x !== value) : [...previous[key], value] }));
  }
  async function loadAndPreview(event) {
    event.preventDefault();
    await action(async () => {
      const form = new FormData(); form.append("source", source);
      if (source === "upload") {
        if (!files.expression_file || !files.sample_sheet_file) throw new Error("Expression matrix and sample sheet are required.");
        form.append("expression_file", files.expression_file); form.append("sample_sheet_file", files.sample_sheet_file);
        if (files.diffexp_file) form.append("diffexp_file", files.diffexp_file);
      } else {
        form.append("expression_object_path", objectPaths.expression); form.append("sample_sheet_object_path", objectPaths.sample_sheet);
        form.append("diffexp_object_path", objectPaths.diffexp);
      }
      const payload = await requestJson("/plugins/proteomics/load/", { method: "POST", formData: form });
      setPreview(payload);
      const next = await requestJson("/plugins/proteomics/api/ui/cohort/");
      setCohort(next);
      const saved = next.selection || {};
      setSelection({ conditions: saved.conditions || next.conditions, states: saved.states || (next.has_state ? next.states : ["(all)"]), mode: saved.mode || next.default_mode, reference_state: saved.reference_state || next.default_ref });
      setComparisons(next.comparisons || []); setStep(2);
    });
  }
  async function saveCohort(event) {
    event.preventDefault();
    await action(async () => {
      const payload = await requestJson("/plugins/proteomics/api/ui/cohort/", { method: "POST", body: selection });
      setComparisons(payload.comparisons || []);
      setCohortWarnings(payload.warnings || []);
      const configPayload = await requestJson("/plugins/proteomics/api/ui/configure/");
      setConfig(configPayload.config || CONFIG_DEFAULTS); setStep(3);
    });
  }
  async function saveConfig(event) {
    event.preventDefault();
    await action(async () => {
      const payload = await requestJson("/plugins/proteomics/api/ui/configure/", { method: "POST", body: config });
      setConfig(payload.config); setStep(4);
    });
  }
  async function submitRun() {
    await action(async () => {
      const created = await requestJson("/plugins/proteomics/api/ui/run-spec/", { method: "POST", body: {} });
      setRunId(created.run_id); setRunOutputs([]); setLogs([]);
      const started = await requestJson(`/plugins/proteomics/api/ui/run/${encodeURIComponent(created.run_id)}/execute/`, { method: "POST", body: {} });
      setRunStatus({ state: started.state });
    });
  }

  return <main className="omics-special" data-plugin="proteomics">
    <Panel><PanelHeader title="⚗️ Proteomics Analysis"><span className="omics-special__badge">Proteomics · four-step React workflow</span></PanelHeader>
      <PanelBody><p className="omics-special__intro">Prepare an intensity matrix and sample sheet, define cohort comparisons, choose preprocessing and analysis modules, then run and monitor the workflow.</p>
        <div className="omics-special__stepper" aria-label="Proteomics workflow steps">{["Data", "Cohorts", "Configure", "Run"].map((label, index) => <button key={label} type="button" className={step === index + 1 ? "is-current" : step > index + 1 ? "is-done" : ""} onClick={() => index < step - 1 && setStep(index + 1)}><span>{index + 1}</span>{label}</button>)}</div>
        <Notice error={error}/>
      </PanelBody>
    </Panel>
    {step === 1 && <Panel><PanelHeader title="1 · Load and preview data"/><PanelBody>
      <div className="omics-special__tabs"><button type="button" className={source === "upload" ? "is-active" : ""} onClick={() => setSource("upload")}>Upload files</button><button type="button" className={source === "omniobject" ? "is-active" : ""} onClick={() => setSource("omniobject")}>Workbench objects</button></div>
      <form onSubmit={loadAndPreview} className="omics-special__form-grid">
        {source === "upload" ? <><FileInput label="Expression matrix (TSV, CSV, XLSX)" required onChange={file => setFiles(p => ({ ...p, expression_file: file }))}/><FileInput label="Sample sheet (TSV or CSV)" required onChange={file => setFiles(p => ({ ...p, sample_sheet_file: file }))}/><FileInput label="Differential-expression table (optional)" onChange={file => setFiles(p => ({ ...p, diffexp_file: file }))}/></> : <>{["expression", "sample_sheet", "diffexp"].map(kind => <label className="omics-special__field" key={kind}>{kind === "sample_sheet" ? "Sample sheet" : kind === "diffexp" ? "Differential-expression table (optional)" : "Expression matrix"}<select required={kind !== "diffexp"} value={objectPaths[kind]} onChange={event => setObjectPaths(p => ({ ...p, [kind]: event.target.value }))}><option value="">Choose registered object…</option>{objects.filter(object => kind === "sample_sheet" ? [".csv", ".tsv"].includes(object.ext) : kind === "expression" ? [".csv", ".tsv", ".xlsx"].includes(object.ext) : [".csv", ".tsv"].includes(object.ext)).map(object => <option key={object.path} value={object.path}>{object.name} ({object.ext})</option>)}</select></label>)}</>}
        <button className="omics-special__button" disabled={busy}>Load &amp; preview</button>
      </form>
      {preview && <PreviewSummary preview={preview}/>}
    </PanelBody></Panel>}
    {step === 2 && cohort && <Panel><PanelHeader title="2 · Select cohorts and comparisons"/><PanelBody>
      <form onSubmit={saveCohort}>
        <ChoiceGroup title="Conditions" values={cohort.conditions} selected={selection.conditions} onToggle={value => toggleSelection("conditions", value)}/>
        {cohort.has_state && <ChoiceGroup title="States" values={cohort.states} selected={selection.states} onToggle={value => toggleSelection("states", value)}/>}
        {cohort.has_state && <div className="omics-special__form-grid"><label className="omics-special__field">Comparison strategy<select value={selection.mode} onChange={event => setSelection(p => ({ ...p, mode: event.target.value }))}><option value="reference_state">Compare each state to reference</option><option value="pairwise_states">All state pairs</option></select></label>{selection.mode === "reference_state" && <label className="omics-special__field">Reference state<select value={selection.reference_state} onChange={event => setSelection(p => ({ ...p, reference_state: event.target.value }))}>{cohort.states.map(value => <option key={value}>{value}</option>)}</select></label>}</div>}
        <div className="omics-special__actions"><button type="button" className="omics-special__button is-quiet" onClick={() => setStep(1)}>Back</button><button className="omics-special__button" disabled={busy}>Build comparisons and continue</button></div>
      </form>
      {comparisons.length > 0 && <ComparisonList comparisons={comparisons}/>}
      {cohortWarnings.length > 0 && <div className="omics-special__notice is-warning" role="status"><strong>Replicate warnings</strong><ul>{cohortWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
      <GroupGrid grid={cohort.grid}/>
    </PanelBody></Panel>}
    {step === 3 && <Panel><PanelHeader title="3 · Preprocessing and analysis modules"/><PanelBody>
      <form onSubmit={saveConfig} className="omics-special__form-grid">
        <SelectField label="Imputation" value={config.imputation} values={[["none", "None"], ["mean", "Mean"], ["median", "Median"], ["constant", "Constant"]]} onChange={value => setConfig(p => ({ ...p, imputation: value }))}/>
        {config.imputation === "constant" && <TextField label="Imputation constant" value={config.imputation_constant} onChange={value => setConfig(p => ({ ...p, imputation_constant: value }))}/>}
        <SelectField label="Normalization" value={config.normalization} values={[["none", "None"], ["log2", "Log2 transform"], ["median_center", "Median centering"], ["log2_median_center", "Log2 + median centering"]]} onChange={value => setConfig(p => ({ ...p, normalization: value }))}/>
        <SelectField label="Replicate aggregation" value={config.replicate_aggregation} values={[["none", "Keep replicates"], ["mean", "Mean"], ["median", "Median"]]} onChange={value => setConfig(p => ({ ...p, replicate_aggregation: value }))}/>
        <TextField label="FDR cutoff" value={config.fdr_cutoff} onChange={value => setConfig(p => ({ ...p, fdr_cutoff: value }))}/><TextField label="|log₂FC| cutoff" value={config.lfc_cutoff} onChange={value => setConfig(p => ({ ...p, lfc_cutoff: value }))}/>
        <fieldset className="omics-special__modules"><legend>Analysis modules</legend>{MODULES.map(([value, label]) => <label key={value}><input type="checkbox" checked={config.modules.includes(value)} onChange={() => setConfig(p => ({ ...p, modules: p.modules.includes(value) ? p.modules.filter(m => m !== value) : [...p.modules, value] }))}/>{label}</label>)}<small>Venn requires two comparisons; pathway enrichment requires differential expression.</small></fieldset>
        <div className="omics-special__actions"><button type="button" className="omics-special__button is-quiet" onClick={() => setStep(2)}>Back</button><button className="omics-special__button" disabled={busy}>Save configuration and continue</button></div>
      </form>
    </PanelBody></Panel>}
    {step === 4 && <Panel><PanelHeader title="4 · Run and monitor"/><PanelBody>
      <div className="omics-special__run-summary"><p><strong>Comparisons:</strong> {comparisons.length}</p><p><strong>Modules:</strong> {config.modules.join(", ")}</p><p><strong>Normalization:</strong> {config.normalization}</p></div>
      {!runId ? <div className="omics-special__actions"><button type="button" className="omics-special__button is-quiet" onClick={() => setStep(3)}>Back</button><button type="button" className="omics-special__button" disabled={busy} onClick={submitRun}>Create run and start analysis</button></div> : <><div className="omics-special__stats"><div><strong>{runStatus?.state || "QUEUED"}</strong><span>Run status</span></div><div><strong>{runId}</strong><span>Run ID</span></div></div>{runStatus?.detail && <p className="omics-special__muted">{runStatus.detail}</p>}<pre className="omics-special__logs">{logs.length ? logs.join("\n") : "Waiting for runner output…"}</pre>{runOutputs.length > 0 && <section className="omics-special__comparison"><h3>Run outputs</h3><ul>{runOutputs.map(output => <li key={output.rel}><a href={pluginEndpoint(`/plugins/proteomics/download/${encodeURIComponent(runId)}/?p=${encodeURIComponent(output.rel)}`)}>{output.name}</a> <span className="omics-special__muted">{output.rel}</span></li>)}</ul></section>}<button type="button" className="omics-special__button is-quiet" onClick={() => { setRunId(""); setRunStatus(null); setLogs([]); setRunOutputs([]); }}>Start another run</button></>}
    </PanelBody></Panel>}
  </main>;
}

function FileInput({ label, required = false, onChange }) { return <label className="omics-special__field">{label}{required && <span aria-hidden="true"> *</span>}<input type="file" required={required} accept=".tsv,.csv,.xlsx" onChange={event => onChange(event.target.files?.[0] || null)}/></label>; }
function TextField({ label, value, onChange }) { return <label className="omics-special__field">{label}<input value={value} onChange={event => onChange(event.target.value)}/></label>; }
function SelectField({ label, value, values, onChange }) { return <label className="omics-special__field">{label}<select value={value} onChange={event => onChange(event.target.value)}>{values.map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select></label>; }
function PreviewSummary({ preview }) {
  const summary = preview.expression?.summary || {};
  const validation = preview.sample_sheet?.validation || {};
  const crosscheck = preview.crosscheck || {};
  return <div className="omics-special__preview"><div className="omics-special__stats"><div><strong>{summary.n_features?.toLocaleString() || "—"}</strong><span>Features</span></div><div><strong>{summary.n_samples?.toLocaleString() || "—"}</strong><span>Expression samples</span></div><div><strong>{validation.n_samples_meta?.toLocaleString() || "—"}</strong><span>Metadata samples</span></div><div><strong>{crosscheck.overlap_count ?? "—"}</strong><span>Matched IDs</span></div></div><p>{validation.ok ? `Conditions: ${validation.conditions.join(", ")}` : validation.error || "Sample sheet validation pending."}</p></div>;
}
function ChoiceGroup({ title, values, selected, onToggle }) { return <fieldset className="omics-special__choices"><legend>{title}</legend>{values.map(value => <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)}/>{value}</label>)}</fieldset>; }
function ComparisonList({ comparisons }) { return <section className="omics-special__comparison"><h3>Planned comparisons ({comparisons.length})</h3><ul>{comparisons.map((item, index) => <li key={`${item.label}-${index}`}>{item.label || `${item.condition}: ${item.state_a} vs ${item.state_b}`}</li>)}</ul></section>; }
function GroupGrid({ grid = {} }) { return <section className="omics-special__comparison"><h3>Sample counts</h3><div className="omics-special__table-wrap"><table><thead><tr><th>Condition</th>{[...new Set(Object.values(grid).flatMap(states => Object.keys(states)))].map(state => <th key={state}>{state}</th>)}</tr></thead><tbody>{Object.entries(grid).map(([condition, states]) => <tr key={condition}><th>{condition}</th>{[...new Set(Object.values(grid).flatMap(values => Object.keys(values)))].map(state => <td key={state}>{states[state] || 0}</td>)}</tr>)}</tbody></table></div></section>; }
