import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Spinner } from "@omnibioai/ui";
import * as securityApi from "../lib/securityApi";
import * as apiKeysApi from "../lib/apiKeysApi";
import MfaManagement from "../components/security/MfaManagement";
import { useAccountDateTime } from "../components/PreferencesProvider";

const loadingState = () => ({ status: "loading", data: null, error: "" });

function SectionState({ state, label, onRetry }) {
  if (state.status === "loading") {
    return <div className="security-state"><Spinner size="sm" /> Loading {label}…</div>;
  }
  if (state.status === "error") {
    return (
      <div className="security-section-error" role="alert">
        <span>{state.error}</span>
        <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
      </div>
    );
  }
  return null;
}

function StatusRow({ label, children }) {
  return <div className="security-fact"><dt>{label}</dt><dd>{children}</dd></div>;
}

export default function AccountSecurity({ currentUser }) {
  const formatDate = useAccountDateTime();
  const ownerKey = `${currentUser?.userId ?? ""}:${currentUser?.email ?? ""}`;
  const generation = useRef(0);
  const [mfa, setMfa] = useState(loadingState);
  const [sessions, setSessions] = useState(loadingState);
  const [apiKeys, setApiKeys] = useState(loadingState);
  const [keyName, setKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const [creating, setCreating] = useState(false);
  const [revokingSession, setRevokingSession] = useState(null);
  const [revokingKey, setRevokingKey] = useState(null);

  const guarded = useCallback(async (loader, setter, label, requestGeneration = generation.current) => {
    setter(loadingState());
    try {
      const data = await loader();
      if (requestGeneration === generation.current && data !== null) {
        setter({ status: "success", data, error: "" });
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (requestGeneration === generation.current) {
        setter({ status: "error", data: null, error: `Unable to load ${label}.` });
      }
    }
  }, []);

  const loadMfa = useCallback(() => guarded(securityApi.listMfaDevices, setMfa, "multi-factor authentication"), [guarded]);
  const loadSessions = useCallback(() => guarded(securityApi.listSessions, setSessions, "sessions"), [guarded]);
  const loadApiKeys = useCallback(() => guarded(apiKeysApi.listMyApiKeys, setApiKeys, "API keys"), [guarded]);

  useEffect(() => {
    generation.current += 1;
    const requestGeneration = generation.current;
    setCreatedKey(null);
    setKeyName("");
    setCreating(false);
    setRevokingSession(null);
    setRevokingKey(null);
    if (!currentUser) {
      setMfa({ status: "success", data: [], error: "" });
      setSessions({ status: "success", data: [], error: "" });
      setApiKeys({ status: "success", data: [], error: "" });
      return () => { generation.current += 1; };
    }
    guarded(securityApi.listMfaDevices, setMfa, "multi-factor authentication", requestGeneration);
    guarded(securityApi.listSessions, setSessions, "sessions", requestGeneration);
    guarded(apiKeysApi.listMyApiKeys, setApiKeys, "API keys", requestGeneration);
    return () => { generation.current += 1; };
  }, [ownerKey, currentUser, guarded]);

  const verifiedDevices = useMemo(
    () => (mfa.status === "success" ? mfa.data.filter(device => device.verified_at) : []),
    [mfa],
  );
  const activeSessions = useMemo(
    () => (sessions.status === "success" ? sessions.data.filter(session => session.status === "active") : []),
    [sessions],
  );
  const activeKeys = useMemo(
    () => (apiKeys.status === "success" ? apiKeys.data.filter(key => key.status === "active") : []),
    [apiKeys],
  );

  async function revokeSession(row) {
    if (!window.confirm(`Revoke session ${row.session_id}? You may need to sign in again on that client.`)) return;
    const requestGeneration = generation.current;
    setRevokingSession(row.session_id);
    try {
      const result = await securityApi.revokeSession(row.session_id);
      if (requestGeneration === generation.current && result !== null) await loadSessions();
    } catch (_) {
      if (requestGeneration === generation.current) {
        setSessions(previous => ({ ...previous, error: "Unable to revoke this session." }));
      }
    } finally {
      if (requestGeneration === generation.current) setRevokingSession(null);
    }
  }

  async function createKey() {
    const requestGeneration = generation.current;
    setCreating(true);
    setCreatedKey(null);
    try {
      const result = await apiKeysApi.createMyApiKey(keyName.trim() || "Account key");
      if (requestGeneration === generation.current && result !== null) {
        setCreatedKey(result);
        setKeyName("");
        await loadApiKeys();
      }
    } catch (_) {
      if (requestGeneration === generation.current) {
        setApiKeys(previous => ({ ...previous, error: "Unable to create an API key." }));
      }
    } finally {
      if (requestGeneration === generation.current) setCreating(false);
    }
  }

  async function revokeKey(row) {
    if (!window.confirm(`Revoke “${row.name || row.key_prefix}”? Requests using it will fail immediately.`)) return;
    const requestGeneration = generation.current;
    setRevokingKey(row.id);
    try {
      await apiKeysApi.revokeMyApiKey(row.id);
      if (requestGeneration === generation.current) {
        if (createdKey?.id === row.id) setCreatedKey(null);
        await loadApiKeys();
      }
    } catch (_) {
      if (requestGeneration === generation.current) {
        setApiKeys(previous => ({ ...previous, error: "Unable to revoke this API key." }));
      }
    } finally {
      if (requestGeneration === generation.current) setRevokingKey(null);
    }
  }

  async function copyCreatedKey() {
    if (createdKey?.key) await navigator.clipboard.writeText(createdKey.key).catch(() => {});
  }

  return (
    <div className="security-page">
      <header>
        <h1>Security</h1>
        <p>Protect your OmniBioAI account</p>
      </header>

      <Card elevated>
        <section aria-labelledby="security-overview-heading">
          <h2 id="security-overview-heading">Security overview</h2>
          <dl className="security-facts">
            <StatusRow label="Multi-factor authentication">
              {mfa.status === "success" ? (verifiedDevices.length ? "Enabled" : "Not enabled") : "Unavailable"}
            </StatusRow>
            <StatusRow label="Active sessions">
              {sessions.status === "success" ? activeSessions.length : "Unavailable"}
            </StatusRow>
            <StatusRow label="Active personal API keys">
              {apiKeys.status === "success" ? activeKeys.length : "Unavailable"}
            </StatusRow>
          </dl>
        </section>
      </Card>

      <Card elevated>
        <section aria-labelledby="mfa-heading">
          <h2 id="mfa-heading">Multi-factor authentication</h2>
          <p className="security-muted">Add an additional layer of protection to your OmniBioAI account.</p>
          <SectionState state={mfa} label="MFA status" onRetry={loadMfa} />
          {mfa.status === "success" && (
            <>
              <div className="security-section-summary">
                <Badge variant={verifiedDevices.length ? "success" : "neutral"}>
                  {verifiedDevices.length ? "Enabled" : "Not enabled"}
                </Badge>
                <span>{verifiedDevices.length} verified {verifiedDevices.length === 1 ? "device" : "devices"}</span>
              </div>
            </>
          )}
          <MfaManagement currentUser={currentUser} devices={mfa.status === "success" ? mfa.data : null} onChanged={loadMfa} />
        </section>
      </Card>

      <Card elevated>
        <section aria-labelledby="sessions-heading">
          <h2 id="sessions-heading">Active sessions</h2>
          <p className="security-muted">Sessions currently authorized for your account. IAM does not identify which row is this device.</p>
          <SectionState state={sessions} label="sessions" onRetry={loadSessions} />
          {sessions.error && sessions.status === "success" && <div className="security-inline-error" role="alert">{sessions.error}</div>}
          {sessions.status === "success" && activeSessions.length === 0 && <p className="security-empty">No active sessions.</p>}
          {activeSessions.map(session => (
            <div className="security-row" key={session.session_id}>
              <div>
                <strong>{session.auth_method || "Authentication method unavailable"}</strong>
                <span>Created {formatDate(session.created_at)}</span>
                <span>Last active {formatDate(session.last_activity_at)}</span>
                {session.user_agent && <span>{session.user_agent}</span>}
                {session.client_ip && <span>IP {session.client_ip}</span>}
              </div>
              <Button variant="danger" size="sm" disabled={revokingSession === session.session_id}
                onClick={() => revokeSession(session)}>
                {revokingSession === session.session_id ? "Revoking…" : "Revoke"}
              </Button>
            </div>
          ))}
        </section>
      </Card>

      <Card elevated>
        <section aria-labelledby="api-keys-heading">
          <h2 id="api-keys-heading">Personal API keys</h2>
          <p className="security-muted">Use personal API keys to access permitted OmniBioAI APIs in your current organization.</p>
          <SectionState state={apiKeys} label="API keys" onRetry={loadApiKeys} />
          {apiKeys.error && apiKeys.status === "success" && <div className="security-inline-error" role="alert">{apiKeys.error}</div>}
          {apiKeys.status === "success" && (
            <>
              <div className="security-key-create">
                <label htmlFor="security-key-name">Key name</label>
                <div><input id="security-key-name" className="studio-field security-key-input" value={keyName}
                  onChange={event => setKeyName(event.target.value)} placeholder="e.g. notebook" />
                  <Button variant="primary" size="sm" disabled={creating} onClick={createKey}>{creating ? "Creating…" : "Create API key"}</Button></div>
              </div>
              {createdKey && (
                <div className="security-created-key" role="status">
                  <strong>Copy this key now. It will not be shown again.</strong>
                  <code>{createdKey.key}</code>
                  <div><Button variant="secondary" size="sm" onClick={copyCreatedKey}>Copy</Button>
                    <Button variant="ghost" size="sm" onClick={() => setCreatedKey(null)}>Done</Button></div>
                </div>
              )}
              {apiKeys.data.length === 0 && <p className="security-empty">No personal API keys.</p>}
              {apiKeys.data.map(key => (
                <div className="security-row" key={key.id}>
                  <div><strong>{key.name || key.key_prefix}</strong><span><code>{key.key_prefix}…</code></span>
                    <span>Created {formatDate(key.created_at)}</span>{key.last_used_at && <span>Last used {formatDate(key.last_used_at)}</span>}</div>
                  <div className="security-row-actions"><Badge variant={key.status === "active" ? "success" : "neutral"}>{key.status}</Badge>
                    {key.status === "active" && <Button variant="danger" size="sm" disabled={revokingKey === key.id} onClick={() => revokeKey(key)}>
                      {revokingKey === key.id ? "Revoking…" : "Revoke"}
                    </Button>}</div>
                </div>
              ))}
            </>
          )}
        </section>
      </Card>
    </div>
  );
}
