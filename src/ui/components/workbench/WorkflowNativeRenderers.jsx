import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Spinner } from "@omnibioai/ui";
import { Input, Panel, PanelBody, PanelHeader, Select, Textarea } from "../UI";
import { workflowBuilderApi, workflowCompilerApi } from "../../lib/workflowNativeApi";
import "./WorkflowNativeRenderers.css";

const EMPTY_SPEC = JSON.stringify({ nodes: [], edges: [], metadata: {} }, null, 2);
const EMPTY_DAG = JSON.stringify({ title: "Compiled workflow", steps: [] }, null, 2);
const EXECUTION_TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELED", "CANCELLED"]);

function jsonObject(source, label) {
  let value;
  try { value = JSON.parse(source); } catch (error) { throw new Error(`${label} is invalid JSON: ${error.message}`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  return value;
}

function Alert({ message }) {
  return message ? <div className="workflow-native-alert" role="alert">{message}</div> : null;
}

export function WorkflowBuilderRenderer() {
  const [name, setName] = useState("Untitled workflow");
  const [specText, setSpecText] = useState(EMPTY_SPEC);
  const [workflows, setWorkflows] = useState([]);
  const [paletteCount, setPaletteCount] = useState(null);
  const [execution, setExecution] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const preview = useMemo(() => {
    try { return jsonObject(specText, "Workflow specification"); } catch { return null; }
  }, [specText]);

  const refresh = useCallback(async signal => {
    const [saved, palette] = await Promise.all([workflowBuilderApi.list({ signal }), workflowBuilderApi.palette({ signal })]);
    setWorkflows(Array.isArray(saved.workflows) ? saved.workflows : []);
    setPaletteCount(Array.isArray(palette.items) ? palette.items.length : 0);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal).catch(next => { if (next.name !== "AbortError") setError(next.message); });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!execution?.exec_id || EXECUTION_TERMINAL.has(String(execution.status || "").toUpperCase())) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const value = await workflowBuilderApi.execution(execution.exec_id);
        if (active) setExecution(value);
      } catch (next) { if (active) setError(next.message); }
    };
    const timer = window.setInterval(poll, 2000); poll();
    return () => { active = false; window.clearInterval(timer); };
  }, [execution?.exec_id, execution?.status]);

  async function save() {
    setError(""); setNotice(""); setBusy("save");
    try {
      const spec = jsonObject(specText, "Workflow specification");
      await workflowBuilderApi.save(name, spec);
      setNotice(`Saved ${name}.`); await refresh();
    } catch (next) { setError(next.message); } finally { setBusy(""); }
  }

  async function load(savedName) {
    setError(""); setBusy("load");
    try {
      const payload = await workflowBuilderApi.get(savedName);
      setName(payload.workflow.name); setSpecText(JSON.stringify(payload.workflow.spec, null, 2)); setExecution(null);
    } catch (next) { setError(next.message); } finally { setBusy(""); }
  }

  async function remove(savedName) {
    setError(""); setBusy("delete");
    try { await workflowBuilderApi.remove(savedName); if (name === savedName) setName("Untitled workflow"); await refresh(); }
    catch (next) { setError(next.message); } finally { setBusy(""); }
  }

  async function execute() {
    setError(""); setNotice(""); setBusy("execute");
    try {
      const spec = jsonObject(specText, "Workflow specification");
      await workflowBuilderApi.save(name, spec);
      const payload = await workflowBuilderApi.execute(name);
      setExecution(payload); setNotice(`Execution ${payload.exec_id} submitted.`); await refresh();
    } catch (next) { setError(next.message); } finally { setBusy(""); }
  }

  async function cancel() {
    if (!execution?.exec_id) return;
    setBusy("cancel"); setError("");
    try { setExecution(await workflowBuilderApi.cancel(execution.exec_id)); }
    catch (next) { setError(next.message); } finally { setBusy(""); }
  }

  return <div className="workflow-native">
    <Alert message={error} />{notice ? <div className="workflow-native-notice" role="status">{notice}</div> : null}
    <div className="workflow-native-grid">
      <div className="workflow-native-main">
        <Panel><PanelHeader title="Workflow definition"><Badge>{paletteCount === null ? "Loading palette" : `${paletteCount} plugins available`}</Badge></PanelHeader><PanelBody>
          <div className="workflow-native-form">
            <label htmlFor="workflow-name">Workflow name</label><Input id="workflow-name" value={name} onChange={event => setName(event.target.value)} />
            <label htmlFor="workflow-spec">Nodes, edges, and metadata (JSON)</label><Textarea id="workflow-spec" rows={20} value={specText} onChange={event => setSpecText(event.target.value)} spellCheck={false} />
            <div className="workflow-native-actions"><Button variant="ghost" onClick={save} disabled={Boolean(busy)}>{busy === "save" ? "Saving…" : "Save"}</Button><Button onClick={execute} disabled={Boolean(busy)}>{busy === "execute" ? "Starting…" : "Save and execute"}</Button></div>
          </div>
        </PanelBody></Panel>
        <Panel><PanelHeader title="Graph preview" /><PanelBody>
          <div className="workflow-graph-summary"><span><strong>{preview?.nodes?.length || 0}</strong> nodes</span><span><strong>{preview?.edges?.length || 0}</strong> edges</span></div>
          {(preview?.nodes || []).length ? <div className="workflow-node-list">{preview.nodes.map((node, index) => <div key={node.id || index}><strong>{node.label || node.id || `Node ${index + 1}`}</strong><span>{node.type || node.plugin || "Unassigned plugin"}</span></div>)}</div> : <p className="workflow-native-empty">Add nodes in the workflow JSON to preview them.</p>}
        </PanelBody></Panel>
      </div>
      <aside><Panel><PanelHeader title="Saved workflows" /><PanelBody>
        {!workflows.length ? <p className="workflow-native-empty">No saved workflows.</p> : <div className="workflow-saved-list">{workflows.map(item => <div key={item.name}><button type="button" onClick={() => load(item.name)}>{item.name}</button><button type="button" aria-label={`Delete ${item.name}`} onClick={() => remove(item.name)}>×</button></div>)}</div>}
      </PanelBody></Panel></aside>
    </div>
    {execution ? <Panel><PanelHeader title={`Execution · ${execution.exec_id}`}><Badge>{execution.status}</Badge></PanelHeader><PanelBody>
      {execution.error ? <p className="workflow-native-error">{execution.error}</p> : null}
      <div className="workflow-execution-steps">{Object.entries(execution.node_statuses || {}).map(([nodeId, node]) => <div key={nodeId}><strong>{nodeId}</strong><Badge>{node.status || "queued"}</Badge><span>{node.message}</span></div>)}</div>
      {!EXECUTION_TERMINAL.has(String(execution.status || "").toUpperCase()) ? <div className="workflow-native-actions"><Button variant="ghost" onClick={cancel} disabled={Boolean(busy)}>{busy === "cancel" ? "Cancelling…" : "Cancel execution"}</Button></div> : null}
    </PanelBody></Panel> : null}
  </div>;
}

