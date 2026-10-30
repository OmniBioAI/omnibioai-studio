import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Spinner } from "@omnibioai/ui";
import { Panel, PanelBody, PanelHeader, Select, Textarea } from "../UI";
import LogViewer from "./LogViewer";
import {
  cancelOrchestratorRun,
  dryRunOrchestrator,
  loadOrchestratorArtifacts,
  loadOrchestratorLog,
  loadOrchestratorRuns,
  loadOrchestratorStatus,
  loadOrchestratorStatusDetail,
  replayOrchestratorRun,
  submitOrchestratorRun,
} from "../../lib/orchestratorApi";
import "./MultiAgentOrchestratorRenderer.css";

const INITIAL_DAG = JSON.stringify({
  title: "New biological workflow",
  steps: [],
}, null, 2);
const TERMINAL = new Set(["COMPLETED", "COMPLETE", "FAILED", "ERROR", "CANCELLED", "CANCELED", "INVALID", "VALIDATED", "REJECTED"]);
const MODEL_OPTIONS = [
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { value: "deepseek-r1:70b", label: "DeepSeek R1 70B" },
  { value: "llama3.3:70b", label: "Llama 3.3 70B" },
];

function parseDag(source) {
  let dag;
  try { dag = JSON.parse(source); }
  catch (error) { throw new Error(`DAG JSON is invalid: ${error.message}`); }
  if (!dag || typeof dag !== "object" || Array.isArray(dag)) throw new Error("DAG must be a JSON object.");
  if (!Array.isArray(dag.steps) || dag.steps.length === 0) throw new Error("Add at least one step to the DAG.");
  return dag;
}

function statusTone(state) {
  const value = String(state || "").toUpperCase();
  if (["COMPLETED", "COMPLETE", "VALIDATED"].includes(value)) return "success";
  if (["FAILED", "ERROR", "INVALID", "REJECTED"].includes(value)) return "danger";
  if (["CANCELLED", "CANCELED"].includes(value)) return "muted";
  return "active";
}

function normalizeSteps(status, detail) {
  if (Array.isArray(detail?.steps) && detail.steps.length) return detail.steps;
  if (status?.steps && typeof status.steps === "object") {
    return Object.entries(status.steps).map(([name, stepStatus]) => ({ name, status: stepStatus }));
  }
  return [];
}

function DagPreview({ dag }) {
  if (!dag?.steps?.length) return <p className="orchestrator-empty">Add steps to preview the execution graph.</p>;
  return <ol className="orchestrator-dag" aria-label="DAG execution steps">
    {dag.steps.map((step, index) => {
      const id = step.step_id || `step-${index + 1}`;
      const dependencies = Array.isArray(step.depends_on) ? step.depends_on : [];
      return <li key={`${id}-${index}`}>
        <span className="orchestrator-step-index">{index + 1}</span>
        <span className="orchestrator-step-copy">
          <strong>{step.label || id}</strong>
          <span>{step.type || "unknown"}{step.plugin_slug ? ` · ${step.plugin_slug}` : step.tool_id ? ` · ${step.tool_id}` : ""}</span>
          {dependencies.length ? <small>After {dependencies.join(", ")}</small> : <small>Entry step</small>}
        </span>
      </li>;
    })}
  </ol>;
}

function RunSteps({ steps }) {
  if (!steps.length) return null;
  return <div className="orchestrator-run-steps" aria-label="Run steps">
    {steps.map((step, index) => <div key={`${step.name || step.step_id || index}`} className="orchestrator-run-step">
      <span>{step.name || step.step_id || `Step ${index + 1}`}</span>
      <Badge>{String(step.status || step.state || "queued")}</Badge>
      {step.detail ? <small>{step.detail}</small> : null}
    </div>)}
  </div>;
}

