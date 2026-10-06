import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getSessionVersion, getToken, onSessionChange } from "../lib/session";
import { getConnection, putConnection, removeConnection } from "../lib/connectionsApi";

const LABELS = { openai: "OpenAI", claude: "Anthropic" };
const ERROR_MESSAGES = {
  denied: "You do not have permission to access or manage this organization connection.",
  validation: "The credential could not be saved. Enter a supported provider key with 1–512 printable, non-space characters.",
  stale: "Your session changed. Reload the connection before continuing.",
  unavailable: "Connections are unavailable. Please try again.",
};
const messageFor = error => ERROR_MESSAGES[error?.code] || ERROR_MESSAGES.unavailable;

export default function OrganizationConnections({ currentUser }) {
  const version = useSyncExternalStore(onSessionChange, getSessionVersion);
  return <section className="connections-page" aria-labelledby="connections-heading">
    <header><p className="connections-eyebrow">Organization</p><h1 id="connections-heading" tabIndex={-1}>Connections</h1>
      <p>Manage AI services provided to members of this organization.</p></header>
    {!currentUser || !getToken() ? <p role="alert">Sign in to view organization connections.</p>
      : !currentUser.orgId ? <p role="status">An authenticated organization context is required to view connections.</p>
        : <ConnectionSession key={`${version}:${currentUser.userId}:${currentUser.orgId}`} orgId={currentUser.orgId} />}
  </section>;
}

function ConnectionSession({ orgId }) {
  const [data, setData] = useState(null), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0), [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState("");
  const trigger = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    getConnection(orgId, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(err => { if (!controller.signal.aborted) setError(messageFor(err)); });
    return () => controller.abort();
  }, [orgId, attempt]);
  function reload() { setData(null); setError(""); setAttempt(value => value + 1); }
  function open(kind, event) { trigger.current = event.currentTarget; setNotice(""); setDialog(kind); }
  function close() { setDialog(null); trigger.current?.focus(); }
  function saved() { close(); setNotice("Organization connection updated."); reload(); document.getElementById("connections-heading")?.focus(); }
  return <>
    {notice && <p role="status">{notice}</p>}
    {error ? <div className="connections-card"><p role="alert">{error}</p><button onClick={reload}>Retry connection</button></div>
      : !data ? <p role="status">Loading organization connection…</p>
        : <div className="connections-card">
          <div className="connections-card-heading"><h2>AI provider</h2><span className="connections-status">{data.configured ? "Connected" : "Not connected"}</span></div>
          {data.configured ? <>
            <h3>{LABELS[data.provider]}</h3><p>Provided by your organization.</p>
            <dl><div><dt>Scope</dt><dd>Organization</dd></div><div><dt>Available to</dt><dd>Authorized organization members</dd></div><div><dt>Credential</dt><dd>Credential stored securely</dd></div></dl>
          </> : <><h3>No organization AI provider connected.</h3><p>Connect OpenAI or Anthropic to make the provider available to authorized organization workloads.</p></>}
          <p className="connections-note">One shared AI provider connection per organization: OpenAI or Anthropic.</p>
          <div className="connections-actions">
            {data.canReplace && <button className="connections-primary" onClick={event => open("write", event)}>{data.configured ? "Replace credential or switch provider" : "Connect provider"}</button>}
            {data.configured && data.canRemove && <button onClick={event => open("remove", event)}>Remove connection</button>}
          </div>
          {!data.canReplace && !data.canRemove && <p className="connections-note">Contact an organization administrator to manage this connection.</p>}
        </div>}
    {dialog && data && <ConnectionDialog orgId={orgId} data={data} kind={dialog} onClose={close} onSaved={saved} />}
  </>;
}

function ConnectionDialog({ orgId, data, kind, onClose, onSaved }) {
  const [provider, setProvider] = useState(data.provider || "openai"), [secret, setSecret] = useState("");
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const root = useRef(null), controller = useRef(null), pending = useRef(false);
  const removing = kind === "remove";
  const title = removing ? "Remove organization AI connection?" : data.configured ? "Replace organization AI connection?" : "Connect provider";
  useEffect(() => {
    controller.current = new AbortController();
    root.current.querySelector("button, select")?.focus();
    return () => controller.current.abort();
  }, []);
  function close() { setSecret(""); onClose(); }
  function keys(event) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const items = [...root.current.querySelectorAll("button, select, input")].filter(item => !item.disabled);
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    // The entered secret is cleared as soon as it is handed to transport.
    const entered = secret; setSecret("");
    try {
      if (removing) await removeConnection(orgId, data.provider, controller.current.signal);
      else await putConnection(orgId, provider, entered, controller.current.signal);
      if (!controller.current.signal.aborted) onSaved();
    } catch (err) {
      if (!controller.current.signal.aborted) setError(messageFor(err));
    } finally {
      pending.current = false;
      if (!controller.current.signal.aborted) setBusy(false);
    }
  }
  return <div className="connections-overlay">
    <div className="connections-dialog" data-sentry-block="true" role="dialog" aria-modal="true" aria-labelledby="connection-dialog-title" aria-describedby="connection-dialog-description" ref={root} onKeyDown={keys}>
      <h2 id="connection-dialog-title">{title}</h2>
      <p id="connection-dialog-description">{data.configured ? "Organization workloads using the current provider may be affected. " : "This credential will be provided by your organization. "}Removing or replacing it in OmniBioAI does not revoke the credential with the provider.</p>
      <form onSubmit={submit}>
        {!removing && <>
          <label htmlFor="connection-provider">Provider</label>
          <select id="connection-provider" value={provider} disabled={busy} onChange={event => { setProvider(event.target.value); setSecret(""); setConfirmed(false); setError(""); }}>
            <option value="openai">OpenAI</option><option value="claude">Anthropic</option>
          </select>
          <label htmlFor="connection-secret">{LABELS[provider]} API key</label>
          <input id="connection-secret" data-sentry-mask="true" type="password" value={secret} onChange={event => setSecret(event.target.value)} disabled={busy} required maxLength={512} pattern="[!-~]+" autoComplete="off" spellCheck={false} autoCapitalize="none" />
          <p className="connections-note">Write-only. The existing credential is never retrieved or displayed.</p>
          {data.configured && <label className="connections-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />I confirm replacing {LABELS[data.provider]} with {LABELS[provider]} for this organization.</label>}
        </>}
        {error && <p role="alert">{error} {!removing && "Re-enter the key to retry."}</p>}
        <div className="connections-actions"><button type="button" onClick={close}>Cancel</button>
          <button className="connections-primary" type="submit" disabled={busy || (!removing && (!secret || (data.configured && !confirmed)))}>{busy ? "Saving…" : removing ? "Confirm removal" : data.configured ? "Confirm replacement" : "Save connection"}</button></div>
      </form>
    </div>
  </div>;
}
