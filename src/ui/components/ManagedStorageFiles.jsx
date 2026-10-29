import React, { useCallback, useEffect, useRef, useState } from "react";
import { getSessionVersion, onSessionChange } from "../lib/session";
import {
  deleteManagedObject, downloadManagedObject, listManagedObjects,
  uploadManagedFile,
} from "../lib/managedStorageApi";

const ERRORS = {
  unauthorized: "Sign in again before managing files.",
  forbidden: "You are not allowed to manage these files.",
  not_found: "The file is no longer available.",
  conflict: "This upload conflicts with an earlier request. Choose the file again to start a new upload.",
  quota_exceeded: "This file exceeds the available storage allowance.",
  rate_limited: "Storage is temporarily busy. Try again shortly.",
  stale: "Your session changed. Sign in again before continuing.",
  invalid: "The storage service returned an invalid response.",
  unavailable: "Storage is temporarily unavailable. Your file was not confirmed as uploaded.",
};

function formatBytes(value) {
  if (!Number.isSafeInteger(value) || value < 0) return "Size unavailable";
  if (value < 1_000_000) return `${value} bytes`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

function safeError(error) {
  return ERRORS[error?.code] || "The storage request could not be completed.";
}

export default function ManagedStorageFiles({ onChanged }) {
  const [objects, setObjects] = useState([]);
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState("");
  const input = useRef(null);
  const sessionVersion = useRef(getSessionVersion());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listManagedObjects();
      setObjects(next);
      setError("");
    } catch (cause) {
      setError(safeError(cause));
      setObjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return onSessionChange(() => {
      sessionVersion.current = getSessionVersion();
      setFile(null);
      setRetryKey("");
      setProgress(null);
      setStatus("");
      if (opened) refresh();
    });
  }, [opened, refresh]);

  async function submitUpload(event) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    setProgress(0);
    const key = retryKey || crypto.randomUUID?.() || `studio-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setRetryKey(key);
    const startedInSession = sessionVersion.current;
    try {
      const receipt = await uploadManagedFile(file, {
        idempotencyKey: key,
        onProgress: (loaded, total) => setProgress(Math.min(100, Math.floor((loaded / total) * 100))),
      });
      if (startedInSession !== getSessionVersion()) return;
      setStatus(`Upload complete. Receipt ${receipt.objectId}.`);
      setFile(null);
      setRetryKey("");
      if (input.current) input.current.value = "";
      await refresh();
      onChanged?.();
    } catch (cause) {
      if (cause?.name === "AbortError") setError("Upload was cancelled before completion was confirmed.");
      else setError(safeError(cause));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function download(item) {
    setError("");
    try {
      const blob = await downloadManagedObject(item.objectId);
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = item.filename || "download";
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (cause) {
      setError(safeError(cause));
    }
  }

  async function remove(item) {
    if (!window.confirm(`Delete ${item.filename || "this file"}? This cannot be undone.`)) return;
    setError("");
    try {
      await deleteManagedObject(item.objectId);
      setStatus("File deleted.");
      await refresh();
      onChanged?.();
    } catch (cause) {
      setError(safeError(cause));
    }
  }

  return <section className="managed-files" aria-labelledby="managed-files-heading">
    <div className="storage-dashboard__section-heading">
      <div><h3 id="managed-files-heading">Your files</h3><p>Upload files to your authenticated personal managed storage.</p></div>
      {!opened ? <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm"
        onClick={() => { setOpened(true); refresh(); }}>Manage files</button>
        : <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" disabled={loading || busy} onClick={refresh}>Refresh files</button>}
    </div>
    {!opened ? <p>Upload and manage your personal files.</p> : <>
    <form className="managed-files__upload" onSubmit={submitUpload}>
      <label htmlFor="managed-storage-file">Choose a file</label>
      <input ref={input} id="managed-storage-file" type="file" onChange={event => {
        setFile(event.target.files?.[0] || null); setRetryKey(""); setError(""); setStatus("");
      }} disabled={busy} />
      {file && <span>{file.name} · {formatBytes(file.size)}</span>}
      <button type="submit" className="omni-btn omni-btn--primary" disabled={!file || busy}>
        {busy ? "Uploading…" : retryKey ? "Retry upload" : "Upload file"}
      </button>
      {busy && progress !== null && <progress aria-label="Upload progress" max="100" value={progress} />}
      {busy && <p role="status">Uploading file. Keep this page open until the service confirms it.</p>}
    </form>
    {error && <p className="managed-files__error" role="alert">{error}</p>}
    {status && <p role="status">{status}</p>}
    {loading ? <p role="status">Loading files…</p> : objects.length === 0
      ? <p>No managed files are available.</p>
      : <ul className="managed-files__list">{objects.map(item => <li key={item.objectId}>
        <span><strong>{item.filename || "File"}</strong><small>{formatBytes(item.sizeBytes)}{item.sha256 ? ` · SHA-256 ${item.sha256}` : ""}</small></span>
        <div>
          <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" disabled={!item.downloadable} onClick={() => download(item)}>Download</button>
          <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" onClick={() => remove(item)}>Delete</button>
        </div>
      </li>)}</ul>}
    <p className="managed-files__note">If a connection drops, retrying the same selected file reuses its idempotency key. The current service processes each upload as one request; resumable chunk transfer is not available here.</p>
    </>}
  </section>;
}

