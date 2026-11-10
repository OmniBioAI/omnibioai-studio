import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Spinner } from "@omnibioai/ui";
import { useAccountDateTime } from "./PreferencesProvider";
import { formatStorageBytes } from "../lib/storageDashboard";
import { deleteMyFile, listMyFiles, myFileDownloadUrl, MY_FILES_PAGE_SIZE } from "../lib/myFilesApi";
import { getSessionVersion, onSessionChange } from "../lib/session";
import "./MyFiles.css";

const COLUMNS = [["name", "Name"], ["size", "Size"], ["created", "Created"]];
const LIST_ERRORS = {
  storage_unavailable: "Storage temporarily unavailable. Your files are safe; please try again shortly.",
  unauthorized: "Sign in again to view your files.",
  forbidden: "Access to your files was denied.",
  rate_limited: "Too many requests. Please try again shortly.",
};
const DELETE_ERRORS = {
  storage_unavailable: "Storage temporarily unavailable. The file was not deleted; retry when storage is back.",
  not_found: "This file no longer exists.",
  origin_not_allowed: "Files can only be deleted from Studio.",
  conflict: "This file can’t be deleted right now.",
};

function shortChecksum(file) {
  if (!file.checksum) return "—";
  return `${file.checksumAlgorithm ? `${file.checksumAlgorithm}:` : ""}${file.checksum.slice(0, 12)}…`;
}

function DeleteConfirm({ file, datasets, busy, onConfirm, onCancel }) {
  const label = file.name || "this unnamed file";
  return <div className="my-files__confirm" role="alertdialog" aria-modal="false" aria-labelledby="my-files-confirm-title"
    aria-describedby="my-files-confirm-body">
    <strong id="my-files-confirm-title">{datasets ? "This file backs dataset versions" : `Delete ${label}?`}</strong>
    <div id="my-files-confirm-body">
      {datasets ? <>
        <p>Deleting it removes the data behind these dataset versions. They will stay listed but can no longer be read:</p>
        <ul>{datasets.map((item, index) => <li key={`${item.name}-${item.version}-${index}`}>
          {item.name || "Unnamed dataset"}{item.version ? ` (version ${item.version})` : ""}</li>)}</ul>
      </> : <p>
        The file is removed from storage and stops counting toward your allowance. This can’t be undone.
        If it backs a dataset version, you’ll be asked to confirm again.
      </p>}
    </div>
    <div className="my-files__confirm-actions">
      <button type="button" className="omni-btn omni-btn--danger omni-btn--sm" disabled={busy} onClick={onConfirm}>
        {datasets ? "Delete file and unlink datasets" : "Delete file"}</button>
      <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}

