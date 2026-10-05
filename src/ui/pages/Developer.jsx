import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Spinner, Table } from "@omnibioai/ui";
import Login from "../components/Login";
import * as apiKeysApi from "../lib/apiKeysApi";
import { useAccountDateTime } from "../components/PreferencesProvider";

// Self-service API keys for the public Literature AI API. A key is shown in
// full exactly once, right after creation; afterwards only its prefix is
// ever listed (omnibioai-auth stores only a hash). Revoking takes effect at
// the gateway immediately.

// The public API is served by the API gateway, which nginx exposes at
// /_svc/gateway on the same origin as the web app.
export function apiBaseUrl() {
  return `${window.location.origin}/_svc/gateway`;
}

const sectionTitleStyle = { fontSize: "var(--font-size-sm)", fontWeight: 700, color: "#fff", marginBottom: 10 };
const mutedStyle = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" };
const codeStyle = {
  fontFamily: "var(--mono)", fontSize: "var(--font-size-xs)", whiteSpace: "pre-wrap", wordBreak: "break-all",
  background: "var(--bg)", border: "1px solid var(--border)", padding: "10px 12px", margin: 0,
};

export default function Developer({ currentUser }) {
  if (!currentUser) {
    return <Login title="Sign in required" description="API keys belong to your OmniBioAI account." />;
  }
  return <ApiKeys />;
}

function ApiKeys() {
  const formatDate = useAccountDateTime();
  const [keys, setKeys] = useState(null);
  const [error, setError] = useState("");
  const [noOrgContext, setNoOrgContext] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setKeys(await apiKeysApi.listMyApiKeys());
    } catch (err) {
      setKeys([]);
      // omnibioai-auth's _self_service_membership dependency (shared by
      // every /me/api-keys route) returns exactly this 400 for one reason
      // only: the caller's session has no org_id claim at all -- a
      // platform admin with no personal org membership, same root cause
      // as Billing.jsx's old "No organization context" state, not a
      // transient failure worth retrying or a generic error. A personal
      // API key is scoped to an org the caller actually belongs to, so
      // unlike Billing there's no "pick any org" admin capability that
      // would make sense here -- org-scoped key administration already
      // has its own surface (see this file's own header comment).
      if (err?.status === 400) {
        setNoOrgContext(true);
      } else {
        setError(err?.message || "Failed to load API keys");
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (noOrgContext) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px 16px 0" }}>
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <Card elevated>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>No organization context</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
              Personal API keys belong to an organization your account is a
              member of. Your session isn’t associated with one, so there’s
              nothing to create a key in.
            </div>
          </Card>
        </div>
      </div>
    );
  }

  async function create() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      setCreated(await apiKeysApi.createMyApiKey(name.trim() || "API key"));
      setName("");
      await load();
    } catch (err) {
      setError(err?.message || "Could not create the key");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row) {
    if (!window.confirm(`Revoke "${row.name || row.key_prefix}"? Requests using it will fail immediately.`)) return;
    setError("");
    try {
      await apiKeysApi.revokeMyApiKey(row.id);
      if (created?.id === row.id) setCreated(null);
      await load();
    } catch (err) {
      setError(err?.message || "Could not revoke the key");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
    } catch (_) {
      setCopied(false);
    }
  }

  const base = apiBaseUrl();
  const sampleKey = created?.key || "omni_sk_...";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 3 }}>Developer</div>
        <div style={{ ...mutedStyle, fontFamily: "var(--mono)" }}>API keys for the Literature AI API</div>
      </div>

      {error && <Badge variant="danger">{error}</Badge>}

      <Card elevated>
        <div style={sectionTitleStyle}>Create a key</div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px" }}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name, e.g. notebook" />
          </div>
          <Button variant="primary" size="sm" disabled={busy} onClick={create}>Create key</Button>
        </div>
        <div style={{ ...mutedStyle, marginTop: 8 }}>
          Keys can read the literature API (dataset.read) in your current organization. Usage is billed to it.
        </div>

        {created && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <Badge variant="warning">Copy this key now. It will not be shown again.</Badge>
            <pre style={codeStyle} data-testid="new-key">{created.key}</pre>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={copy}>{copied ? "Copied" : "Copy key"}</Button>
              <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>Done</Button>
            </div>
          </div>
        )}
      </Card>

      <Card elevated>
        <div style={sectionTitleStyle}>Your keys</div>
        {keys === null ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", ...mutedStyle }}><Spinner size="sm" /> Loading…</div>
        ) : (
          <Table
            columns={[
              { key: "name", label: "Name", render: (v) => v || "—" },
              { key: "key_prefix", label: "Key", render: (v) => <span style={{ fontFamily: "var(--mono)" }}>{v}…</span> },
              { key: "created_at", label: "Created", render: (v) => formatDate(v) },
              { key: "last_used_at", label: "Last used", render: (v) => formatDate(v) },
              {
                key: "status", label: "Status",
                render: (v) => <Badge variant={v === "active" ? "success" : "neutral"}>{v}</Badge>,
              },
              {
                key: "id", label: "", align: "right",
                render: (_, row) => row.status === "active"
                  ? <Button variant="danger" size="sm" onClick={() => revoke(row)}>Revoke</Button>
                  : null,
              },
            ]}
            data={keys}
            emptyMessage="No API keys yet."
          />
        )}
      </Card>

      <Card elevated>
        <div style={sectionTitleStyle}>Quick start</div>
        <div style={{ ...mutedStyle, marginBottom: 8 }}>
          Base URL: <span style={{ fontFamily: "var(--mono)" }}>{base}</span>. Each answer is billed; repeat a request
          with the same Idempotency-Key and it is answered from the stored result, not billed again.
        </div>
        <pre style={codeStyle}>{`curl ${base}/v1/literature/answers \\
  -H "Authorization: Bearer ${sampleKey}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"query": "What is the role of TP53 in cancer?"}'`}</pre>
        <pre style={{ ...codeStyle, marginTop: 8 }}>{`pip install omnibioai-sdk
from omnibioai import OmniBioAI
client = OmniBioAI(api_key="${sampleKey}", base_url="${base}")
print(client.literature.ask("What is the role of TP53 in cancer?"))`}</pre>
        <pre style={{ ...codeStyle, marginTop: 8 }}>{`# MCP server for Claude, ChatGPT and other MCP clients
pip install "omnibioai-sdk[mcp]"
OMNIBIOAI_API_KEY=${sampleKey} OMNIBIOAI_BASE_URL=${base} omnibioai-mcp`}</pre>
      </Card>
    </div>
  );
}
