import React, { useCallback, useEffect, useMemo, useState } from "react";
import { nativePluginRequest } from "../../lib/nativePluginApi";
import "./NativeAdminRenderers.css";

const TARGET_KEY = "workflow_runner.exec_target";
const PROVIDER_KEY = "workflow_runner.exec_provider";
const SCHEDULER_KEY = "workflow_runner.exec_scheduler";
const TES_PROFILE_KEY = "workflow_runner.tes_profile";
const queryAtLoad = new URLSearchParams(window.location.search);
const initialTarget = () => ["local", "tes", "cloud", "hpc", "k8s"].includes(queryAtLoad.get("exec_target") || localStorage.getItem(TARGET_KEY))
  ? (queryAtLoad.get("exec_target") || localStorage.getItem(TARGET_KEY)) : "local";

function setQuery(values) {
  const params = new URLSearchParams(window.location.search);
  Object.entries(values).forEach(([key, value]) => value ? params.set(key, String(value)) : params.delete(key));
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
}

function runReturnTo(raw, runId) {
  if (!raw) return "";
  const expanded = raw.replaceAll("{run_id}", encodeURIComponent(runId));
  try {
    const url = new URL(expanded, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : "";
  } catch { return ""; }
}

export default function WorkflowRunnerRenderer() {
  const lockedCategory = ["1", "true", "yes", "on"].includes(queryAtLoad.get("pinned") || "");
  const returnTo = queryAtLoad.get("return_to") || "";
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState(queryAtLoad.get("category") || "circrna");
  const [engines, setEngines] = useState([]);
  const [engine, setEngine] = useState("");
  const [workflows, setWorkflows] = useState([]);
  const [workflowId, setWorkflowId] = useState(queryAtLoad.get("workflow_id") || "");
  const [step, setStep] = useState(queryAtLoad.get("run_id") ? "run" : queryAtLoad.get("workflow_id") ? "configure" : "select");
  const [execTarget, setExecTarget] = useState(initialTarget);
  const [execProvider, setExecProvider] = useState(queryAtLoad.get("exec_provider") || localStorage.getItem(PROVIDER_KEY) || "aws");
  const [execScheduler, setExecScheduler] = useState(queryAtLoad.get("exec_scheduler") || localStorage.getItem(SCHEDULER_KEY) || "slurm");
  const [tesProfile, setTesProfile] = useState(queryAtLoad.get("tes_profile") || localStorage.getItem(TES_PROFILE_KEY) || "");
  const [inputJson, setInputJson] = useState("");
  const [selectedPreview, setSelectedPreview] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runId, setRunId] = useState(queryAtLoad.get("run_id") || "");
  const [runStatus, setRunStatus] = useState({});
  const [logs, setLogs] = useState([]);
  const [tailLines, setTailLines] = useState(300);
  const [paused, setPaused] = useState(false);
  const [files, setFiles] = useState([]);
  const [normalized, setNormalized] = useState(null);
  const [attachResult, setAttachResult] = useState("");

  const selectedWorkflow = useMemo(() => workflows.find(item => String(item.id) === workflowId) || null, [workflows, workflowId]);

  const loadCategories = useCallback(async signal => {
    setLoading(true); setError("");
    try {
      const result = await nativePluginRequest("/plugins/workflow_runner/api/workflow-catalog/categories", { signal });
      const list = Array.isArray(result) ? result : [];
      setCategories(list);
      const preferred = queryAtLoad.get("category") || category;
      if (list.length && !list.includes(category)) setCategory(list.includes(preferred) ? preferred : list[0]);
      setStatusMessage(list.length ? "" : "No categories found in the Workflow Registry.");
    } catch (failure) { if (failure.name !== "AbortError") setError(failure.message || "Could not load workflow categories."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [category]);

  useEffect(() => { const controller = new AbortController(); loadCategories(controller.signal); return () => controller.abort(); }, [loadCategories]);

  useEffect(() => {
    if (!category || step !== "select") return undefined;
    const controller = new AbortController();
    setEngine(""); setWorkflows([]); setWorkflowId(""); setSelectedPreview(null);
    nativePluginRequest(`/plugins/workflow_runner/api/workflow-catalog/engines?category=${encodeURIComponent(category)}`, { signal: controller.signal })
      .then(result => setEngines(Array.isArray(result) ? result : []))
      .catch(failure => { if (failure.name !== "AbortError") setError(failure.message || "Could not load workflow engines."); });
    return () => controller.abort();
  }, [category, step]);

  useEffect(() => {
    if (!category || !engine || step !== "select") { setWorkflows([]); return undefined; }
    const controller = new AbortController();
    nativePluginRequest(`/plugins/workflow_runner/api/workflow-catalog/workflows?category=${encodeURIComponent(category)}&engine=${encodeURIComponent(engine)}`, { signal: controller.signal })
      .then(result => setWorkflows(Array.isArray(result) ? result : []))
      .catch(failure => { if (failure.name !== "AbortError") setError(failure.message || "Could not load registered workflows."); });
    return () => controller.abort();
  }, [category, engine, step]);

  useEffect(() => {
    localStorage.setItem(TARGET_KEY, execTarget); localStorage.setItem(PROVIDER_KEY, execProvider);
    localStorage.setItem(SCHEDULER_KEY, execScheduler); localStorage.setItem(TES_PROFILE_KEY, tesProfile);
    setQuery({ category, exec_target: execTarget, exec_provider: execTarget === "cloud" ? execProvider : "",
      exec_scheduler: execTarget === "hpc" ? execScheduler : "", tes_profile: execTarget === "tes" ? tesProfile : "", return_to: returnTo || "" });
  }, [category, execTarget, execProvider, execScheduler, tesProfile, returnTo]);

  useEffect(() => {
    if (step !== "configure" || !workflowId || inputJson) return undefined;
    const controller = new AbortController(); setLoading(true); setError("");
    const params = new URLSearchParams({ format: "json", workflow_id: workflowId, category });
    nativePluginRequest(`/plugins/workflow_runner/configure/?${params.toString()}`, { signal: controller.signal })
      .then(result => setInputJson(JSON.stringify(result.input_json || {}, null, 2)))
      .catch(failure => { if (failure.name !== "AbortError") setError(failure.message || "Could not load the workflow's default inputs."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [step, workflowId, category]);

  const pollRun = useCallback(async signal => {
    if (!runId || paused) return;
    const [tail, fileResult, outputResult] = await Promise.allSettled([
      nativePluginRequest(`/plugins/workflow_runner/run/${encodeURIComponent(runId)}/tail/?n=${tailLines}`, { signal }),
      nativePluginRequest(`/plugins/workflow_runner/api/runs/${encodeURIComponent(runId)}/files`, { signal }),
      nativePluginRequest(`/plugins/workflow_runner/api/runs/${encodeURIComponent(runId)}/outputs/normalized`, { signal }),
    ]);
    if (signal?.aborted) return;
    if (tail.status === "fulfilled") { setRunStatus(tail.value.status || {}); setLogs(tail.value.lines || []); }
    else if (tail.reason?.name !== "AbortError") setError(tail.reason?.message || "Could not refresh run status.");
    if (fileResult.status === "fulfilled") setFiles(fileResult.value.files || []);
    if (outputResult.status === "fulfilled") setNormalized(outputResult.value);
  }, [runId, paused, tailLines]);

  useEffect(() => {
    if (step !== "run" || !runId || paused) return undefined;
    const controller = new AbortController(); let timer;
    const tick = async () => { await pollRun(controller.signal); if (!controller.signal.aborted) timer = setTimeout(tick, 2500); };
    tick(); return () => { controller.abort(); clearTimeout(timer); };
  }, [step, runId, paused, pollRun]);

  async function beginConfiguration() {
    if (!workflowId) return;
    setQuery({ workflow_id: workflowId, category, exec_target: execTarget, exec_provider: execTarget === "cloud" ? execProvider : "",
      exec_scheduler: execTarget === "hpc" ? execScheduler : "", tes_profile: execTarget === "tes" ? tesProfile : "", return_to: returnTo });
    setInputJson(""); setStep("configure");
  }

  function validateInput(format = false) {
    try {
      const parsed = JSON.parse(inputJson);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Top-level JSON value must be an object.");
      if (format) setInputJson(JSON.stringify(parsed, null, 2));
      setStatusMessage(format ? "JSON formatted and valid." : "Input JSON is valid."); setError(""); return parsed;
    } catch (failure) { setError(failure.message || "Invalid JSON input."); setStatusMessage(""); return null; }
  }

  async function submitWorkflow(event) {
    event.preventDefault(); const parsed = validateInput(); if (!parsed) return;
    setSaving(true); setError("");
    try {
      const result = await nativePluginRequest("/plugins/workflow_runner/configure/?format=json", { method: "POST", body: {
        workflow_id: workflowId, category, input_json: parsed, exec_target: execTarget, exec_provider: execProvider,
        exec_scheduler: execScheduler, tes_profile: tesProfile, return_to: returnTo,
      } });
      setRunId(result.run_id); setRunStatus({ state: result.state || "QUEUED", progress: 0 }); setLogs([]); setStep("run");
      setQuery({ run_id: result.run_id, workflow_id: workflowId, category, exec_target: execTarget,
        exec_provider: execTarget === "cloud" ? execProvider : "", exec_scheduler: execTarget === "hpc" ? execScheduler : "",
        tes_profile: execTarget === "tes" ? tesProfile : "", return_to: returnTo });
    } catch (failure) { setError(failure.message || "Could not start the workflow."); }
    finally { setSaving(false); }
  }

  async function cancelRun() {
    if (!window.confirm("Request cancellation for this workflow run?")) return;
    try { const result = await nativePluginRequest(`/plugins/workflow_runner/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", body: {} });
      setRunStatus(current => ({ ...current, state: result.state || "CANCELLING" })); setStatusMessage("Cancellation requested."); }
    catch (failure) { setError(failure.message || "Could not cancel this run."); }
  }

  async function attachOutputs(mode) {
    setAttachResult(""); setError("");
    try { const result = await nativePluginRequest(`/plugins/workflow_runner/api/runs/${encodeURIComponent(runId)}/attach_outputs`, { method: "POST", body: { mode } });
      setAttachResult(JSON.stringify(result, null, 2)); }
    catch (failure) { setError(failure.message || "Could not attach outputs."); }
  }

  const returnLink = runReturnTo(returnTo, runId);
  const isActive = !["COMPLETED", "FAILED", "CANCELED", "CANCELLED"].includes(String(runStatus.state || "").toUpperCase());

  if (step === "run") return <section className="native-admin-page" aria-label="Workflow Runner">
    <header className="native-admin-heading"><div><span className="native-admin-eyebrow">WORKFLOW EXECUTION</span><h2>Run Workspace</h2><p>Live status, logs, normalized outputs, and files for this run.</p></div>
      <button className="omni-btn omni-btn--secondary" type="button" onClick={() => { setStep("select"); setRunId(""); setQuery({ run_id: "" }); }}>Back to workflows</button></header>
    {error && <p className="plugin-error" role="alert">{error}</p>}{statusMessage && <p className="native-admin-success" role="status">{statusMessage}</p>}
    <div className="native-admin-run-metrics"><article><span>Run ID</span><strong>{runId}</strong></article><article><span>State</span><strong>{runStatus.state || "Loading…"}</strong></article>
      <article><span>Progress</span><strong>{runStatus.progress ?? 0}%</strong></article><article><span>Updated</span><strong>{runStatus.updated_at || "—"}</strong></article></div>
    <div className="native-workflow-layout"><div className="native-admin-workflow-card">
      <h3>Log tail (live)</h3><div className="native-admin-run-controls"><label>Lines<select value={tailLines} onChange={event => setTailLines(Number(event.target.value))}><option value={50}>Last 50</option><option value={150}>Last 150</option><option value={300}>Last 300</option><option value={800}>Last 800</option></select></label>
        <button className="omni-btn omni-btn--secondary" type="button" onClick={() => setPaused(value => !value)}>{paused ? "Resume" : "Pause"}</button>
        <button className="omni-btn omni-btn--secondary" type="button" onClick={() => setLogs([])}>Clear</button>
        {isActive && <button className="omni-btn omni-btn--danger" type="button" onClick={cancelRun}>Cancel run</button>}
        {returnLink && <a className="omni-btn omni-btn--secondary" href={returnLink}>{String(runStatus.state || "").toUpperCase() === "COMPLETED" ? "Continue to plugin" : "Back to plugin"}</a>}</div>
      <pre className="native-admin-preview" aria-label="Workflow run log">{logs.join("\n") || "Waiting for logs…"}</pre>
    </div><div className="native-admin-workflow-card"><h3>Normalized outputs</h3>
      <p>{normalized?.exists ? `${normalized.relpath} · ${normalized.size_bytes ?? 0} bytes` : normalized ? "Outputs are not available yet." : "Loading output status…"}</p>
      <pre className="native-admin-preview">{normalized?.preview || "Not available yet…"}</pre>
      <div className="native-admin-run-controls"><button className="omni-btn omni-btn--primary" type="button" disabled={!normalized?.exists} onClick={() => attachOutputs("reference")}>Attach outputs (reference)</button>
        <button className="omni-btn omni-btn--secondary" type="button" disabled={!normalized?.exists} onClick={() => attachOutputs("copy")}>Attach outputs (copy)</button></div>
      {attachResult && <pre className="native-admin-preview" role="status">{attachResult}</pre>}
      <h3>Run files</h3>{files.length ? <ul className="native-admin-run-files">{files.map(path => <li key={path}><code>{path}</code></li>)}</ul> : <p>No run files found yet.</p>}
    </div></div>
  </section>;

  if (step === "configure") return <section className="native-admin-page" aria-label="Workflow Runner Configure Inputs">
    <header className="native-admin-heading"><div><span className="native-admin-eyebrow">WORKFLOW CONFIGURATION</span><h2>Configure Inputs</h2><p>Review and customize the registered workflow inputs before execution.</p></div>
      <button className="omni-btn omni-btn--secondary" type="button" onClick={() => { setStep("select"); setInputJson(""); }}>Back</button></header>
    <div className="native-admin-workflow-card"><p>Workflow <code>{workflowId}</code> · Category <code>{category}</code> · Target <code>{execTarget}</code></p>
      <form className="native-admin-input-editor" onSubmit={submitWorkflow}><label htmlFor="workflow-input-json">Workflow input JSON</label>
        <textarea id="workflow-input-json" spellCheck="false" value={inputJson} onChange={event => setInputJson(event.target.value)} placeholder={loading ? "Loading workflow defaults…" : "{}"} />
        <p>Top-level value must be an object; comments are not allowed in JSON.</p>
        <div className="native-admin-workflow-actions"><span aria-live="polite">{statusMessage}</span><div className="native-admin-run-controls">
          <button className="omni-btn omni-btn--secondary" type="button" onClick={() => validateInput(true)}>Format JSON</button>
          <button className="omni-btn omni-btn--secondary" type="button" onClick={() => validateInput()}>Validate</button>
          <button className="omni-btn omni-btn--primary" type="submit" disabled={loading || saving || !inputJson}>{saving ? "Starting…" : "Start workflow"}</button>
        </div></div>
      </form>
    </div>{error && <p className="plugin-error" role="alert">{error}</p>}
  </section>;

  return <section className="native-admin-page" aria-label="Workflow Runner">
    <header className="native-admin-heading"><div><span className="native-admin-eyebrow">REGISTRY-BACKED EXECUTION</span><h2>Workflow Runner</h2><p>Select a category, engine, and registered workflow version. Configure inputs before launching.</p></div>
      <div className="native-admin-run-controls"><a className="omni-btn omni-btn--secondary" href="/plugins/workflow_registry_admin/">Registry Admin</a>
        {returnTo && runReturnTo(returnTo, "preview") && <a className="omni-btn omni-btn--secondary" href={runReturnTo(returnTo, "preview")}>Back to plugin</a>}
        <span className="native-admin-severity is-info">Target: {execTarget}{execTarget === "cloud" ? `/${execProvider}` : execTarget === "hpc" ? `/${execScheduler}` : execTarget === "tes" && tesProfile ? `/${tesProfile}` : ""}</span>
        <button className="omni-btn omni-btn--secondary" type="button" disabled={loading} onClick={() => loadCategories()}>Refresh</button></div></header>
    {error && <p className="plugin-error" role="alert">{error}</p>}{statusMessage && <p className="native-admin-success" role="status">{statusMessage}</p>}
    <div className="native-workflow-layout"><div className="native-admin-workflow-card"><h3>Execution target</h3>
      <div className="native-admin-workflow-target-options"><label>Target<select value={execTarget} onChange={event => { setExecTarget(event.target.value); setQuery({ exec_target: event.target.value }); }}>
        {[ ["local", "Local"], ["tes", "TES"], ["cloud", "Cloud"], ["hpc", "HPC"], ["k8s", "Kubernetes"] ].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {execTarget === "cloud" && <label>Cloud provider<select value={execProvider} onChange={event => setExecProvider(event.target.value)}><option value="aws">AWS</option><option value="azure">Azure</option></select></label>}
        {execTarget === "hpc" && <label>HPC scheduler<select value={execScheduler} onChange={event => setExecScheduler(event.target.value)}><option value="slurm">Slurm</option><option value="sge">SGE</option></select></label>}
        {execTarget === "tes" && <label>TES profile<input value={tesProfile} onChange={event => setTesProfile(event.target.value)} placeholder="Use configured default" /></label>}
      </div><p>Target settings are persisted in this browser and included with the run request.</p>
    </div><div className="native-admin-workflow-card"><h3>Choose workflow</h3>
      <div className="native-admin-workflow-grid">{!lockedCategory && <label>Category<select value={category} onChange={event => { setCategory(event.target.value); setQuery({ category: event.target.value }); }} disabled={!categories.length}>
        {!categories.length && <option value="">{loading ? "Loading categories…" : "No categories found"}</option>}{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
        {lockedCategory && <label>Category (pinned)<input value={category} readOnly /></label>}
        <label>Workflow engine<select value={engine} onChange={event => { setEngine(event.target.value); setQuery({ engine: event.target.value }); }} disabled={!engines.length}>
          <option value="">{engines.length ? "Select engine…" : "No engines found"}</option>{engines.map(value => <option key={value} value={value}>{String(value).toUpperCase()}</option>)}</select></label>
        <label>Workflow (version)<select value={workflowId} onChange={event => { const value = event.target.value; setWorkflowId(value); setSelectedPreview(workflows.find(item => String(item.id) === value) || null); setQuery({ workflow_id: value }); }} disabled={!workflows.length}>
          <option value="">{workflows.length ? "Select workflow…" : "Select an engine first…"}</option>{workflows.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      </div>
      <div className="native-admin-workflow-actions"><span>{workflows.length ? `${workflows.length} registered workflow(s)` : "Workflow versions load from the registry."}</span>
        <button className="omni-btn omni-btn--primary" type="button" disabled={!selectedWorkflow} onClick={beginConfiguration}>Continue to inputs</button></div>
    </div></div>
    <div className="native-admin-workflow-card"><h3>Selected workflow preview</h3><pre className="native-admin-preview">{selectedPreview ? JSON.stringify(selectedPreview, null, 2) : "None selected"}</pre></div>
  </section>;
}