export default function MultiAgentOrchestratorRenderer() {
  const [dagText, setDagText] = useState(INITIAL_DAG);
  const [modelName, setModelName] = useState(MODEL_OPTIONS[0].value);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [status, setStatus] = useState(null);
  const [detail, setDetail] = useState(null);
  const [logs, setLogs] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [runs, setRuns] = useState([]);
  const [validation, setValidation] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);

  const parsedPreview = useMemo(() => {
    try {
      const value = JSON.parse(dagText);
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch { return null; }
  }, [dagText]);
  const state = String(status?.state || detail?.status?.state || "").toUpperCase();
  const steps = useMemo(() => normalizeSteps(status, detail), [status, detail]);

  const refreshHistory = useCallback(async signal => {
    try {
      const payload = await loadOrchestratorRuns({ signal });
      setRuns(Array.isArray(payload.runs) ? payload.runs : []);
    } catch (nextError) {
      if (nextError.name !== "AbortError") setError(nextError.message);
    } finally { setHistoryLoading(false); }
  }, []);

  const refreshRun = useCallback(async (runId, signal) => {
    const [statusResult, detailResult, logResult] = await Promise.allSettled([
      loadOrchestratorStatus(runId, { signal }),
      loadOrchestratorStatusDetail(runId, { signal }),
      loadOrchestratorLog(runId, { signal }),
    ]);
    if (statusResult.status === "fulfilled") setStatus(statusResult.value);
    else if (statusResult.reason?.name !== "AbortError") throw statusResult.reason;
    if (detailResult.status === "fulfilled") setDetail(detailResult.value);
    if (logResult.status === "fulfilled") setLogs(Array.isArray(logResult.value.lines) ? logResult.value.lines : []);
    const nextState = statusResult.status === "fulfilled" ? String(statusResult.value.state || "").toUpperCase() : "";
    if (["COMPLETED", "COMPLETE"].includes(nextState)) {
      try {
        const payload = await loadOrchestratorArtifacts(runId, { signal });
        setArtifacts(Array.isArray(payload.outputs) ? payload.outputs : []);
      } catch (artifactError) {
        if (artifactError.status !== 404 && artifactError.name !== "AbortError") throw artifactError;
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refreshHistory(controller.signal);
    return () => controller.abort();
  }, [refreshHistory]);

  useEffect(() => {
    if (!selectedRunId) return undefined;
    const controller = new AbortController();
    let timer;
    const poll = async () => {
      try {
        await refreshRun(selectedRunId, controller.signal);
      } catch (nextError) {
        if (nextError.name !== "AbortError") setError(nextError.message);
      }
    };
    poll();
    if (!TERMINAL.has(state)) timer = window.setInterval(poll, 2500);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [selectedRunId, state, refreshRun]);

  async function submit(event) {
    event.preventDefault();
    setError(""); setValidation(null);
    let dag;
    try { dag = parseDag(dagText); }
    catch (nextError) { setError(nextError.message); return; }
    setBusy("submit");
    try {
      const payload = await submitOrchestratorRun({ dag, modelName });
      const runId = payload.result?.run_id || payload.run_id;
      if (!runId) throw new Error("Workbench did not return a run identifier.");
      setSelectedRunId(runId);
      setStatus({ state: payload.result?.state || "RUNNING", run_id: runId });
      setDetail(null); setLogs([]); setArtifacts([]);
      await refreshHistory();
    } catch (nextError) { setError(nextError.message); }
    finally { setBusy(""); }
  }

  async function validateDag() {
    setError(""); setValidation(null);
    let dag;
    try { dag = parseDag(dagText); }
    catch (nextError) { setError(nextError.message); return; }
    setBusy("validate");
    try {
      const payload = await dryRunOrchestrator({ dag });
      setValidation(payload.result?.validation || payload.validation || null);
    } catch (nextError) { setError(nextError.message); }
    finally { setBusy(""); }
  }

  async function cancelRun() {
    if (!selectedRunId) return;
    setBusy("cancel"); setError("");
    try {
      const payload = await cancelOrchestratorRun(selectedRunId);
      setStatus(previous => ({ ...(previous || {}), state: payload.result?.state || "CANCELLED" }));
      await refreshHistory();
    } catch (nextError) { setError(nextError.message); }
    finally { setBusy(""); }
  }

  async function replayRun() {
    if (!selectedRunId) return;
    setBusy("replay"); setError("");
    try {
      const payload = await replayOrchestratorRun(selectedRunId);
      const runId = payload.new_run_id || payload.result?.run_id;
      if (!runId) throw new Error("Workbench did not return the replay run identifier.");
      setSelectedRunId(runId);
      setStatus({ state: payload.result?.state || "RUNNING", run_id: runId });
      setDetail(null); setLogs([]); setArtifacts([]);
      await refreshHistory();
    } catch (nextError) { setError(nextError.message); }
    finally { setBusy(""); }
  }

  function selectRun(runId) {
    setError(""); setValidation(null); setArtifacts([]); setLogs([]); setDetail(null); setStatus(null);
    setSelectedRunId(runId);
  }

  return <div className="orchestrator-native">
    {error ? <div className="orchestrator-alert" role="alert">{error}</div> : null}
    <div className="orchestrator-layout">
      <div className="orchestrator-main">
        <Panel>
          <PanelHeader title="Compose DAG"><Badge>React UI</Badge></PanelHeader>
          <PanelBody>
            <form onSubmit={submit} className="orchestrator-form">
              <label htmlFor="orchestrator-dag">Workflow plan (JSON)</label>
              <Textarea id="orchestrator-dag" rows={18} value={dagText} onChange={event => setDagText(event.target.value)} spellCheck={false} />
              <label htmlFor="orchestrator-model">Routing model</label>
              <Select id="orchestrator-model" value={modelName} onChange={event => setModelName(event.target.value)} options={MODEL_OPTIONS} />
              <div className="orchestrator-actions">
                <Button type="button" variant="ghost" onClick={validateDag} disabled={Boolean(busy)}>{busy === "validate" ? "Validating…" : "Validate"}</Button>
                <Button type="submit" disabled={Boolean(busy)}>{busy === "submit" ? "Starting…" : "Run workflow"}</Button>
              </div>
            </form>
            {validation ? <div className={`orchestrator-validation ${validation.valid ? "is-valid" : "is-invalid"}`} role="status">
              <strong>{validation.valid ? "DAG is valid" : "DAG needs changes"}</strong>
              {(validation.errors || []).map(message => <span key={message}>{message}</span>)}
              <small>{validation.step_count || 0} steps checked</small>
            </div> : null}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Execution graph" />
          <PanelBody><DagPreview dag={parsedPreview} /></PanelBody>
        </Panel>
      </div>

      <aside className="orchestrator-sidebar">
        <Panel>
          <PanelHeader title="Run history">
            <button type="button" className="orchestrator-refresh" onClick={() => refreshHistory()} aria-label="Refresh run history">↻</button>
          </PanelHeader>
          <PanelBody>
            {historyLoading ? <div className="orchestrator-loading"><Spinner /> Loading runs…</div>
              : runs.length === 0 ? <p className="orchestrator-empty">No orchestrator runs yet.</p>
                : <div className="orchestrator-history">{runs.map(run => <button type="button" key={run.run_id} className={selectedRunId === run.run_id ? "is-selected" : ""} onClick={() => selectRun(run.run_id)}>
                  <span>{run.run_id}</span><Badge>{run.status}</Badge>
                  <small>{run.created_at || "Time unavailable"}</small>
                </button>)}</div>}
          </PanelBody>
        </Panel>
      </aside>
    </div>

    {selectedRunId ? <Panel>
      <PanelHeader title={`Run · ${selectedRunId}`}><Badge>{state || "LOADING"}</Badge></PanelHeader>
      <PanelBody>
        <div className={`orchestrator-run-summary is-${statusTone(state)}`}>
          <div><strong>{state || "Loading"}</strong><span>{status?.error || detail?.status?.detail || "Run lifecycle and step output update automatically."}</span></div>
          {Number.isFinite(status?.progress) ? <div className="orchestrator-progress" aria-label={`${status.progress}% complete`}><span style={{ width: `${Math.max(0, Math.min(100, status.progress))}%` }} /></div> : null}
          <div className="orchestrator-actions">
            {!TERMINAL.has(state) ? <Button variant="ghost" onClick={cancelRun} disabled={Boolean(busy)}>{busy === "cancel" ? "Cancelling…" : "Cancel"}</Button> : null}
            {TERMINAL.has(state) ? <Button variant="ghost" onClick={replayRun} disabled={Boolean(busy)}>{busy === "replay" ? "Replaying…" : "Replay full DAG"}</Button> : null}
          </div>
        </div>
        <RunSteps steps={steps} />
        <LogViewer lines={logs} />
        {artifacts.length ? <div className="orchestrator-artifacts"><h3>Artifacts</h3>{artifacts.map((artifact, index) => <div key={`${artifact.path || artifact.label || index}`}><strong>{artifact.label || artifact.id || `Artifact ${index + 1}`}</strong><code>{artifact.path || "Managed by Workbench"}</code></div>)}</div> : null}
      </PanelBody>
    </Panel> : null}
  </div>;
}
