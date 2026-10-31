import React, { useCallback, useEffect, useState } from "react";
import { nativePluginRequest } from "../../lib/nativePluginApi";
import { Payload, UtilityPanel } from "./UtilityRegistryRenderers";

const STORAGE_VIEWS = [
  ["summary", "Overview", "/plugins/storage_quota_manager/api/storage/summary/"],
  ["backends", "Backends", "/plugins/storage_quota_manager/api/storage/backends/"],
  ["largest", "Largest datasets", "/plugins/storage_quota_manager/api/usage/largest-datasets/"],
  ["cleanup", "Cleanup guidance", "/plugins/storage_quota_manager/api/cleanup/recommendations/"],
  ["forecast", "Forecast", "/plugins/storage_quota_manager/api/forecast/storage-usage/"],
];

function Alert({ error }) { return error ? <p role="alert" className="utility-react__error">{error}</p> : null; }

export function StorageQuotaReactRenderer() {
  const [view, setView] = useState("summary");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async selected => {
    const route = STORAGE_VIEWS.find(([key]) => key === selected)?.[2];
    if (!route) return;
    setBusy(true); setError("");
    try { setData(await nativePluginRequest(route)); }
    catch (failure) { setError(failure.message || "Could not load storage data."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(view); }, [load, view]);
  return <main className="utility-react" aria-label="Storage Quota Manager">
    <header className="utility-react__hero"><div><p>STORAGE GOVERNANCE · CAPACITY</p><h1>Storage Quota Manager</h1><span>Review storage usage, backend distribution, growth forecasts, and non-destructive cleanup guidance.</span></div>
      <button type="button" onClick={() => load(view)} disabled={busy}>{busy ? "Loading…" : "Refresh"}</button></header>
    <Alert error={error}/><UtilityPanel title="Storage intelligence">
      <nav className="utility-react__tabs" aria-label="Storage views">{STORAGE_VIEWS.map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</nav>
      <Payload value={data} empty={busy ? "Loading storage data…" : "No storage data is available for this view."}/>
    </UtilityPanel>
  </main>;
}

export function JobQueueReactRenderer() {
  const [jobs, setJobs] = useState(null);
  const [queues, setQueues] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setBusy("load"); setError("");
    try {
      const [jobData, queueData, metricsData] = await Promise.all([
        nativePluginRequest("/plugins/job_queue_manager/api/jobs?limit=100"),
        nativePluginRequest("/plugins/job_queue_manager/api/queues"),
        nativePluginRequest("/plugins/job_queue_manager/api/health"),
      ]);
      setJobs(jobData); setQueues(queueData); setMetrics(metricsData);
    } catch (failure) { setError(failure.message || "Could not load job queue information."); }
    finally { setBusy(""); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  async function jobAction(id, action) {
    setBusy(`${action}:${id}`); setError("");
    try { await nativePluginRequest(`/plugins/job_queue_manager/api/jobs/${encodeURIComponent(id)}/${action}`, { method: "POST", body: {} }); await refresh(); }
    catch (failure) { setError(failure.message || `Could not ${action} this job.`); }
    finally { setBusy(""); }
  }
  const jobRows = jobs?.jobs || jobs?.items || jobs;
  return <main className="utility-react" aria-label="Job Queue Manager">
    <header className="utility-react__hero"><div><p>EXECUTION OPERATIONS · JOB LIFECYCLE</p><h1>Job Queue Manager</h1><span>Monitor queued work and use the Workbench-authorized cancel and retry controls.</span></div>
      <button type="button" onClick={refresh} disabled={Boolean(busy)}>{busy === "load" ? "Refreshing…" : "Refresh queues"}</button></header>
    <Alert error={error}/>
    <div className="utility-react__grid"><UtilityPanel title="Queue metrics"><Payload value={metrics}/></UtilityPanel><UtilityPanel title="Queues"><Payload value={queues}/></UtilityPanel></div>
    <UtilityPanel title="Jobs"><Payload value={jobs} empty={busy === "load" ? "Loading jobs…" : "No jobs are available."}/>
      {Array.isArray(jobRows) && jobRows.length > 0 && <div className="utility-react__tabs">{jobRows.map(job => {
        const id = job.job_id || job.id;
        if (!id) return null;
        return <React.Fragment key={id}><button type="button" onClick={() => jobAction(id, "cancel")} disabled={Boolean(busy)} aria-label={`Cancel job ${id}`}>Cancel {id}</button>
          <button type="button" onClick={() => jobAction(id, "retry")} disabled={Boolean(busy)} aria-label={`Retry job ${id}`}>Retry {id}</button></React.Fragment>;
      })}</div>}
    </UtilityPanel>
  </main>;
}

export function FileTransferReactRenderer() {
  const [stateFilter, setStateFilter] = useState("");
  const [transfers, setTransfers] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setBusy("load"); setError("");
    try {
      const query = stateFilter ? `?state=${encodeURIComponent(stateFilter)}&limit=100` : "?limit=100";
      setTransfers(await nativePluginRequest(`/plugins/file_transfer_manager/transfers/${query}`));
    } catch (failure) { setError(failure.message || "Could not load transfers."); }
    finally { setBusy(""); }
  }, [stateFilter]);
  useEffect(() => { refresh(); }, [refresh]);
  async function transferAction(id, action) {
    setBusy(`${action}:${id}`); setError("");
    try { await nativePluginRequest(`/plugins/file_transfer_manager/transfers/${encodeURIComponent(id)}/${action}/`, { method: "POST", body: {} }); await refresh(); }
    catch (failure) { setError(failure.message || `Could not ${action} this transfer.`); }
    finally { setBusy(""); }
  }
  const rows = transfers?.transfers || transfers?.items || [];
  return <main className="utility-react" aria-label="File Transfer Manager">
    <header className="utility-react__hero"><div><p>SECURE DATA MOVEMENT · TRANSFER LIFECYCLE</p><h1>File Transfer Manager</h1><span>Track transfer progress and manage allowed transfer lifecycle actions without exposing storage credentials.</span></div>
      <button type="button" onClick={refresh} disabled={Boolean(busy)}>{busy === "load" ? "Refreshing…" : "Refresh transfers"}</button></header>
    <Alert error={error}/><UtilityPanel title="Transfer activity">
      <div className="utility-react__form"><label>Status filter<select value={stateFilter} onChange={event => setStateFilter(event.target.value)}><option value="">All statuses</option>{["queued", "running", "paused", "completed", "failed", "cancelled"].map(state => <option key={state}>{state}</option>)}</select></label></div>
      <Payload value={transfers} empty={busy === "load" ? "Loading transfers…" : "No transfers match this filter."}/>
      {rows.length > 0 && <div className="utility-react__tabs">{rows.map(row => {
        const id = row.transfer_id || row.id;
        if (!id) return null;
        return <React.Fragment key={id}>{["pause", "resume", "retry", "cancel"].map(action => <button type="button" key={`${id}-${action}`} onClick={() => transferAction(id, action)} disabled={Boolean(busy)}>{action} {id}</button>)}</React.Fragment>;
      })}</div>}
    </UtilityPanel>
  </main>;
}

export function ChecksumIntegrityReactRenderer() {
  const [path, setPath] = useState("");
  const [algorithm, setAlgorithm] = useState("sha256");
  const [expected, setExpected] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(event) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    const verify = Boolean(expected.trim());
    try { setResult(await nativePluginRequest(`/plugins/checksum_integrity_manager/api/${verify ? "verify" : "calculate"}/`, {
      method: "POST", body: { path: path.trim(), algorithm, ...(verify ? { expected_checksum: expected.trim() } : {}) },
    })); }
    catch (failure) { setError(failure.message || "Checksum operation failed."); }
    finally { setBusy(false); }
  }
  return <main className="utility-react" aria-label="Checksum Integrity Manager">
    <header className="utility-react__hero"><div><p>DATA INTEGRITY · CHECKSUMS</p><h1>Checksum Integrity Manager</h1><span>Calculate a checksum for a path under the configured storage root, or verify it against an expected value.</span></div></header>
    <Alert error={error}/><UtilityPanel title="Calculate or verify"><form className="utility-react__form" onSubmit={run}>
      <label>Path (relative to local root)<input value={path} onChange={event => setPath(event.target.value)} placeholder="reference/reference.fa.gz" required /></label>
      <label>Algorithm<select value={algorithm} onChange={event => setAlgorithm(event.target.value)}>{[["sha256", "SHA-256"], ["sha512", "SHA-512"], ["sha1", "SHA-1"], ["md5", "MD5"], ["crc32", "CRC32"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Expected checksum (optional)<input value={expected} onChange={event => setExpected(event.target.value)} placeholder="Leave blank to calculate" /></label>
      <button type="submit" disabled={busy || !path.trim()}>{busy ? "Running…" : expected.trim() ? "Verify checksum" : "Calculate checksum"}</button>
    </form>{result && <div className="utility-react__result"><h3>{expected.trim() ? "Verification result" : "Checksum result"}</h3><Payload value={result}/></div>}</UtilityPanel>
  </main>;
}

export function PdfReportBuilderReactRenderer() {
  const [reports, setReports] = useState(null);
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState("default_scientific");
  const [sourceRunPlugin, setSourceRunPlugin] = useState("");
  const [sourceRunId, setSourceRunId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      setReports(await nativePluginRequest(`/plugins/pdf_report_builder/api/reports${query}`));
    } catch (failure) { setError(failure.message || "Could not load reports."); }
    finally { setBusy(false); }
  }, [status]);
  useEffect(() => { refresh(); }, [refresh]);
  async function createReport(event) {
    event.preventDefault(); setBusy(true); setError("");
    const body = { title, description, template, ...(sourceRunPlugin ? { source_run_plugin: sourceRunPlugin } : {}), ...(sourceRunId ? { source_run_id: sourceRunId } : {}) };
    try { await nativePluginRequest("/plugins/pdf_report_builder/api/reports", { method: "POST", body }); setTitle(""); setDescription(""); await refresh(); }
    catch (failure) { setError(failure.message || "Could not create report."); }
    finally { setBusy(false); }
  }
  return <main className="utility-react" aria-label="PDF Report Builder">
    <header className="utility-react__hero"><div><p>SCIENTIFIC REPORTING · PDF</p><h1>PDF Report Builder</h1><span>Create and review reports using Workbench report templates and governed run references.</span></div>
      <button type="button" onClick={refresh} disabled={busy}>{busy ? "Refreshing…" : "Refresh reports"}</button></header>
    <Alert error={error}/><div className="utility-react__grid"><UtilityPanel title="Reports">
      <div className="utility-react__form"><label>Status filter<select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{["draft", "queued", "running", "completed", "failed"].map(value => <option key={value}>{value}</option>)}</select></label></div>
      <Payload value={reports} empty={busy ? "Loading reports…" : "No reports match this status."}/>
    </UtilityPanel><UtilityPanel title="New report"><form className="utility-react__form" onSubmit={createReport}>
      <label>Title<input name="title" value={title} onChange={event => setTitle(event.target.value)} required /></label>
      <label>Description<input name="description" value={description} onChange={event => setDescription(event.target.value)} /></label>
      <label>Template<select name="template" value={template} onChange={event => setTemplate(event.target.value)}><option value="default_scientific">Default scientific report</option><option value="minimal">Minimal</option></select></label>
      <label>Source run plugin (optional)<input name="source_run_plugin" value={sourceRunPlugin} onChange={event => setSourceRunPlugin(event.target.value)} placeholder="workflow_runner" /></label>
      <label>Source run ID (optional)<input name="source_run_id" value={sourceRunId} onChange={event => setSourceRunId(event.target.value)} /></label>
      <button type="submit" disabled={busy || !title.trim()}>{busy ? "Creating…" : "Create report"}</button>
    </form></UtilityPanel></div>
  </main>;
}

export function MultiQcReactRenderer() {
  const [filter, setFilter] = useState("");
  const [reports, setReports] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const query = filter ? `?status=${encodeURIComponent(filter)}` : "";
      setReports(await nativePluginRequest(`/plugins/multiqc_wrapper/reports/${query}`));
    } catch (failure) { setError(failure.message || "Could not load MultiQC reports."); }
    finally { setBusy(false); }
  }, [filter]);
  useEffect(() => { refresh(); }, [refresh]);
  async function openReport(reportId) {
    setBusy(true); setError(""); setSelected(null);
    try { setSelected(await nativePluginRequest(`/plugins/multiqc_wrapper/reports/${encodeURIComponent(reportId)}/`)); }
    catch (failure) { setError(failure.message || "Could not load report detail."); }
    finally { setBusy(false); }
  }
  const rows = reports?.reports || reports?.items || [];
  return <main className="utility-react" aria-label="MultiQC Reports">
    <header className="utility-react__hero"><div><p>QUALITY CONTROL · MULTIQC</p><h1>MultiQC Reports</h1><span>Browse stored reports, filter by status, and inspect report metadata without embedding legacy report HTML.</span></div>
      <button type="button" onClick={refresh} disabled={busy}>{busy ? "Refreshing…" : "Refresh reports"}</button></header>
    <Alert error={error}/><UtilityPanel title="Report inventory"><div className="utility-react__form"><label>Status filter<select value={filter} onChange={event => setFilter(event.target.value)}><option value="">All statuses</option>{["pending", "running", "completed", "failed"].map(value => <option key={value}>{value}</option>)}</select></label></div>
      <Payload value={reports} empty={busy ? "Loading reports…" : "No MultiQC reports are available."}/>
      {rows.length > 0 && <div className="utility-react__tabs">{rows.map(row => {
        const id = row.report_id || row.id;
        return id ? <button type="button" key={id} onClick={() => openReport(id)} disabled={busy}>Open report {id}</button> : null;
      })}</div>}
    </UtilityPanel>
    {selected && <UtilityPanel title="Report detail"><Payload value={selected}/></UtilityPanel>}
  </main>;
}
