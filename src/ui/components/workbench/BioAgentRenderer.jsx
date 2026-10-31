import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  checkBioAgentModel, loadBioAgentContext, loadBioAgentStatus,
  sendBioAgentPrompt, uploadBioAgentFile,
} from "../../lib/bioAgentApi";
import "./BioAgentRenderer.css";

const MODES = [
  ["llm", "LLM"], ["bioquery", "BioQueryAI"], ["tes", "TES (Tools)"],
  ["workflow_planner", "Workflow Planner"], ["ragbio", "RAGBio"],
];
const MODELS = [
  ["llama3:latest", "Ollama · llama3"], ["deepseek-r1:latest", "Ollama · DeepSeek R1"],
  ["claude-opus-4-6", "Claude · Opus 4.6"], ["claude-sonnet-4-6", "Claude · Sonnet 4.6"],
  ["claude-haiku-4-5-20251001", "Claude · Haiku 4.5"],
];

function id() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`; }
function localTime() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function collectPlans(value, found = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return found;
  seen.add(value);
  if (!Array.isArray(value) && typeof value.plan_id === "string") found.push(value);
  Object.values(value).forEach(child => collectPlans(child, found, seen));
  return found;
}
function displayValue(value) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
}

function safeBioAgentAssetUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin || !parsed.pathname.startsWith("/plugins/bio_agent/bioquery/artifact/")) return "";
    parsed.pathname = `/_svc/workbench${parsed.pathname}`;
    return `${parsed.pathname}${parsed.search}`;
  } catch { return ""; }
}

function BioResult({ result, selectedPlanId, onSelectPlan, onExecuteDag }) {
  if (!result) return null;
  const type = result.type || "text";
  const payload = result.payload ?? result;
  const message = payload?.message;
  const text = payload?.text;
  const rows = payload?.rows;
  const plans = collectPlans(result);
  const blocks = payload?.blocks;
  if (Array.isArray(blocks)) return <div className="ba-result-blocks">{blocks.map((block, index) => <BioResult key={`${block.title || block.type || "block"}-${index}`} result={block} selectedPlanId={selectedPlanId} onSelectPlan={onSelectPlan} onExecuteDag={onExecuteDag} />)}</div>;
  if (type === "image") {
    const src = safeBioAgentAssetUrl(payload?.src);
    const download = safeBioAgentAssetUrl(payload?.download_url);
    return <div className="ba-result-image">{result.title && <div className="ba-result-title">{result.title}</div>}{src ? <img src={src} alt={result.title || "Bioinformatics analysis plot"} loading="lazy" /> : <p>Plot unavailable.</p>}{download && <a href={download} download={payload.filename || "analysis-plot"}>Download plot</a>}</div>;
  }
  const download = safeBioAgentAssetUrl(payload?.download_url);
  return <div className={`ba-result ${type === "error" ? "is-error" : ""}`}>
    {result.title && <div className="ba-result-title">{result.title}</div>}
    {message && <p>{String(message)}</p>}
    {text && <pre>{String(text)}</pre>}
    {Array.isArray(rows) && rows.length > 0 && <div className="ba-table-wrap"><table><thead><tr>{Object.keys(rows[0] || {}).map(key => <th key={key}>{key.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{Object.keys(rows[0] || {}).map(key => <td key={key}>{displayValue(row?.[key])}</td>)}</tr>)}</tbody></table></div>}
    {download && <a href={download} download={payload.filename || "analysis-results.csv"}>Download {payload.filename || "results"}</a>}
    {plans.length > 0 && <div className="ba-plan-list"><strong>Workflow plans</strong>{plans.map((plan, index) => <label className="ba-plan" key={`${plan.plan_id}-${index}`}>
      <input type="radio" name="bio-agent-plan" checked={selectedPlanId === plan.plan_id} onChange={() => onSelectPlan(plan.plan_id)} />
      <span><b>{plan.title || plan.plan_id}</b><small>{plan.plan_id}{plan.rationale ? ` · ${plan.rationale}` : ""}</small></span>
      {Array.isArray(plan.dag) && <button type="button" className="ba-button" onClick={() => onExecuteDag(plan)} title="Submit this DAG for execution">Execute DAG</button>}
    </label>)}</div>}
    {!message && !text && !Array.isArray(rows) && <details className="ba-result-json"><summary>Structured result details</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>}
  </div>;
}

function Message({ message, selectedPlanId, onSelectPlan, onExecuteDag }) {
  const isUser = message.role === "user";
  return <article className={`ba-message ${isUser ? "is-user" : "is-agent"}`}>
    <div className="ba-avatar" aria-hidden="true">{isUser ? "You" : "OA"}</div>
    <div className="ba-bubble"><div className="ba-meta"><strong>{message.sender || (isUser ? "You" : "OmniBioAgent")}</strong><time>{message.time}</time></div>
      {message.loading ? <div className="ba-working"><span className="ba-spinner" />{message.text || "Working…"}</div>
        : message.result ? <BioResult result={message.result} selectedPlanId={selectedPlanId} onSelectPlan={onSelectPlan} onExecuteDag={onExecuteDag} />
          : <div className="ba-message-text">{message.text}</div>}
    </div>
  </article>;
}

function SelectField({ label, value, onChange, options, disabled = false }) {
  return <label className="ba-field"><span>{label}</span><select value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{options.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>;
}

export default function BioAgentRenderer() {
  const [mode, setMode] = useState("llm");
  const [model, setModel] = useState("llama3:latest");
  const [modelState, setModelState] = useState("checking");
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [context, setContext] = useState({ omniobjects: [], run_ids: [] });
  const [contextError, setContextError] = useState("");
  const [source, setSource] = useState({ bioquery: "upload", tes: "omniobject", workflow_planner: "omniobject" });
  const [selectedObject, setSelectedObject] = useState({ bioquery: "", tes: "", workflow_planner: "" });
  const [selectedRun, setSelectedRun] = useState("");
  const [uploads, setUploads] = useState({ bioquery: null, tes: null, workflow_planner: null });
  const [files, setFiles] = useState({ bioquery: null, tes: null, workflow_planner: null });
  const [uploadStatus, setUploadStatus] = useState({});
  const [plannerServer, setPlannerServer] = useState("local_real");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [ragOptions, setRagOptions] = useState({ study: "", topK: "5", structured: false, force: false, cache: true });
  const [tesStatus, setTesStatus] = useState("Idle");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const streamRef = useRef(null);
  const promptRef = useRef(null);
  const abortRef = useRef(null);
  const recognitionRef = useRef(null);

  const refreshContext = useCallback(async () => {
    setRefreshing(true); setContextError("");
    try { setContext(await loadBioAgentContext()); }
    catch (error) { setContextError(error.message || "Could not load datasets and run IDs."); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => { refreshContext(); return () => { abortRef.current?.abort(); recognitionRef.current?.stop?.(); }; }, [refreshContext]);
  useEffect(() => {
    const controller = new AbortController();
    setModelState("checking");
    checkBioAgentModel(model, { signal: controller.signal }).then(result => setModelState(result.ok ? "ready" : "unavailable"))
      .catch(() => { if (!controller.signal.aborted) setModelState("unavailable"); });
    return () => controller.abort();
  }, [model]);
  useEffect(() => { if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight; }, [messages]);

  function updateMessage(messageId, updates) {
    setMessages(previous => previous.map(item => item.id === messageId ? { ...item, ...updates } : item));
  }
  function appendMessage(message) {
    const entry = { id: id(), time: localTime(), ...message };
    setMessages(previous => [...previous, entry]); return entry.id;
  }
  function chooseSource(next) {
    setSource(previous => ({ ...previous, [mode]: next }));
    setSelectedObject(previous => ({ ...previous, [mode]: "" }));
    setUploads(previous => ({ ...previous, [mode]: null }));
    setFiles(previous => ({ ...previous, [mode]: null }));
    setUploadStatus(previous => ({ ...previous, [mode]: "" }));
  }
  async function uploadSelectedFile() {
    const file = files[mode];
    if (!file) { setUploadStatus(previous => ({ ...previous, [mode]: "Select a file first." })); return; }
    setUploadStatus(previous => ({ ...previous, [mode]: `Uploading ${file.name}…` }));
    try {
      const result = await uploadBioAgentFile(file);
      const uploaded = { kind: "upload", object_id: result.object_id, path: result.stored_path, name: result.filename };
      setUploads(previous => ({ ...previous, [mode]: uploaded }));
      setUploadStatus(previous => ({ ...previous, [mode]: `Uploaded: ${result.filename} (${(result.size_bytes / 1024).toFixed(1)} KB)` }));
    } catch (error) { setUploadStatus(previous => ({ ...previous, [mode]: error.message || "Upload failed." })); }
  }
  function appendJobResult(result, targetId, sender) {
    updateMessage(targetId, { loading: false, result, sender, time: localTime() });
  }

  async function pollJob(kind, jobId, targetId, sender) {
    setTesStatus(kind === "tes" ? "SUBMITTED" : tesStatus);
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, kind === "tes" ? 1000 : 3000));
      try {
        const status = await loadBioAgentStatus(kind, jobId);
        const state = String(status.state || "PENDING").toUpperCase();
        if (kind === "tes") setTesStatus(state);
        updateMessage(targetId, { text: `${sender} · ${state.toLowerCase()}…` });
        if (["COMPLETED", "COMPLETE"].includes(state)) { appendJobResult(status.bioquery || { type: "text", title: sender, payload: { text: "Job completed." } }, targetId, sender); return; }
        if (["FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(state)) { appendJobResult(status.bioquery || { type: "error", title: sender, payload: { message: status.error || `Job ${state.toLowerCase()}.` } }, targetId, sender); return; }
      } catch (error) {
        appendJobResult({ type: "error", title: sender, payload: { message: error.message || "Status polling failed." } }, targetId, sender); return;
      }
    }
    appendJobResult({ type: "error", title: sender, payload: { message: "Stopped waiting for this job. You can check its status in Workbench." } }, targetId, sender);
  }

  async function submitPrompt(nextPrompt = prompt, extra = {}) {
    const text = nextPrompt.trim();
    if (!text || sending) return;
    appendMessage({ role: "user", text }); setPrompt(""); setSending(true); setVoiceError("");
    if (modelState === "unavailable") { appendMessage({ role: "assistant", text: `Model “${model}” is unavailable. Select a working model and try again.` }); setSending(false); return; }
    if (mode === "bioquery") {
      if (source.bioquery === "upload" && !uploads.bioquery) { appendMessage({ role: "assistant", text: "Upload a file first using the Session panel." }); setSending(false); return; }
      if (source.bioquery === "omniobject" && !selectedObject.bioquery) { appendMessage({ role: "assistant", text: "Select an OmniObject first." }); setSending(false); return; }
      if (source.bioquery === "run_id" && !selectedRun) { appendMessage({ role: "assistant", text: "Select a run ID first." }); setSending(false); return; }
    }
    const spinnerId = appendMessage({ role: "assistant", sender: mode === "bioquery" ? "BioQueryAI" : mode === "tes" ? "TES" : mode === "workflow_planner" ? "Workflow Planner" : mode === "ragbio" ? "RAGBio" : "OmniBioAgent", loading: true, text: "Working…" });
    const body = { prompt: text, mode, model_name: model, ...extra };
    if (mode === "bioquery") {
      if (source.bioquery === "upload") body.omniobject_id = uploads.bioquery.object_id;
      if (source.bioquery === "omniobject") body.omniobject_id = selectedObject.bioquery;
      if (source.bioquery === "run_id") body.run_id = selectedRun;
    }
    if (mode === "tes") {
      const selected = source.tes === "upload" ? uploads.tes : selectedObject.tes ? { kind: "omniobject", object_id: selectedObject.tes } : null;
      if (selected?.kind === "omniobject") body.input_object_id = selected.object_id;
      if (selected?.kind === "upload") body.input_path = selected.path;
    }
    if (mode === "workflow_planner") {
      body.planner_server_id = plannerServer;
      const selected = source.workflow_planner === "upload" ? uploads.workflow_planner : selectedObject.workflow_planner ? { kind: "omniobject", object_id: selectedObject.workflow_planner } : null;
      if (selected?.kind === "omniobject") body.planner_input_object_id = selected.object_id;
      if (selected?.kind === "upload") body.planner_input_path = selected.path;
      if (selectedPlanId && !extra.execute_dag) body.plan_id = selectedPlanId;
    }
    if (mode === "ragbio") Object.assign(body, {
      rag_study: ragOptions.study, rag_top_k: ragOptions.topK,
      rag_structured: ragOptions.structured ? "1" : "0", rag_force: ragOptions.force ? "1" : "0",
      rag_use_cache: ragOptions.cache ? "1" : "0",
    });
    abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await sendBioAgentPrompt(body, { signal: controller.signal });
      if (response.response !== undefined) { updateMessage(spinnerId, { loading: false, text: response.response || "(no response)" }); }
      else if (response.bioquery) {
        const result = response.bioquery;
        updateMessage(spinnerId, { loading: false, result, time: localTime() });
        const askId = result?.meta?.ask_id;
        const runId = result?.meta?.run_id;
        if (askId && mode === "bioquery") { updateMessage(spinnerId, { loading: true, text: "Submitted · waiting for BioQueryAI…" }); pollJob("bioquery", askId, spinnerId, "BioQueryAI"); }
        else if (askId && result?.meta?.planner) { updateMessage(spinnerId, { loading: true, text: "Submitted · planning workflow…" }); pollJob("planner", askId, spinnerId, "Workflow Planner"); }
        else if (runId && mode === "tes") { updateMessage(spinnerId, { loading: true, text: `TES run ${runId} · submitted…` }); pollJob("tes", runId, spinnerId, "TES"); }
      } else updateMessage(spinnerId, { loading: false, text: "(unexpected response)" });
    } catch (error) {
      if (!controller.signal.aborted) updateMessage(spinnerId, { loading: false, text: `Error: ${error.message || "Request failed."}` });
    } finally { if (abortRef.current === controller) setSending(false); }
  }

  function startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setVoiceError("Voice input is not supported in this browser. Try Chrome."); return; }
    const recognition = new SpeechRecognition(); recognition.continuous = true; recognition.interimResults = true; recognition.lang = "en-US";
    recognition.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0]?.transcript || "").join(" ").trim();
      setPrompt(transcript);
    };
    recognition.onerror = event => { setVoiceError(`Voice input error: ${event.error || "unknown"}`); setListening(false); };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition; setListening(true); setVoiceError(""); recognition.start();
  }
  function executeDag(plan) {
    if (!window.confirm(`Submit the DAG for “${plan.title || plan.plan_id}” to the orchestrator?`)) return;
    setMode("workflow_planner");
    submitWorkflowAction(plan);
  }

  async function submitWorkflowAction(plan) {
    const text = `Execute workflow plan ${plan.plan_id}`;
    appendMessage({ role: "user", text }); setSending(true);
    const spinnerId = appendMessage({ role: "assistant", sender: "Workflow Planner", loading: true, text: "Submitting DAG…" });
    const controller = new AbortController(); abortRef.current?.abort(); abortRef.current = controller;
    try {
      const response = await sendBioAgentPrompt({ prompt: "execute_dag", mode: "workflow_planner", model_name: model, planner_server_id: plannerServer, execute_dag: JSON.stringify({ plan_id: plan.plan_id, dag: plan.dag }) }, { signal: controller.signal });
      if (response.response !== undefined) updateMessage(spinnerId, { loading: false, text: response.response });
      else if (response.bioquery) updateMessage(spinnerId, { loading: false, result: response.bioquery });
      else updateMessage(spinnerId, { loading: false, text: "(unexpected response)" });
    } catch (error) { if (!controller.signal.aborted) updateMessage(spinnerId, { loading: false, text: error.message || "Could not submit workflow DAG." }); }
    finally { if (abortRef.current === controller) setSending(false); }
  }

  const objectOptions = [["", "— Select an OmniObject —"], ...(context.omniobjects || []).map(item => [String(item.id), item.label || item.id])];
  const fileAccept = mode === "bioquery" ? ".csv,.tsv,.txt,.vcf,.vcf.gz,.gz,.json,.yaml,.yml" : ".vcf,.vcf.gz,.gz,.bcf,.tbi,.csi,.fastq,.fq,.fastq.gz,.fq.gz,.bam,.cram,.sam,.fa,.fasta,.fa.gz,.fasta.gz,.csv,.tsv,.txt";
  const activeUpload = uploads[mode];

  return <div className="bio-agent">
    <header className="ba-topbar"><div><div className="ba-eyebrow">AI ORCHESTRATION</div></div>
      <div className="ba-statuses"><span className={`ba-pill ${modelState === "ready" ? "is-ok" : modelState === "unavailable" ? "is-bad" : ""}`}><i />{modelState === "ready" ? "LLM Connected" : modelState === "unavailable" ? "Model unavailable" : "Checking model…"}</span>
        <span className="ba-pill is-ok"><i />Agent Ready</span><label className="ba-model">Model <select value={model} onChange={event => setModel(event.target.value)}>{MODELS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
    </header>
    <div className="ba-grid">
      <section className="ba-card ba-chat">
        <div className="ba-card-header"><h3>Conversation</h3><button type="button" className="ba-button" onClick={() => { setMessages([]); setSelectedPlanId(""); }}>Clear</button></div>
        <div className="ba-stream" ref={streamRef} aria-live="polite">
          {messages.length === 0 && <div className="ba-welcome"><span className="ba-welcome-mark">✳</span><h3>What can I help you explore?</h3><p>Ask a biology question, analyze a dataset, run a TES tool, or plan a workflow.</p></div>}
          {messages.map(message => <Message key={message.id} message={message} selectedPlanId={selectedPlanId} onSelectPlan={setSelectedPlanId} onExecuteDag={executeDag} />)}
        </div>
        <div className="ba-composer"><button type="button" className={`ba-icon-button ${listening ? "is-listening" : ""}`} aria-label={listening ? "Stop voice input" : "Voice input"} title="Voice input" onClick={() => { if (listening) { recognitionRef.current?.stop(); setListening(false); } else startVoice(); }}>♩</button>
          <textarea ref={promptRef} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Message… (Enter to send, Shift+Enter for a new line)" rows={2} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitPrompt(); } }} />
          <button type="button" className="ba-send" disabled={sending || !prompt.trim()} onClick={() => submitPrompt()}>{sending ? "Working…" : "Send"}</button>
        </div>
        {voiceError && <div className="ba-inline-error" role="status">{voiceError}</div>}
      </section>
      <aside className="ba-card ba-session"><div className="ba-card-header"><h3>Session</h3><button type="button" className="ba-button" onClick={refreshContext} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh data"}</button></div>
        <div className="ba-session-body">
          <div className="ba-kv"><span className="ba-label">Endpoint</span><code>bio_agent/chat_response</code></div>
          <div className="ba-divider" />
          <div className="ba-kv"><span className="ba-label">Mode</span><select aria-label="Mode" className="ba-mode-select" value={mode} onChange={event => { setMode(event.target.value); setVoiceError(""); }}>{MODES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>

          {mode === "bioquery" && <section className="ba-mode-panel"><div className="ba-section-title">BioQueryAI input</div>
            <div className="ba-choice-row">{[["upload", "Upload file"], ["omniobject", "OmniObject"], ["run_id", "run_id"]].map(([key, label]) => <label key={key}><input type="radio" name="bioquery-source" checked={source.bioquery === key} onChange={() => chooseSource(key)} />{label}</label>)}</div>
            {source.bioquery === "upload" && <div className="ba-upload-box"><input type="file" accept={fileAccept} onChange={event => setFiles(previous => ({ ...previous, bioquery: event.target.files?.[0] || null }))} /><div className="ba-button-row"><button type="button" className="ba-button ba-button-primary" onClick={uploadSelectedFile}>Upload</button><button type="button" className="ba-button" onClick={() => { setFiles(previous => ({ ...previous, bioquery: null })); setUploads(previous => ({ ...previous, bioquery: null })); setUploadStatus(previous => ({ ...previous, bioquery: "No file uploaded." })); }}>Clear</button></div><small>{uploadStatus.bioquery || "Supported: CSV, TSV, TXT, VCF, VCF.GZ, JSON, YAML"}</small></div>}
            {source.bioquery === "omniobject" && <SelectField label="OmniObject" value={selectedObject.bioquery} onChange={value => setSelectedObject(previous => ({ ...previous, bioquery: value }))} options={objectOptions} />}
            {source.bioquery === "run_id" && <SelectField label="Run ID" value={selectedRun} onChange={setSelectedRun} options={[["", "— Select run ID —"], ...(context.run_ids || []).map(value => [value, value])]} />}
            <p className="ba-help">BioQueryAI produces a summary, plots, and tables. Submitted analyses run asynchronously.</p>
          </section>}

          {mode === "tes" && <section className="ba-mode-panel"><div className="ba-section-title">TES tool input</div><p className="ba-help">Choose an OmniObject or upload a supported file; include a tool command in your message.</p>
            <div className="ba-choice-row">{[["omniobject", "OmniObject"], ["upload", "Upload file"]].map(([key, label]) => <label key={key}><input type="radio" name="tes-source" checked={source.tes === key} onChange={() => chooseSource(key)} />{label}</label>)}</div>
            {source.tes === "omniobject" ? <SelectField label="OmniObject" value={selectedObject.tes} onChange={value => setSelectedObject(previous => ({ ...previous, tes: value }))} options={objectOptions} /> : <div className="ba-upload-box"><input type="file" accept={fileAccept} onChange={event => setFiles(previous => ({ ...previous, tes: event.target.files?.[0] || null }))} /><div className="ba-button-row"><button className="ba-button ba-button-primary" type="button" onClick={uploadSelectedFile}>Upload</button><button className="ba-button" type="button" onClick={() => { setFiles(previous => ({ ...previous, tes: null })); setUploads(previous => ({ ...previous, tes: null })); }}>Clear</button></div><small>{uploadStatus.tes || activeUpload?.name || "VCF, FASTQ, BAM, FASTA, and other supported input formats"}</small></div>}
            <div className="ba-example"><strong>Examples</strong><pre>{"blast:\n>q\nACGTACGTACGT\ndb=ecoli_demo max_hits=5\n\nenrichr: TP53 BRCA1 EGFR libraries=WikiPathways_2024_Human,Reactome_2022 top_n=10 sort_by=adj_p_value\n\nomim: BRCA1 TP53"}</pre></div>
            <div className="ba-kv"><span className="ba-label">TES status</span><span className={`ba-state ${/COMPLETE|FAILED/.test(tesStatus) ? "is-ok" : ""}`}>{tesStatus}</span></div>
          </section>}

          {mode === "workflow_planner" && <section className="ba-mode-panel"><div className="ba-section-title">Workflow Planner</div>
            <SelectField label="Server" value={plannerServer} onChange={setPlannerServer} options={[["local_real", "local_real"], ["slurm_local", "slurm_local"]]} />
            <p className="ba-help">Used for compatibility checks against available tools and workflows.</p>
            <div className="ba-choice-row">{[["omniobject", "OmniObject"], ["upload", "Upload file"]].map(([key, label]) => <label key={key}><input type="radio" name="planner-source" checked={source.workflow_planner === key} onChange={() => chooseSource(key)} />{label}</label>)}</div>
            {source.workflow_planner === "omniobject" ? <SelectField label="Input" value={selectedObject.workflow_planner} onChange={value => setSelectedObject(previous => ({ ...previous, workflow_planner: value }))} options={objectOptions} /> : <div className="ba-upload-box"><input type="file" accept={fileAccept} onChange={event => setFiles(previous => ({ ...previous, workflow_planner: event.target.files?.[0] || null }))} /><div className="ba-button-row"><button className="ba-button ba-button-primary" type="button" onClick={uploadSelectedFile}>Upload</button><button className="ba-button" type="button" onClick={() => { setFiles(previous => ({ ...previous, workflow_planner: null })); setUploads(previous => ({ ...previous, workflow_planner: null })); }}>Clear</button></div><small>{uploadStatus.workflow_planner || "Tip: upload .fastq.gz for large read sets."}</small></div>}
            <div className="ba-divider" /><div className="ba-section-title">Planner selection</div><div className="ba-selected-plan">{selectedPlanId || "No plan selected"}</div><div className="ba-button-row"><button className="ba-button ba-button-primary" type="button" disabled={!selectedPlanId || sending} onClick={() => submitPrompt(`plan_id=${selectedPlanId}`)}>Submit selected plan</button><button className="ba-button" type="button" disabled={!selectedPlanId} onClick={() => setSelectedPlanId("")}>Clear selection</button></div>
          </section>}

          {mode === "ragbio" && <section className="ba-mode-panel"><div className="ba-section-title">RAGBio search</div>
            <label className="ba-field"><span>Study</span><input value={ragOptions.study} placeholder="e.g. autism (blank = all)" onChange={event => setRagOptions(previous => ({ ...previous, study: event.target.value }))} /></label>
            <label className="ba-field"><span>top_k</span><input type="number" min="1" max="50" value={ragOptions.topK} onChange={event => setRagOptions(previous => ({ ...previous, topK: event.target.value }))} /></label>
            <div className="ba-checks">{[["structured", "Structured"], ["force", "Force refresh"], ["cache", "Use cache"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={ragOptions[key]} onChange={event => setRagOptions(previous => ({ ...previous, [key]: event.target.checked }))} />{label}</label>)}</div>
            <p className="ba-help">RAGBio answers with PubMed evidence and a short synthesis.</p>
          </section>}

          {contextError && <p className="ba-inline-error" role="alert">{contextError}</p>}
          <div className="ba-divider" /><div className="ba-kv"><span className="ba-label">Status</span><span className="ba-state is-ok">Connected</span></div>
        </div>
      </aside>
    </div>
  </div>;
}
