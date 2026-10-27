import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Card, Spinner } from "@omnibioai/ui";
import Login from "../components/Login";
import * as apiKeysApi from "../lib/apiKeysApi";
import { getUsageLimits } from "../lib/billingApi";
import { getIdentity, getSessionVersion, onSessionChange } from "../lib/session";
import "./Developer.css";

export function apiBaseUrl() {
  return "https://webstudio.omnibioai.org/_svc/gateway";
}

// Only allow list metadata into table state, even if a response includes extras.
function keyMetadata(row) {
  const { id, name, key_prefix, status, created_at, last_used_at, expires_at } = row;
  return { id, name, key_prefix, status, created_at, last_used_at, expires_at };
}

function timestamp(value) {
  if (!value) return null;
  const text = String(value);
  const date = new Date(/T/.test(text) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(text) ? `${text}Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarDate(value, fallback = "—") {
  const date = timestamp(value);
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date) : fallback;
}

function lastUsed(value) {
  if (!value) return "Never";
  const date = timestamp(value);
  if (!date) return "—";
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const [unit, size] = seconds < 3600 ? ["minute", 60]
    : seconds < 86400 ? ["hour", 3600]
      : seconds < 2592000 ? ["day", 86400]
        : seconds < 31536000 ? ["month", 2592000] : ["year", 31536000];
  return new Intl.RelativeTimeFormat("en-US").format(-Math.floor(seconds / size), unit);
}

function CopyButton({ targetRef, label, children = "Copy", text }) {
  const [feedback, setFeedback] = useState("");

  async function copy() {
    if (!targetRef.current) return;
    try {
      await navigator.clipboard.writeText(text ?? targetRef.current.textContent);
      if (targetRef.current) setFeedback("copied");
    } catch {
      // Select the existing text; never duplicate a secret in a hidden input.
      if (!targetRef.current) return;
      targetRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(targetRef.current);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      setFeedback("selected");
    }
  }

  return <div className="developer-copy">
    <button type="button" className="developer-button" aria-label={label} onClick={copy}>
      {feedback === "copied" ? "Copied" : children}
    </button>
    <span className="developer-copy-feedback" role="status">
      {feedback === "selected" ? "Text selected. Press Ctrl+C or ⌘C to copy." : ""}
    </span>
  </div>;
}

function WrappedCode({ children }) {
  return String(children).split("\n").map((line, index, lines) => <React.Fragment key={index}>
    <span className="developer-code-line">{line}</span>{index < lines.length - 1 ? "\n" : null}
  </React.Fragment>);
}

function NewKeyPanel({ secret, onDone }) {
  const [saved, setSaved] = useState(false);
  const secretRef = useRef(null);
  const headingRef = useRef(null);
  useEffect(() => {
    headingRef.current?.focus();
    return () => window.getSelection()?.removeAllRanges();
  }, []);

  return <section className="developer-new-key sentry-block" data-sentry-block="true" aria-labelledby="new-key-heading">
    <h3 id="new-key-heading" tabIndex={-1} ref={headingRef}>Your new API key</h3>
    <p>Copy it now. You won’t be able to see the full key again.</p>
    <pre className="developer-code sentry-mask" data-sentry-mask="true" data-testid="new-key" tabIndex={0} ref={secretRef}>{secret}</pre>
    <CopyButton targetRef={secretRef} label="Copy key">Copy key</CopyButton>
    <p className="developer-export-label">Use an environment variable:</p>
    <pre className="developer-code developer-export" tabIndex={0}><code>{'export OMNIBIOAI_API_KEY="omni_sk_…"'}</code></pre>
    <label className="developer-saved">
      <input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} />
      <span>I’ve saved this key somewhere safe</span>
    </label>
    <button type="button" className="developer-button developer-primary" disabled={!saved} onClick={onDone}>Done</button>
  </section>;
}

const tabs = ["cURL", "Python", "MCP"];

function QuickStart() {
  const [tab, setTab] = useState("cURL");
  const baseRef = useRef(null);
  const codeRef = useRef(null);
  const tabRefs = useRef([]);
  const base = apiBaseUrl();
  const examples = {
    cURL: `# Generate once; keep this value for retries.
IDEMPOTENCY_KEY=$(uuidgen)

curl "${base}/v1/literature/answers" \\
  -H "Authorization: Bearer $OMNIBIOAI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \\
  -d '{"query": "What is the role of TP53 in cancer?"}'`,
    Python: `# pip install omnibioai-sdk
import os
import uuid
from omnibioai import OmniBioAI

client = OmniBioAI(
    api_key=os.environ["OMNIBIOAI_API_KEY"],
    base_url="${base}",
)

# Keep this ID when retrying the same answer.
request_id = str(uuid.uuid4())
answer = client.literature.ask(
    "What is the role of TP53 in cancer?",
    idempotency_key=request_id,
)
print(answer)`,
    MCP: `pip install "omnibioai-sdk[mcp]"

# Uses the key from your environment.
OMNIBIOAI_API_KEY="$OMNIBIOAI_API_KEY" \\
OMNIBIOAI_BASE_URL="${base}" \\
  omnibioai-mcp`,
  };

  function moveTab(event, index) {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setTab(tabs[next]);
    tabRefs.current[next].focus();
  }

  return <section aria-labelledby="quick-start-heading">
    <Card className="developer-card">
      <h2 id="quick-start-heading">Quick start</h2>
      <p className="developer-muted">Set <code>OMNIBIOAI_API_KEY</code> in your environment before running an example.</p>
      <div className="developer-base-label" id="api-base-label">Base URL</div>
      <div className="developer-base">
        <pre className="developer-code" ref={baseRef} tabIndex={0} aria-labelledby="api-base-label">{base}</pre>
        <CopyButton targetRef={baseRef} label="Copy base URL" />
      </div>
      <div className="developer-tabs" role="tablist" aria-label="Quick start examples">
        {tabs.map((name, index) => <button key={name} type="button" role="tab" id={`developer-tab-${name}`}
          aria-controls={`developer-panel-${name}`} aria-selected={tab === name} tabIndex={tab === name ? 0 : -1}
          ref={node => { tabRefs.current[index] = node; }} onClick={() => setTab(name)} onKeyDown={event => moveTab(event, index)}>{name}</button>)}
      </div>
      <div role="tabpanel" id={`developer-panel-${tab}`} aria-labelledby={`developer-tab-${tab}`}>
        <div className="developer-code-toolbar">
          <span className="developer-muted">{tab === "Python" ? "Python" : "Terminal"}</span>
          <CopyButton key={tab} targetRef={codeRef} label={`Copy ${tab} example`} text={examples[tab]} />
        </div>
        <pre className="developer-code developer-example developer-wrapped-code" tabIndex={0} ref={codeRef}><code><WrappedCode>{examples[tab]}</WrappedCode></code></pre>
      </div>
      <p className="developer-idempotency">Each answer is billed once. Send the same Idempotency-Key to retry safely: you get the stored answer and aren’t billed again.</p>
      <a className="developer-docs" href="https://docs.omnibioai.org/developer/api/" target="_blank" rel="noopener noreferrer">API docs <span aria-hidden="true">↗</span></a>
    </Card>
  </section>;
}

export default function Developer({ currentUser }) {
  const sessionVersion = useSyncExternalStore(onSessionChange, getSessionVersion);
  if (!currentUser) return <Login title="Sign in required" description="API keys belong to your OmniBioAI account." />;
  // Changing identity, organization, or session discards all secret-bearing state.
  return <ApiKeys key={`${currentUser.userId ?? currentUser.email}:${currentUser.orgId}:${sessionVersion}`} currentUser={currentUser} />;
}

function ApiKeys({ currentUser }) {
  const [keys, setKeys] = useState(null);
  const [listError, setListError] = useState("");
  const [createError, setCreateError] = useState("");
  const [noOrgContext, setNoOrgContext] = useState(false);
  const [orgName, setOrgName] = useState(null);
  const [usage, setUsage] = useState(null);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [newKeyId, setNewKeyId] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState("");
  const controller = useRef(null);
  const secretGeneration = useRef(0);
  const inputRef = useRef(null);
  const cancelRevokeRef = useRef(null);
  const revokeTriggerRef = useRef(null);

  const load = useCallback(async (signal) => {
    setListError("");
    try {
      const rows = await apiKeysApi.listMyApiKeys({ signal });
      if (!signal.aborted && rows !== null) setKeys(rows.map(keyMetadata));
    } catch (error) {
      if (signal.aborted) return;
      if (error?.status === 400) setNoOrgContext(true);
      else setListError("Could not load API keys. Please try again.");
    }
  }, []);

  useEffect(() => {
    const lifecycle = new AbortController();
    controller.current = lifecycle;
    load(lifecycle.signal);
    getIdentity({ signal: lifecycle.signal }).then(identity => {
      if (lifecycle.signal.aborted) return;
      const org = identity?.organizations?.find(row => String(row.organization_id) === String(currentUser.orgId));
      setOrgName(typeof org?.organization_name === "string" ? org.organization_name.trim() || null : null);
    }).catch(() => {});
    if (currentUser.orgId != null) {
      getUsageLimits(currentUser.orgId).then(result => {
        if (lifecycle.signal.aborted) return;
        const row = result?.limits?.find(limit => limit.service === "api" && limit.action === "completed"
          && ["literature.answer", "literature.answers"].includes(limit.resource));
        if (row?.used == null || row?.included == null) return;
        const used = Number(row.used), included = Number(row.included);
        if (Number.isFinite(used) && Number.isFinite(included) && used >= 0 && included > 0) setUsage({ used, included });
      }).catch(() => {}); // Billing access is optional; no error is shown.
    }
    const clearSecret = () => {
      secretGeneration.current += 1;
      setCreated(null);
    };
    window.addEventListener("pagehide", clearSecret);
    return () => {
      lifecycle.abort();
      secretGeneration.current += 1;
      window.removeEventListener("pagehide", clearSecret);
      // Unmount releases the component's secret state; late responses are ignored.
    };
  }, [currentUser.orgId, load]);

  useEffect(() => { if (confirmation) cancelRevokeRef.current?.focus(); }, [confirmation]);
  useEffect(() => { if (!created && newKeyId !== null) inputRef.current?.focus(); }, [created, newKeyId]);

  async function create(event) {
    event.preventDefault();
    setNameTouched(true);
    if (!name.trim()) return;
    if (creating || created) return;
    const signal = controller.current.signal;
    const generation = secretGeneration.current;
    setCreating(true);
    setCreateError("");
    try {
      const result = await apiKeysApi.createMyApiKey(name.trim(), { signal });
      if (signal.aborted || generation !== secretGeneration.current || !result?.key) return;
      setCreated({ id: result.id, key: result.key });
      setNewKeyId(result.id);
      setKeys(rows => [keyMetadata({ ...result, status: "active" }), ...(rows || []).filter(row => row.id !== result.id)]);
      setName("");
      await load(signal);
    } catch (error) {
      if (signal.aborted || generation !== secretGeneration.current) return;
      // Do not render or report raw errors from secret-bearing requests.
      setCreateError(error?.status === 409 ? "At most 10 active keys; revoke one first."
        : error?.status === 402 ? "Your organization needs an active billing plan to create keys."
          : "Could not create the key. Please try again.");
    } finally {
      if (!signal.aborted) setCreating(false);
    }
  }

  function dismissSecret() {
    setCreated(null);
    inputRef.current?.focus();
  }

  function cancelRevoke() {
    setConfirmation(null);
    setRevokeError("");
    revokeTriggerRef.current?.focus();
  }

  async function revoke() {
    if (revoking) return;
    const signal = controller.current.signal;
    const id = confirmation.id;
    setRevoking(true);
    setRevokeError("");
    try {
      await apiKeysApi.revokeMyApiKey(id, { signal });
      if (signal.aborted) return;
      setCreated(value => value?.id === id ? null : value);
      setKeys(rows => rows?.map(row => row.id === id ? { ...row, status: "revoked" } : row));
      setConfirmation(null);
      inputRef.current?.focus();
      await load(signal);
    } catch {
      if (!signal.aborted) setRevokeError("Could not revoke the key. Please try again.");
    } finally {
      if (!signal.aborted) setRevoking(false);
    }
  }

  if (noOrgContext) return <section className="developer-page developer-no-org">
    <Card className="developer-card"><h2>No organization context</h2><p className="developer-muted">Personal API keys belong to an organization your account is a member of. Your session isn’t associated with one, so there’s nothing to create a key in.</p></Card>
  </section>;

  const activeKeys = keys?.filter(row => row.status !== "revoked") || [];
  const revokedKeys = keys?.filter(row => row.status === "revoked") || [];
  const hideRevoked = revokedKeys.length > 3 && !showRevoked;
  const visibleKeys = [...activeKeys, ...(hideRevoked ? [] : revokedKeys)];

  return <div className="developer-page">
    <header className="developer-header">
      <div><h2>API keys</h2><p>Call the Literature AI API from scripts, notebooks and MCP clients.</p></div>
      {usage && <a className="developer-usage" href="/studio/account/organization/usage" aria-label={`Literature answers ${usage.used} / ${usage.included}. View Usage`}>
        <span>Literature answers <strong>{usage.used.toLocaleString("en-US")} / {usage.included.toLocaleString("en-US")}</strong></span>
        <progress value={Math.min(usage.used, usage.included)} max={usage.included} aria-label="Literature answers used" />
      </a>}
    </header>
    <div className="developer-grid">
      <div className="developer-column">
        <section aria-labelledby="create-key-heading"><Card className="developer-card">
          <h2 id="create-key-heading">Create a key</h2>
          <form onSubmit={create}>
            <label htmlFor="developer-key-name">Key name</label>
            <div className="developer-create-controls">
              <input id="developer-key-name" ref={inputRef} value={name}
                onChange={event => { setName(event.target.value); setNameTouched(true); }} onBlur={() => setNameTouched(true)}
                placeholder="e.g. notebook" maxLength={100} disabled={creating || !!created}
                aria-invalid={nameTouched && !name.trim()} aria-describedby={nameTouched && !name.trim() ? "developer-key-name-error" : undefined} />
              <button type="submit" className="developer-button developer-primary" disabled={creating || !!created || !name.trim()}>{creating ? "Creating…" : "Create key"}</button>
            </div>
            {nameTouched && !name.trim() && <p id="developer-key-name-error" className="developer-field-error">Enter a name for this key.</p>}
          </form>
          <p className="developer-scope"><code>dataset.read</code><span>{orgName ? `in ${orgName} · ` : ""}usage is billed to this organization</span></p>
          {createError && <p className="developer-error" role="alert">{createError}</p>}
          {created && <NewKeyPanel key={created.id} secret={created.key} onDone={dismissSecret} />}
        </Card></section>

        <section aria-labelledby="your-keys-heading"><Card className="developer-card">
          <h2 id="your-keys-heading">Your keys</h2>
          {listError && <div className="developer-error" role="alert">{listError} <button type="button" className="developer-button" onClick={() => load(controller.current.signal)}>Retry</button></div>}
          {keys === null && !listError && <div className="developer-loading" role="status"><Spinner size="sm" /> Loading keys…</div>}
          {keys?.length === 0 && <div className="developer-empty"><strong>No API keys yet.</strong><p>Create a key to call the API from scripts, notebooks or MCP clients.</p></div>}
          {!!keys?.length && <div className="developer-table-scroll" tabIndex={0} role="region" aria-label="Your API keys">
            <table className="developer-table">
              <thead><tr><th scope="col">Name</th><th scope="col">Key</th><th scope="col">Created</th><th scope="col">Last used</th><th scope="col">Expires</th><th scope="col"><span className="developer-sr-only">Actions</span></th></tr></thead>
              <tbody>{visibleKeys.map(row => <tr key={row.id} className={row.status === "revoked" ? "developer-key-row-revoked" : undefined}>
                <th scope="row"><span className="developer-key-name">{row.name || "API key"}</span>{row.id === newKeyId && row.status === "active" && <span className="developer-new-badge">New</span>}</th>
                <td><code>{row.key_prefix}…</code></td>
                <td>{calendarDate(row.created_at)}</td>
                <td>{lastUsed(row.last_used_at)}</td>
                <td>{calendarDate(row.expires_at, "Never")}</td>
                <td>{row.status === "active" ? <button type="button" className="developer-button developer-revoke" aria-label={`Revoke key ${row.name || row.key_prefix}`} disabled={revoking}
                  onClick={event => { revokeTriggerRef.current = event.currentTarget; setConfirmation(row); setRevokeError(""); }}>Revoke</button> : <span className="developer-muted">{row.status === "revoked" ? "Revoked" : "Expired"}</span>}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          {revokedKeys.length > 3 && <button type="button" className="developer-revoked-toggle" aria-expanded={showRevoked}
            onClick={() => setShowRevoked(value => !value)}>{showRevoked ? "Hide revoked" : `Show revoked (${revokedKeys.length})`}</button>}
          {confirmation && <section className="developer-confirmation" aria-labelledby="revoke-heading" onKeyDown={event => { if (event.key === "Escape" && !revoking) cancelRevoke(); }}>
            <h3 id="revoke-heading">Revoke ‘{confirmation.name || confirmation.key_prefix}’?</h3>
            <p>Scripts using it will stop working.</p>
            {revokeError && <p className="developer-error" role="alert">{revokeError}</p>}
            <div className="developer-confirm-actions">
              <button type="button" className="developer-button" ref={cancelRevokeRef} onClick={cancelRevoke} disabled={revoking}>Cancel</button>
              <button type="button" className="developer-button developer-revoke" aria-label={`Confirm revoke key ${confirmation.name || confirmation.key_prefix}`} onClick={revoke} disabled={revoking}>{revoking ? "Revoking…" : "Revoke key"}</button>
            </div>
          </section>}
        </Card></section>
      </div>
      <QuickStart />
    </div>
  </div>;
}
