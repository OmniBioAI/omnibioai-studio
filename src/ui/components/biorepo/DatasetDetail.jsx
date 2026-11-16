import React, { useCallback, useEffect, useState } from "react";
import { Spinner } from "@omnibioai/ui";
import { useAccountDateTime } from "../PreferencesProvider";
import { downloadUrl, getDataset, getLineage, getVersion, listVersions } from "../../lib/biorepoApi";
import LineageView from "./LineageView";
import IngestForm from "./IngestForm";
import { errorText, formatBytes } from "./messages";

const STATUS_TEXT = {
  ingesting: "Being prepared", ready: "Ready", failed: "Failed validation", broken: "Broken: a file was deleted",
};

function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { setDone(false); }
  };
  return <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" aria-label={label} onClick={copy}>
    {done ? "Copied" : "Copy"}</button>;
}

function Regeneration({ regen }) {
  if (!regen) return null;
  return <section className="biorepo__regen" aria-labelledby="biorepo-regen-heading">
    <h4 id="biorepo-regen-heading">To regenerate this version</h4>
    <p>Not backed up: it is rebuilt from its inputs. Run {regen.workflow_id || "the workflow"}
      {regen.workflow_version ? ` @ ${regen.workflow_version}` : ""} ({regen.run_kind === "tes_run" ? "TES run" : "workflow run"} {regen.run_id}) on:</p>
    <ul>{(regen.inputs || []).map((input, index) => input.hidden
      ? <li key={index}>an input version you can’t see</li>
      : <li key={index}><code>{input.drs_uri}</code> ({input.dataset} v{input.version}, {input.status})
        <ul>{(input.files || []).map(f => <li key={f.drs_uri}><code>{f.path}</code> <code>{f.drs_uri}</code> sha256 <code>{f.sha256 || "—"}</code></li>)}</ul></li>)}</ul>
  </section>;
}

function VersionPanel({ datasetId, number, onChanged }) {
  const formatDate = useAccountDateTime();
  const [state, setState] = useState({ status: "loading", version: null, error: null });
  const [downloadError, setDownloadError] = useState("");
  const load = useCallback(signal => {
    setState(previous => ({ ...previous, status: "loading" }));
    getVersion(datasetId, number, { signal })
      .then(version => setState({ status: "success", version, error: null }))
      .catch(error => { if (error?.name !== "AbortError") setState({ status: "error", version: null, error }); });
  }, [datasetId, number]);
  useEffect(() => { const c = new AbortController(); load(c.signal); return () => c.abort(); }, [load]);

  const download = async file => {
    setDownloadError("");
    try { window.location.assign(await downloadUrl(file.drs_id)); } catch (error) { setDownloadError(errorText(error)); }
  };

  if (state.status === "error") return <div className="account-state account-state--error" role="alert">
    <strong>Couldn’t load version {number}</strong><span>{errorText(state.error)}</span></div>;
  const v = state.version;
  if (!v) return <p role="status"><Spinner size="sm" /> Loading version…</p>;
  const issues = v.validation?.issues || [];
  const open = v.status === "ingesting" && !v.sealed_at;
  return <section className="biorepo__version" aria-labelledby="biorepo-version-heading">
    <header className="biorepo__subheader">
      <h3 id="biorepo-version-heading">Version {v.version} · {STATUS_TEXT[v.status] || v.status}</h3>
      <span className={`biorepo__badge biorepo__badge--${v.backup_class}`}
        title={v.backup_class_reason || undefined}>{v.backup_class === "derived" ? "derived · not backed up" : "raw · backed up"}</span>
    </header>
    {v.status_detail && <p role="status">{v.status_detail}</p>}
    <dl className="biorepo__facts">
      <div><dt>Created</dt><dd><time dateTime={v.created_at}>{formatDate(v.created_at)}</time> by {v.created_by}</dd></div>
      {v.sealed_at && <div><dt>Sealed</dt><dd><time dateTime={v.sealed_at}>{formatDate(v.sealed_at)}</time></dd></div>}
      <div><dt>Size</dt><dd>{formatBytes(v.total_bytes)}</dd></div>
      <div><dt>Backup class</dt><dd>{v.backup_class}{v.backup_class_reason ? ` (${v.backup_class_reason})` : ""}</dd></div>
      <div><dt>DRS bundle</dt><dd><code>{v.drs_bundle_uri}</code> <CopyButton text={v.drs_bundle_uri} label={`Copy DRS URI of version ${v.version}`} /></dd></div>
    </dl>
    {v.changelog && <p>{v.changelog}</p>}
    {issues.length > 0 && <ul className="biorepo__issues">{issues.map((i, index) => <li key={index} className={`biorepo__issue--${i.level}`}>
      <strong>{i.level}</strong> {i.path ? <code>{i.path}</code> : null} {i.message}</li>)}</ul>}
    <Regeneration regen={v.regeneration} />
    {open && <IngestForm datasetId={datasetId} versionNumber={v.version} onDone={onChanged} />}
    {downloadError && <p role="alert" className="biorepo__error">{downloadError}</p>}
    {(v.files || []).length > 0 && <div className="biorepo__table-wrap"><table className="biorepo__table">
      <caption className="biorepo__sr-only">Files in version {v.version}</caption>
      <thead><tr><th scope="col">Path</th><th scope="col">Size</th><th scope="col">Format</th><th scope="col">sha256</th>
        <th scope="col">DRS URI</th><th scope="col"><span className="biorepo__sr-only">Actions</span></th></tr></thead>
      <tbody>{v.files.map(f => <tr key={f.drs_id}>
        <th scope="row" className="biorepo__path">{f.path}{f.registered_in_place && <span className="biorepo__badge">in place</span>}
          {f.drift_state && f.drift_state !== "ok" && <span className="biorepo__badge biorepo__badge--warn">changed on disk</span>}</th>
        <td>{formatBytes(f.size)}</td><td>{f.format || "—"}</td>
        <td><code title={f.sha256 || undefined}>{f.sha256 ? `${f.sha256.slice(0, 12)}…` : "pending"}</code></td>
        <td><code>{f.drs_uri}</code> <CopyButton text={f.drs_uri} label={`Copy DRS URI of ${f.path}`} /></td>
        <td>{["ready", "broken"].includes(v.status) && <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm"
          aria-label={`Download ${f.path}`} onClick={() => download(f)}>Download</button>}</td>
      </tr>)}</tbody>
    </table></div>}
    {v.metadata && Object.keys(v.metadata).length > 0 && <details><summary>Metadata</summary>
      <pre className="biorepo__json">{JSON.stringify(v.metadata, null, 2)}</pre></details>}
  </section>;
}

