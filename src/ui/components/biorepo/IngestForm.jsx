import React, { useEffect, useState } from "react";
import { ProgressBar } from "@omnibioai/ui";
import { listProjects } from "../../lib/projectsApi";
import {
  createDataset, createVersion, registerInPlace, sealVersion, uploadFile, VISIBILITIES,
} from "../../lib/biorepoApi";
import { errorText, formatBytes } from "./messages";

export const DATASET_TYPES = Object.freeze([
  ["genomics", "Genomics (FASTQ, BAM/CRAM, VCF, FASTA)"],
  ["transcriptomics", "Transcriptomics (counts, h5ad, 10x)"],
  ["generic", "Generic files"],
]);

// One form for the three ways data gets in: a new dataset, a new version of
// an existing one, or finishing a version that is still being prepared.
// Each step's result is kept, so a retry after an error carries on where it
// stopped instead of creating a second dataset or version.
export default function IngestForm({ datasetId: givenDataset = null, versionNumber: givenVersion = null, onDone, onCancel }) {
  const [projects, setProjects] = useState([]);
  const [fields, setFields] = useState({ project: "", type: "generic", title: "", description: "", visibility: "private", tags: "" });
  const [changelog, setChangelog] = useState("");
  const [mode, setMode] = useState("upload");
  const [files, setFiles] = useState([]);
  const [source, setSource] = useState({ path: "", prefix: "" });
  const [progress, setProgress] = useState({});
  const [done, setDone] = useState({ datasetId: givenDataset, version: givenVersion, uploaded: new Set(), registered: false });
  const [status, setStatus] = useState({ busy: false, error: "", step: "" });
  const needDataset = !givenDataset;

  useEffect(() => {
    if (!needDataset) return undefined;
    const controller = new AbortController();
    listProjects({ signal: controller.signal }).then(list => {
      const items = Array.isArray(list) ? list : list?.projects || [];
      setProjects(items);
      setFields(current => ({ ...current, project: current.project || items[0]?.projectId || "" }));
    }).catch(() => setProjects([]));
    return () => controller.abort();
  }, [needDataset]);

  const set = key => event => setFields(current => ({ ...current, [key]: event.target.value }));
  const hasContent = mode === "upload" ? files.length > 0 : source.path.trim() !== "";

  async function submit(event) {
    event.preventDefault();
    setStatus({ busy: true, error: "", step: "" });
    const progressSoFar = { ...done, uploaded: new Set(done.uploaded) };
    try {
      if (!progressSoFar.datasetId) {
        setStatus(s => ({ ...s, step: "Creating the dataset…" }));
        const tags = fields.tags.split(",").map(t => t.trim()).filter(Boolean);
        progressSoFar.datasetId = (await createDataset({ ...fields, tags })).id;
        setDone({ ...progressSoFar });
      }
      if (!progressSoFar.version) {
        setStatus(s => ({ ...s, step: "Opening a version…" }));
        progressSoFar.version = (await createVersion(progressSoFar.datasetId, { changelog })).version;
        setDone({ ...progressSoFar });
      }
      if (mode === "upload") {
        for (const file of files) {
          const path = file.webkitRelativePath || file.name;
          if (progressSoFar.uploaded.has(path)) continue;
          setStatus(s => ({ ...s, step: `Uploading ${path}…` }));
          await uploadFile(progressSoFar.datasetId, progressSoFar.version, file, path,
            { onProgress: bytes => setProgress(current => ({ ...current, [path]: bytes })) });
          progressSoFar.uploaded.add(path);
          setDone({ ...progressSoFar, uploaded: new Set(progressSoFar.uploaded) });
        }
      } else if (!progressSoFar.registered) {
        setStatus(s => ({ ...s, step: "Registering files in place…" }));
        await registerInPlace(progressSoFar.datasetId, progressSoFar.version, source.path.trim(), source.prefix.trim());
        progressSoFar.registered = true;
        setDone({ ...progressSoFar });
      }
      setStatus(s => ({ ...s, step: "Sealing: checksums and validation run in the background…" }));
      await sealVersion(progressSoFar.datasetId, progressSoFar.version);
      setStatus({ busy: false, error: "", step: "" });
      onDone?.(progressSoFar.datasetId);
    } catch (error) {
      setStatus({ busy: false, error: errorText(error), step: "" });
    }
  }

  return <form className="biorepo__form" onSubmit={submit} aria-labelledby="biorepo-ingest-heading">
    <h3 id="biorepo-ingest-heading">{needDataset ? "New dataset" : givenVersion ? `Add files to version ${givenVersion}` : "New version"}</h3>
    {needDataset && !done.datasetId && <fieldset>
      <legend>Dataset</legend>
      <label>Project <select required value={fields.project} onChange={set("project")}>
        {projects.length === 0 && <option value="">No projects: create one in Projects first</option>}
        {projects.map(p => <option key={p.projectId} value={p.projectId}>{p.name}</option>)}</select></label>
      <label>Type <select value={fields.type} onChange={set("type")}>
        {DATASET_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Title <input required maxLength={255} value={fields.title} onChange={set("title")} /></label>
      <label>Description <textarea maxLength={20000} value={fields.description} onChange={set("description")} /></label>
      <label>Visibility <select value={fields.visibility} onChange={set("visibility")}>
        {VISIBILITIES.map(v => <option key={v} value={v}>{v === "private" ? "Private (only you)" : v === "project" ? "Project members" : "Everyone in the organization"}</option>)}</select></label>
      <label>Tags <input value={fields.tags} placeholder="comma separated" onChange={set("tags")} /></label>
    </fieldset>}
    {!givenVersion && !done.version && <label>Changelog <input maxLength={2000} value={changelog}
      onChange={event => setChangelog(event.target.value)} /></label>}
    <fieldset>
      <legend>Files</legend>
      <label><input type="radio" name="biorepo-mode" checked={mode === "upload"} onChange={() => setMode("upload")} /> Upload from this computer</label>
      <label><input type="radio" name="biorepo-mode" checked={mode === "register"} onChange={() => setMode("register")} /> Register data already on the NAS (no copy)</label>
      {mode === "upload" ? <>
        <input type="file" multiple aria-label="Files to upload" onChange={event => setFiles([...event.target.files])} />
        {files.length > 0 && <ul className="biorepo__uploads">{files.map(file => {
          const path = file.webkitRelativePath || file.name;
          const sent = done.uploaded.has(path) ? file.size : progress[path] || 0;
          const active = status.busy && mode === "upload" && !done.uploaded.has(path);
          return <li key={path} className="biorepo__progress">
            <span>{path} · {formatBytes(file.size)}{done.uploaded.has(path) ? " · uploaded" : ""}</span>
            {(active || sent > 0) && <ProgressBar value={sent} max={Math.max(file.size, 1)} size="sm"
              variant={done.uploaded.has(path) ? "success" : "accent"}
              label={done.uploaded.has(path) ? "Uploaded" : `${formatBytes(sent)} of ${formatBytes(file.size)}`} />}
          </li>;
        })}</ul>}
        <p className="biorepo__muted">Uploads count toward your storage allowance and default to <strong>raw</strong> (backed up).</p>
      </> : <>
        <label>Path in your folders <input value={source.path} placeholder="tenant_123/projects/run1 or org_4/shared/cohort"
          onChange={event => setSource(s => ({ ...s, path: event.target.value }))} /></label>
        <label>Prefix in the dataset (optional) <input value={source.prefix}
          onChange={event => setSource(s => ({ ...s, prefix: event.target.value }))} /></label>
        <p className="biorepo__muted">Files stay where they are and aren’t charged again. Don’t edit them afterwards: changes are detected and flagged.</p>
      </>}
    </fieldset>
    {status.step && <p role="status">{status.step}</p>}
    {status.error && <p role="alert" className="biorepo__error">{status.error}</p>}
    <div className="biorepo__form-actions">
      <button type="submit" className="omni-btn omni-btn--primary omni-btn--sm"
        disabled={status.busy || !hasContent || (needDataset && !done.datasetId && (!fields.project || !fields.title.trim()))}>
        {status.error ? "Retry" : "Add files and seal"}</button>
      {onCancel && <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" disabled={status.busy} onClick={onCancel}>Cancel</button>}
    </div>
  </form>;
}