export function WorkflowCompilerRenderer() {
  const [mode, setMode] = useState("skills");
  const [source, setSource] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function compile(event) {
    event.preventDefault(); setError(""); setResult(null); setBusy(true);
    try {
      const payload = mode === "workflow"
        ? await workflowCompilerApi.compileWorkflow(jsonObject(source || EMPTY_DAG, "Workflow DAG"))
        : await workflowCompilerApi.compileSkills([source]);
      setResult(payload.result || payload);
    } catch (next) { setError(next.status === 403 ? "Workflow Compiler requires a staff account." : next.message); }
    finally { setBusy(false); }
  }

  return <div className="workflow-native"><Alert message={error} /><div className="workflow-native-grid">
    <Panel><PanelHeader title="Compile workflow"><Badge>Staff tool</Badge></PanelHeader><PanelBody><form className="workflow-native-form" onSubmit={compile}>
      <label htmlFor="compiler-mode">Input type</label><Select id="compiler-mode" value={mode} onChange={event => { setMode(event.target.value); setSource(event.target.value === "workflow" ? EMPTY_DAG : ""); }} options={[{ value: "skills", label: "SKILL.md protocol" }, { value: "workflow", label: "Workflow DAG JSON" }]} />
      <label htmlFor="compiler-source">{mode === "workflow" ? "Workflow DAG" : "Scientific protocol"}</label><Textarea id="compiler-source" rows={22} value={source} onChange={event => setSource(event.target.value)} placeholder={mode === "workflow" ? EMPTY_DAG : "Paste SKILL.md protocol text…"} spellCheck={false} />
      <div className="workflow-native-actions"><Button type="submit" disabled={busy || !source.trim()}>{busy ? "Compiling…" : "Compile"}</Button></div>
    </form></PanelBody></Panel>
    <Panel><PanelHeader title="Compiled result" /> <PanelBody>{busy ? <div className="workflow-native-loading"><Spinner /> Compiling workflow…</div> : result ? <pre className="workflow-compiled-result">{JSON.stringify(result, null, 2)}</pre> : <p className="workflow-native-empty">The typed execution plan will appear here.</p>}</PanelBody></Panel>
  </div></div>;
}