export default function MyFiles({ onChanged = () => {} }) {
  const formatDate = useAccountDateTime();
  const session = useSyncExternalStore(onSessionChange, getSessionVersion);
  const [sort, setSort] = useState({ key: "created", dir: "desc" });
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({ status: "loading", files: [], totalCount: 0, error: "" });
  // Per-file delete progress: { status: "deleting" | "failed", error }.
  const [ops, setOps] = useState({});
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setState(previous => ({ ...previous, status: "loading", error: "" }));
    listMyFiles({ sort: sort.key, dir: sort.dir, offset, limit: MY_FILES_PAGE_SIZE, signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        if (result.files.length === 0 && offset > 0) { setOffset(Math.max(0, offset - MY_FILES_PAGE_SIZE)); return; }
        setState({ status: "success", files: result.files, totalCount: result.totalCount, error: "" });
      })
      .catch(error => {
        if (controller.signal.aborted || error?.name === "AbortError") return;
        setState({ status: "error", files: [], totalCount: 0, error: error?.code || "unavailable" });
      });
    return () => controller.abort();
  }, [session, sort, offset, reload]);

  const refresh = useCallback(() => setReload(value => value + 1), []);

  const runDelete = useCallback(async (file, confirmDatasetUnlink) => {
    setOps(current => ({ ...current, [file.id]: { status: "deleting", error: "" } }));
    try {
      await deleteMyFile(file.id, { confirmDatasetUnlink });
      setConfirm(null);
      setOps(current => { const next = { ...current }; delete next[file.id]; return next; });
      refresh();
      onChanged();
    } catch (error) {
      if (error?.code === "dataset_linked") {
        setOps(current => { const next = { ...current }; delete next[file.id]; return next; });
        setConfirm({ file, datasets: error.datasets });
        return;
      }
      setConfirm(null);
      setOps(current => ({ ...current, [file.id]: { status: "failed", error: error?.code || "unavailable" } }));
    }
  }, [onChanged, refresh]);

  const sortBy = key => {
    setOffset(0);
    setSort(current => ({ key, dir: current.key === key ? (current.dir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc" }));
  };

  const loading = state.status === "loading";
  const first = state.totalCount === 0 ? 0 : offset + 1;
  const last = Math.min(offset + state.files.length, state.totalCount);

  return <section className="my-files" aria-labelledby="my-files-heading">
    <header className="storage-dashboard__section-heading">
      <div><h3 id="my-files-heading">My files</h3>
        <p>Files charged to your personal allowance, from Data Manager, dataset ingest, artifacts and file transfers.</p></div>
      <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" disabled={loading} onClick={refresh}>
        <span aria-hidden="true">↻</span> {loading ? "Refreshing files…" : "Refresh files"}</button>
    </header>

    {confirm && <DeleteConfirm file={confirm.file} datasets={confirm.datasets}
      busy={ops[confirm.file.id]?.status === "deleting"}
      onConfirm={() => runDelete(confirm.file, Boolean(confirm.datasets))}
      onCancel={() => setConfirm(null)} />}

    {state.status === "error" ? <div className="account-state account-state--error" role="alert">
      <strong>{state.error === "storage_unavailable" ? "Storage temporarily unavailable" : "Couldn’t load your files"}</strong>
      <span>{LIST_ERRORS[state.error] || "Your files failed to load."}</span>
      <button type="button" onClick={refresh}>Retry</button>
    </div> : loading && state.files.length === 0 ? <p role="status" className="my-files__status"><Spinner size="sm" /> Loading your files…</p>
      : state.files.length === 0 ? <p className="my-files__empty" role="status">
        No files yet. Files you upload through Data Manager, dataset ingest, artifacts or file transfers appear here.</p>
        : <>
          <div className="my-files__table-wrap">
            <table className="my-files__table" aria-busy={loading}>
              <caption className="my-files__sr-only">Your files, sorted by {COLUMNS.find(([key]) => key === sort.key)[1].toLowerCase()} ({sort.dir === "asc" ? "ascending" : "descending"})</caption>
              <thead><tr>
                {COLUMNS.map(([key, label]) => <th key={key} scope="col"
                  aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="my-files__sort" onClick={() => sortBy(key)}>
                    {label}{sort.key === key && <span aria-hidden="true">{sort.dir === "asc" ? " ↑" : " ↓"}</span>}</button>
                </th>)}
                <th scope="col">Source</th>
                <th scope="col">Checksum</th>
                <th scope="col"><span className="my-files__sr-only">Actions</span></th>
              </tr></thead>
              <tbody>{state.files.map(file => {
                const op = ops[file.id];
                const deleting = op?.status === "deleting";
                const stuck = !op && file.deleting;
                const label = file.name || "Unnamed file";
                return <tr key={file.id}>
                  <th scope="row" className="my-files__name">{file.name || <em>Unnamed file</em>}</th>
                  <td>{formatStorageBytes(file.sizeBytes)}</td>
                  <td><time dateTime={file.createdAt}>{formatDate(file.createdAt)}</time></td>
                  <td>{file.sourceLabel}</td>
                  <td><code title={file.checksum ? `${file.checksumAlgorithm || "checksum"}: ${file.checksum}` : undefined}>{shortChecksum(file)}</code></td>
                  <td className="my-files__actions">
                    {deleting ? <span role="status">Deleting…</span>
                      : op?.status === "failed" || stuck ? <>
                        <span role="status">{stuck ? "Deleting…" : (DELETE_ERRORS[op.error] || "Delete failed.")}</span>
                        <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm"
                          aria-label={`Retry deleting ${label}`} onClick={() => runDelete(file, false)}>Retry</button>
                      </> : <>
                        {file.downloadAllowed
                          ? <a className="omni-btn omni-btn--secondary omni-btn--sm" href={myFileDownloadUrl(file.id)}
                            download={file.name || ""} aria-label={`Download ${label}`}>Download</a>
                          : <span className="my-files__muted">Download unavailable</span>}
                        <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm"
                          aria-label={`Delete ${label}`} onClick={() => setConfirm({ file, datasets: null })}>Delete</button>
                      </>}
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <nav className="my-files__pager" aria-label="My files pages">
            <span>{first}–{last} of {state.totalCount}</span>
            <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" disabled={loading || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - MY_FILES_PAGE_SIZE))}>Previous</button>
            <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm"
              disabled={loading || offset + MY_FILES_PAGE_SIZE >= state.totalCount}
              onClick={() => setOffset(offset + MY_FILES_PAGE_SIZE)}>Next</button>
          </nav>
        </>}
  </section>;
}