export default function DatasetDetail({ datasetId, onBack, onOpenDataset, canWrite }) {
  const formatDate = useAccountDateTime();
  const [state, setState] = useState({ status: "loading", dataset: null, versions: [], error: null });
  const [selected, setSelected] = useState(null);
  const [depth, setDepth] = useState(1);
  const [graph, setGraph] = useState(null);
  const [reload, setReload] = useState(0);
  const [newVersion, setNewVersion] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setState(previous => ({ ...previous, status: "loading" }));
    Promise.all([getDataset(datasetId, { signal }), listVersions(datasetId, { signal })])
      .then(([dataset, list]) => {
        const versions = Array.isArray(list?.versions) ? list.versions : [];
        setState({ status: "success", dataset, versions, error: null });
        setSelected(current => (current && versions.some(v => v.version === current) ? current : versions[0]?.version ?? null));
      })
      .catch(error => { if (error?.name !== "AbortError") setState({ status: "error", dataset: null, versions: [], error }); });
    return () => controller.abort();
  }, [datasetId, reload]);

  useEffect(() => {
    const controller = new AbortController();
    getLineage(datasetId, depth, { signal: controller.signal }).then(setGraph)
      .catch(error => { if (error?.name !== "AbortError") setGraph(null); });
    return () => controller.abort();
  }, [datasetId, depth, reload]);

  const refresh = () => { setNewVersion(false); setReload(value => value + 1); };
  if (state.status === "error") return <section className="biorepo">
    <button type="button" className="biorepo__link" onClick={onBack}>← Repository</button>
    <div className="account-state account-state--error" role="alert"><strong>Couldn’t open this dataset</strong>
      <span>{errorText(state.error)}</span></div></section>;
  const d = state.dataset;
  if (!d) return <p role="status"><Spinner size="sm" /> Loading dataset…</p>;
  const ingesting = state.versions.some(v => v.status === "ingesting");
  return <section className="biorepo" aria-labelledby="biorepo-dataset-heading">
    <button type="button" className="biorepo__link" onClick={onBack}>← Repository</button>
    <header className="biorepo__header">
      <div><h2 id="biorepo-dataset-heading">{d.title}</h2>
        <p className="biorepo__muted">{d.type} · {d.visibility} · <code>{d.id}</code> · created <time dateTime={d.created_at}>{formatDate(d.created_at)}</time></p></div>
      {canWrite && !ingesting && <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm"
        onClick={() => setNewVersion(true)}>New version</button>}
    </header>
    {d.description && <p>{d.description}</p>}
    {d.tags?.length > 0 && <p className="biorepo__tags">{d.tags.map(t => <span key={t} className="biorepo__badge">{t}</span>)}</p>}
    {newVersion && <IngestForm datasetId={d.id} onDone={refresh} onCancel={() => setNewVersion(false)} />}
    {state.versions.length > 0 && <nav className="biorepo__versions" aria-label="Versions">
      {state.versions.map(v => <button key={v.version} type="button" aria-pressed={selected === v.version}
        onClick={() => setSelected(v.version)}>v{v.version} <span>{v.status}</span></button>)}
    </nav>}
    {selected && <VersionPanel key={`${selected}-${reload}`} datasetId={d.id} number={selected} onChanged={refresh} />}
    {graph && <LineageView graph={graph} datasetId={d.id} depth={depth} onDepth={setDepth} onOpenDataset={onOpenDataset} />}
  </section>;
}
