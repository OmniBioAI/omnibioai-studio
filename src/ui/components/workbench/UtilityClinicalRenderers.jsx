import React, { useEffect, useRef, useState } from "react";
import { nativePluginRequest } from "../../lib/nativePluginApi";
import { csrfToken, pluginEndpoint } from "../../lib/pluginApi";
import { Payload, UtilityPanel } from "./UtilityRegistryRenderers";
import "./UtilityRegistryRenderers.css";

function usePluginRun(slug) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(body) {
    setBusy(true); setError(""); setResult(null);
    try { setResult(await nativePluginRequest(`/plugins/${slug}/api/run/`, { method: "POST", body })); }
    catch (failure) { setError(failure.message || "Workbench operation failed."); }
    finally { setBusy(false); }
  }
  return { result, busy, error, submit };
}

function Result({ result, error, title = "Result" }) {
  return <><h3>{title}</h3>{error ? <p role="alert" className="utility-react__error">{error}</p> : result ? <Payload value={result}/> : <p className="utility-react__empty">Submit the form to see a result.</p>}</>;
}

export function SpatialImagingIoReactRenderer() {
  const [operation, setOperation] = useState("inspect");
  const [imageText, setImageText] = useState('{"name":"slide.ome.tif","width":2048,"height":2048,"channels":4,"z_slices":1,"timepoints":1,"pixel_size_um":0.5}');
  const [targetFormat, setTargetFormat] = useState("ome_zarr");
  const { result, busy, error, submit } = usePluginRun("spatial_imaging_io");
  async function run(event) {
    event.preventDefault();
    const body = { operation };
    if (operation !== "metadata") {
      try { body.image = JSON.parse(imageText); }
      catch { return; }
    }
    if (operation === "conversion_plan") body.target_format = targetFormat;
    await submit(body);
  }
  return <main className="utility-react" aria-label="Spatial Imaging I/O"><header className="utility-react__hero"><div><p>SPATIAL DATA · IMAGE METADATA</p><h1>Spatial Imaging I/O</h1><span>Inspect image metadata, list supported formats, or prepare a non-destructive conversion plan.</span></div></header>
    <div className="utility-react__grid"><UtilityPanel title="Image metadata"><form className="utility-react__form" onSubmit={run}>
      <label>Operation<select value={operation} onChange={event => setOperation(event.target.value)}><option value="inspect">Inspect image</option><option value="conversion_plan">Plan conversion</option><option value="metadata">Supported formats</option></select></label>
      {operation !== "metadata" && <label>Image JSON<textarea value={imageText} onChange={event => setImageText(event.target.value)} rows={10} spellCheck={false} required /></label>}
      {operation === "conversion_plan" && <label>Target format<select value={targetFormat} onChange={event => setTargetFormat(event.target.value)}>{[["ome_zarr", "OME-Zarr"], ["ome_tiff", "OME-TIFF"], ["dicom", "DICOM"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <button type="submit" disabled={busy}>{busy ? "Processing…" : operation === "metadata" ? "List formats" : operation === "conversion_plan" ? "Plan conversion" : "Inspect image"}</button>
    </form><p className="utility-react__empty">Only metadata and local-file checksums are processed; image pixels are not uploaded. Conversion plans are planning-only.</p></UtilityPanel>
      <UtilityPanel title="Inspection result"><Result result={result} error={error} title="Result"/></UtilityPanel></div>
  </main>;
}

export function FairDataPackagerReactRenderer() {
  const [packageText, setPackageText] = useState('{"title":"RNA-seq study","description":"","authors":["Research Team"],"artifacts":[]}');
  const { result, busy, error, submit } = usePluginRun("fair_data_packager");
  async function build(event) {
    event.preventDefault();
    try { await submit({ operation: "build_package", package: JSON.parse(packageText) }); }
    catch { /* JSON parse errors are shown below without sending malformed input. */ }
  }
  const invalidJson = (() => { try { JSON.parse(packageText); return false; } catch { return true; } })();
  return <main className="utility-react" aria-label="FAIR Data Packager"><header className="utility-react__hero"><div><p>REPRODUCIBILITY · FAIR DATA</p><h1>FAIR Data Packager</h1><span>Build a metadata package with RO-Crate provenance and integrity evidence.</span></div></header>
    <div className="utility-react__grid"><UtilityPanel title="Package metadata"><form className="utility-react__form" onSubmit={build}>
      <label>Package JSON<textarea value={packageText} onChange={event => setPackageText(event.target.value)} rows={14} spellCheck={false} required /></label>
      {invalidJson && <p role="alert" className="utility-react__error">Package metadata must be valid JSON.</p>}
      <button type="submit" disabled={busy || invalidJson}>{busy ? "Building…" : "Build FAIR package"}</button>
    </form><p className="utility-react__empty">The output includes metadata and SHA-256 manifest details. Source data is not published by this action.</p></UtilityPanel>
      <UtilityPanel title="Package result"><Result result={result} error={error}/></UtilityPanel></div>
  </main>;
}

export function PrivacyDeidentificationReactRenderer() {
  const [operation, setOperation] = useState("scan");
  const [payload, setPayload] = useState("");
  const [key, setKey] = useState("");
  const { result, busy, error, submit } = usePluginRun("privacy_deidentification");
  async function run(event) { event.preventDefault(); await submit({ operation, payload, ...(operation === "pseudonymize" ? { key } : {}) }); }
  return <main className="utility-react" aria-label="Privacy De-identification"><header className="utility-react__hero"><div><p>PRIVACY · PHI/PII HANDLING</p><h1>Privacy De-identification</h1><span>Scan, redact, or pseudonymize supplied text while keeping raw findings out of logs.</span></div></header>
    <div className="utility-react__grid"><UtilityPanel title="Privacy operation"><form className="utility-react__form" onSubmit={run}>
      <label>Operation<select value={operation} onChange={event => setOperation(event.target.value)}><option value="scan">Scan only</option><option value="redact">Redact matches</option><option value="pseudonymize">Pseudonymize matches</option></select></label>
      <label>Payload<textarea value={payload} onChange={event => setPayload(event.target.value)} rows={10} placeholder="Paste text or JSON here" required /></label>
      {operation === "pseudonymize" && <label>Pseudonymization key<input type="password" value={key} onChange={event => setKey(event.target.value)} autoComplete="off" required /></label>}
      <button type="submit" disabled={busy || !payload.trim() || (operation === "pseudonymize" && !key)}>{busy ? "Processing…" : "Process safely"}</button>
    </form><p className="utility-react__empty">Raw matches are not returned unnecessarily. Pseudonymization uses the explicit key only for this request.</p></UtilityPanel>
      <UtilityPanel title="Result"><Result result={result} error={error}/></UtilityPanel></div>
  </main>;
}

const DEFAULT_CONSENT = '{"consent_id":"C-2026-001","subject_id":"SUBJECT-REDACTED","version":"2.0","status":"active","scopes":["research","export"],"granted_at":"2026-01-01","expires_at":"2027-01-01"}';
export function ClinicalConsentManagerReactRenderer() {
  const [operation, setOperation] = useState("evaluate_access");
  const [consentText, setConsentText] = useState(DEFAULT_CONSENT);
  const [scope, setScope] = useState("research");
  const { result, busy, error, submit } = usePluginRun("clinical_consent_manager");
  async function run(event) {
    event.preventDefault(); const body = { operation };
    if (operation !== "metadata") {
      try { body.consent = JSON.parse(consentText); } catch { return; }
    }
    if (operation === "evaluate_access") body.requested_scope = scope;
    await submit(body);
  }
  const invalidJson = operation !== "metadata" && (() => { try { JSON.parse(consentText); return false; } catch { return true; } })();
  return <main className="utility-react" aria-label="Clinical Consent Manager"><header className="utility-react__hero"><div><p>CLINICAL GOVERNANCE · CONSENT POLICY</p><h1>Clinical Consent Manager</h1><span>Validate consent records or evaluate whether a requested research scope is authorized.</span></div></header>
    <div className="utility-react__grid"><UtilityPanel title="Consent decision"><form className="utility-react__form" onSubmit={run}>
      <label>Operation<select value={operation} onChange={event => setOperation(event.target.value)}><option value="evaluate_access">Evaluate access</option><option value="validate">Validate record</option><option value="metadata">Policy metadata</option></select></label>
      {operation !== "metadata" && <label>Consent JSON<textarea value={consentText} onChange={event => setConsentText(event.target.value)} rows={10} spellCheck={false} required /></label>}
      {operation === "evaluate_access" && <label>Requested scope<input value={scope} onChange={event => setScope(event.target.value)} required /></label>}
      {invalidJson && <p role="alert" className="utility-react__error">Consent record must be valid JSON.</p>}
      <button type="submit" disabled={busy || invalidJson || (operation === "evaluate_access" && !scope.trim())}>{busy ? "Checking…" : operation === "metadata" ? "Show metadata" : operation === "validate" ? "Validate record" : "Evaluate access"}</button>
    </form><p className="utility-react__empty">The policy decision remains server-authoritative; raw subject data is not stored in the run report.</p></UtilityPanel>
      <UtilityPanel title="Decision report"><Result result={result} error={error}/></UtilityPanel></div>
  </main>;
}

const DEFAULT_DATASET = '[{"id":"S1","sex":"F","age":42},{"id":"S1","sex":"X","age":200}]';
export function ClinicalDataQualityReactRenderer() {
  const [dataset, setDataset] = useState(DEFAULT_DATASET);
  const [required, setRequired] = useState('["id","sex","age"]');
  const [terminology, setTerminology] = useState('{"sex":["F","M"]}');
  const [ranges, setRanges] = useState('{"age":[0,120]}');
  const [localError, setLocalError] = useState("");
  const { result, busy, error, submit } = usePluginRun("clinical_data_quality_validator");
  async function validate(event) {
    event.preventDefault(); setLocalError("");
    try { await submit({ operation: "validate", dataset: JSON.parse(dataset), required: JSON.parse(required), terminology: JSON.parse(terminology), ranges: JSON.parse(ranges) }); }
    catch { setLocalError("Dataset and rule fields must contain valid JSON."); }
  }
  return <main className="utility-react" aria-label="Clinical Data Quality Validator"><header className="utility-react__hero"><div><p>CLINICAL DATA · QUALITY GATE</p><h1>Clinical Data Quality Validator</h1><span>Check completeness, terminology, numeric ranges, and duplicate records before downstream analysis.</span></div></header>
    <div className="utility-react__grid"><UtilityPanel title="Quality rules"><form className="utility-react__form" onSubmit={validate}>
      <label>Dataset JSON<textarea value={dataset} onChange={event => setDataset(event.target.value)} rows={8} spellCheck={false} required /></label>
      <label>Required fields (JSON)<textarea value={required} onChange={event => setRequired(event.target.value)} rows={3} spellCheck={false} required /></label>
      <label>Terminology (JSON)<textarea value={terminology} onChange={event => setTerminology(event.target.value)} rows={3} spellCheck={false} required /></label>
      <label>Numeric ranges (JSON)<textarea value={ranges} onChange={event => setRanges(event.target.value)} rows={3} spellCheck={false} required /></label>
      {(localError || error) && <p role="alert" className="utility-react__error">{localError || error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Validating…" : "Validate dataset"}</button>
    </form><p className="utility-react__empty">Raw rows are used for this request only and are not stored in run metadata.</p></UtilityPanel>
      <UtilityPanel title="Quality report"><Result result={result} error={localError || error} title="Findings"/></UtilityPanel></div>
  </main>;
}

export function ResourceCostEstimatorReactRenderer() {
  const [values, setValues] = useState({ tool: "", cpu: "4", memory_gb: "16", gpu: "0", runtime_minutes: "60", storage_gb: "10", backend: "local" });
  const { result, busy, error, submit } = usePluginRun("resource_cost_estimator");
  function set(key, value) { setValues(previous => ({ ...previous, [key]: value })); }
  async function estimate(event) {
    event.preventDefault();
    await submit({ operation: "estimate", parameters: { ...values, cpu: Number(values.cpu), memory_gb: Number(values.memory_gb), gpu: Number(values.gpu), runtime_minutes: Number(values.runtime_minutes), storage_gb: Number(values.storage_gb) } });
  }
  return <main className="utility-react" aria-label="Resource Cost Estimator"><header className="utility-react__hero"><div><p>WORKLOAD PLANNING · CAPACITY</p><h1>Resource &amp; Cost Estimator</h1><span>Estimate CPU, memory, GPU, storage, runtime, cost, and a suitable execution backend before launching a workflow.</span></div></header>
    <div className="utility-react__grid"><UtilityPanel title="Workload profile"><form className="utility-react__form" onSubmit={estimate}>
      <label>Tool or workload<input value={values.tool} onChange={event => set("tool", event.target.value)} required /></label>
      {[["cpu", "CPU cores"], ["memory_gb", "Memory (GB)"], ["gpu", "GPU count"], ["runtime_minutes", "Runtime (minutes)"], ["storage_gb", "Storage (GB)"]].map(([key, label]) => <label key={key}>{label}<input type="number" min="0" step="any" value={values[key]} onChange={event => set(key, event.target.value)} required /></label>)}
      <label>Backend<select value={values.backend} onChange={event => set("backend", event.target.value)}>{["auto", "local", "aws_batch", "slurm", "kubernetes"].map(value => <option key={value}>{value}</option>)}</select></label>
      <button type="submit" disabled={busy || !values.tool.trim()}>{busy ? "Estimating…" : "Estimate resources"}</button>
    </form><p className="utility-react__empty">Estimates are planning guidance, not billing records or a workflow submission.</p></UtilityPanel>
      <UtilityPanel title="Estimate"><Result result={result} error={error}/></UtilityPanel></div>
  </main>;
}

export function VoiceCommandReactRenderer() {
  const [commandText, setCommandText] = useState("");
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const recognition = useRef(null);
  const { result, busy, error, submit } = usePluginRun("voice_command");
  useEffect(() => () => { recognition.current?.stop(); }, []);
  function startListening() {
    setSpeechError("");
    const Engine = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Engine) { setSpeechError("Speech recognition is not available in this browser. Type a command below instead."); return; }
    try {
      const instance = new Engine(); instance.lang = "en-US"; instance.interimResults = true;
      instance.onresult = event => setCommandText(Array.from(event.results).map(row => row[0]?.transcript || "").join(" "));
      instance.onerror = event => { setSpeechError(event.error || "Speech recognition failed."); setListening(false); };
      instance.onend = () => setListening(false);
      recognition.current = instance; instance.start(); setListening(true);
    } catch (failure) { setSpeechError(failure.message || "Could not start speech recognition."); setListening(false); }
  }
  function stopListening() { recognition.current?.stop(); setListening(false); }
  async function processCommand(event) { event.preventDefault(); await submit({ command_text: commandText.trim() }); }
  return <main className="utility-react" aria-label="Voice Command"><header className="utility-react__hero"><div><p>HANDS-FREE CONTROL · SPEECH TO INTENT</p><h1>Voice Command</h1><span>Capture a spoken or typed command and review its parsed intent before taking any separate action.</span></div>
      <span aria-live="polite">{listening ? "Listening" : "Idle"}</span></header>
    {(speechError || error) && <p role="alert" className="utility-react__error">{speechError || error}</p>}
    <div className="utility-react__grid"><UtilityPanel title="Controls"><div className="utility-react__tabs"><button type="button" onClick={startListening} disabled={listening || busy}>Start listening</button><button type="button" onClick={stopListening} disabled={!listening}>Stop</button><button type="button" onClick={() => { setCommandText(""); setSpeechError(""); }} disabled={!commandText}>Clear</button></div>
      <form className="utility-react__form" onSubmit={processCommand}><label>Recognized command<textarea value={commandText} onChange={event => setCommandText(event.target.value)} rows={5} placeholder="Try ‘list available plugins’ or ‘show jobs’." required /></label><button type="submit" disabled={busy || !commandText.trim()}>{busy ? "Processing…" : "Process command"}</button></form>
      <p className="utility-react__empty">Commands are parsed for intent; the voice parser does not itself submit jobs, cancel runs, or change data.</p></UtilityPanel>
      <UtilityPanel title="Parsed command"><Result result={result} error={error}/></UtilityPanel></div>
  </main>;
}

export function DatasetIngestReactRenderer() {
  const [datasetName, setDatasetName] = useState("");
  const [workflow, setWorkflow] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function ingest(event) {
    event.preventDefault(); if (!file) return;
    setBusy(true); setError(""); setResult(null);
    const form = new FormData();
    form.append("dataset_name", datasetName.trim()); form.append("file", file);
    if (workflow.trim()) form.append("workflow", workflow.trim());
    try {
      const response = await fetch(pluginEndpoint("/plugins/dataset_ingest/api/ingest/"), {
        method: "POST", body: form, credentials: "same-origin",
        headers: { Accept: "application/json", "X-CSRFToken": csrfToken() },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Dataset ingest failed (${response.status}).`);
      setResult(payload);
    } catch (failure) { setError(failure.message || "Dataset ingest failed."); }
    finally { setBusy(false); }
  }
  return <main className="utility-react" aria-label="Dataset Ingest">
    <header className="utility-react__hero"><div><p>DATA FOUNDATION · INGESTION</p><h1>Dataset Ingest &amp; Validator</h1><span>Upload, version, and register a dataset, with an optional workflow trigger.</span></div></header>
    {error && <p role="alert" className="utility-react__error">{error}</p>}
    <UtilityPanel title="Ingest dataset"><form className="utility-react__form" onSubmit={ingest}>
      <label>Dataset name<input name="dataset_name" value={datasetName} onChange={event => setDatasetName(event.target.value)} required /></label>
      <label>Dataset file<input name="file" type="file" onChange={event => setFile(event.target.files?.[0] || null)} required /></label>
      <label>Workflow trigger (optional)<input name="workflow" value={workflow} onChange={event => setWorkflow(event.target.value)} /></label>
      <button type="submit" disabled={busy || !datasetName.trim() || !file}>{busy ? "Ingesting…" : "Ingest dataset"}</button>
    </form></UtilityPanel>
    {result && <UtilityPanel title="Dataset registered"><Payload value={result}/></UtilityPanel>}
  </main>;
}
