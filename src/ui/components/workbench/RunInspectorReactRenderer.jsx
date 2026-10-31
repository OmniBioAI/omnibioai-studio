import React, { useCallback, useEffect, useMemo, useState } from "react";
import { nativePluginRequest } from "../../lib/nativePluginApi";
import { pluginEndpoint } from "../../lib/pluginApi";
import "./RunInspectorReactRenderer.css";

const API = "/plugins/run_inspector/api/runs/";
const pretty = value => JSON.stringify(value ?? {}, null, 2);
const dateTime = value => value ? new Date(Number(value) * 1000).toLocaleString() : "—";

function Box({ title, children, className = "" }) {
  return <section className={`run-inspector__box ${className}`}><header><h2>{title}</h2></header><div className="run-inspector__box-body">{children}</div></section>;
}

function Json({ value, empty = "No data available." }) {
  return <pre className="run-inspector__json">{value == null ? empty : pretty(value)}</pre>;
}

export default function RunInspectorReactRenderer() {
  const [runs, setRuns] = useState([]);
  const [runA, setRunA] = useState("");
  const [runB, setRunB] = useState("");
  const [mode, setMode] = useState("single");
  const [detail, setDetail] = useState(null);
  const [lineage, setLineage] = useState(null);
  const [objectDetail, setObjectDetail] = useState(null);
  const [diff, setDiff] = useState(null);
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [explainBusy, setExplainBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const result = await nativePluginRequest(`${API}?limit=250`);
      const rows = Array.isArray(result.items) ? result.items : [];
      setRuns(rows);
      setRunA(current => current || rows[0]?.run_id || "");
      setRunB(current => current || rows[1]?.run_id || rows[0]?.run_id || "");
    } catch (failure) { setError(failure.message || "Could not load runs."); }
    finally { setBusy(false); }
  }, []);

  const loadRun = useCallback(async id => {
    if (!id) { setDetail(null); setLineage(null); return; }
    setBusy(true); setError(""); setObjectDetail(null);
    try {
      const [record, graph] = await Promise.all([
        nativePluginRequest(`${API}${encodeURIComponent(id)}/`),
        nativePluginRequest(`/plugins/run_inspector/api/runs/${encodeURIComponent(id)}/lineage/`),
      ]);
      setDetail(record); setLineage(graph); setDiff(null);
    } catch (failure) { setError(failure.message || "Could not load run details."); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (mode === "single" && runA) loadRun(runA); }, [mode, runA, loadRun]);

  async function compareRuns() {
    if (!runA || !runB) return;
    setBusy(true); setError(""); setExplanation("");
    try {
      const result = await nativePluginRequest(`${API}diff/?a=${encodeURIComponent(runA)}&b=${encodeURIComponent(runB)}`);
      setDiff(result); setDetail(null); setLineage(null);
    } catch (failure) { setError(failure.message || "Could not compare runs."); }
    finally { setBusy(false); }
  }

  async function explainDiff() {
    if (!runA || !runB) return;
    setExplainBusy(true); setError("");
    try {
      const result = await nativePluginRequest(`${API}diff/explain/`, { method: "POST", body: { a: runA, b: runB } });
      setExplanation(result.explanation || "No explanation was returned.");
    } catch (failure) { setError(failure.message || "Could not explain run differences."); }
    finally { setExplainBusy(false); }
  }

  async function inspectObject(id) {
    if (!id) return;
    try { setObjectDetail(await nativePluginRequest(`/plugins/run_inspector/api/objects/${encodeURIComponent(id)}/`)); }
    catch (failure) { setError(failure.message || "Could not load object details."); }
  }

  const runOptions = useMemo(() => runs.map(run => ({ ...run, label: `${run.run_id} · ${run.plugin_slug}` })), [runs]);
  const downloadUrl = file => detail ? pluginEndpoint(`/plugins/run_inspector/api/runs/${encodeURIComponent(detail.run_id)}/file/${String(file.relpath || "").split("/").map(encodeURIComponent).join("/")}`) : "";

  return <main className="run-inspector" aria-label="Run Inspector">
    <header className="run-inspector__hero">
      <div><p className="run-inspector__eyebrow">PROVENANCE · RUN DIFF · OMNIOBJECT LINEAGE</p><h1>Run Inspector</h1>
        <p>Inspect run metadata, output files and lineage, or compare two executions side by side.</p></div>
      <div className="run-inspector__actions">
        <button type="button" className={mode === "single" ? "is-active" : ""} onClick={() => setMode("single")}>Single Run</button>
        <button type="button" className={mode === "compare" ? "is-active" : ""} onClick={() => setMode("compare")}>Compare Runs</button>
        <button type="button" onClick={refresh} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
      </div>
    </header>
    {error && <p role="alert" className="run-inspector__error">{error}</p>}
    <div className="run-inspector__grid">
      <Box title={mode === "single" ? "Select run" : "Compare runs"}>
        {mode === "single" ? <label className="run-inspector__field">Run<select value={runA} onChange={event => setRunA(event.target.value)} disabled={busy}>
          <option value="">Select a run…</option>{runOptions.map(run => <option key={run.run_id} value={run.run_id}>{run.label}</option>)}
        </select></label> : <>
          <label className="run-inspector__field">Run A<select value={runA} onChange={event => setRunA(event.target.value)}>{runOptions.map(run => <option key={run.run_id} value={run.run_id}>{run.label}</option>)}</select></label>
          <label className="run-inspector__field">Run B<select value={runB} onChange={event => setRunB(event.target.value)}>{runOptions.map(run => <option key={run.run_id} value={run.run_id}>{run.label}</option>)}</select></label>
          <button type="button" onClick={compareRuns} disabled={busy || !runA || !runB}>{busy ? "Comparing…" : "Compare"}</button>
        </>}
        <p className="run-inspector__hint">Run access is restricted by Workbench staff authorization.</p>
      </Box>
      <Box title="Summary">{diff ? <div className="run-inspector__summary"><strong>{diff.run_a}</strong><span>compared with</span><strong>{diff.run_b}</strong></div>
        : detail ? <div className="run-inspector__summary"><strong>{detail.run_id}</strong><span>{detail.plugin_slug}</span><span>{(detail.files || []).length} output files</span></div>
          : <p>{busy ? "Loading run data…" : "Select a run to inspect its summary."}</p>}</Box>
      {mode === "single" && <>
        <Box title="Metadata"><Json value={detail?.metadata} empty={busy ? "Loading metadata…" : "Select a run to view metadata."}/></Box>
        <Box title="Files"><div className="run-inspector__files">{(detail?.files || []).map(file => <div className="run-inspector__file" key={file.relpath}>
          <code title={file.relpath}>{file.relpath}</code><span>{file.size_h || file.size || "—"}</span>
          <a href={downloadUrl(file)}>Download</a></div>)}
          {!detail?.files?.length && <p>{busy ? "Loading files…" : "No output files recorded."}</p>}
        </div></Box>
        <Box title="OmniObject Lineage" className="run-inspector__wide">
          <div className="run-inspector__lineage-columns">
            {[ ["Inputs", lineage?.inputs || []], ["Run", lineage?.run ? [lineage.run] : []], ["Outputs", lineage?.outputs || []] ].map(([title, objects]) => <section key={title}>
              <h3>{title} <span>{objects.length}</span></h3>{objects.length ? objects.map(item => {
                const id = typeof item === "string" ? item : item.object_id || item.id;
                return <button type="button" className="run-inspector__chip" key={id} onClick={() => inspectObject(id)}>{id}</button>;
              }) : <p>No linked objects.</p>}
            </section>)}
          </div>
          {objectDetail && <div className="run-inspector__object-detail"><h3>Object detail</h3><Json value={objectDetail}/></div>}
        </Box>
      </>}
      {mode === "compare" && diff && <>
        <Box title="Metadata diff"><Json value={diff.metadata_diff}/></Box>
        <Box title="Files diff"><Json value={diff.file_diff}/></Box>
        <Box title="AI Explain Differences" className="run-inspector__wide">
          <div className="run-inspector__explain-actions"><p>Explanation is generated from the current comparison through the configured OmniBioAI model service.</p>
            <button type="button" onClick={explainDiff} disabled={explainBusy}>{explainBusy ? "Generating…" : "AI Explain Differences"}</button>
            <button type="button" onClick={() => navigator.clipboard?.writeText(explanation)} disabled={!explanation}>Copy</button>
            <button type="button" onClick={() => setExplanation("")} disabled={!explanation}>Clear</button>
          </div><pre className="run-inspector__json">{explanation || "Run an explanation to see a grounded comparison summary."}</pre>
        </Box>
      </>}
    </div>
  </main>;
}
