import React, { useEffect, useMemo, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "../UI";
import PluginForm from "./PluginForm";
import { pluginEndpoint } from "../../lib/pluginApi";

function valueAt(row, path) {
  return path.split(".").reduce((value, key) => value && value[key], row) ?? "";
}

function queryUrl(descriptor, values) {
  const url = new URL(pluginEndpoint(descriptor.endpoints.query), window.location.origin);
  descriptor.inputs.forEach(input => {
    const value = String(values[input.id] ?? input.default ?? "").trim();
    if (value) url.searchParams.set(input.query_key || input.id, value);
  });
  const target = url.origin === window.location.origin ? url.pathname : `${url.origin}${url.pathname}`;
  return `${target}${url.search}`;
}

export default function QueryRenderer({ descriptor }) {
  const initialValues = useMemo(() => Object.fromEntries(
    descriptor.inputs.map(input => [input.id, input.default || ""]),
  ), [descriptor]);
  const [values, setValues] = useState(initialValues);
  const [payload, setPayload] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => () => { setLoading(false); setDetailLoading(false); }, []);

  function updateValue(id, value) {
    setValues(previous => ({ ...previous, [id]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    for (const input of descriptor.inputs) {
      if (input.required && !String(values[input.id] ?? "").trim()) {
        setError(`${input.label} is required.`);
        return;
      }
    }
    setError(""); setDetail(null); setLoading(true);
    try {
      const response = await fetch(queryUrl(descriptor, values), {
        credentials: "same-origin", headers: { Accept: "application/json" },
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || `Query failed (${response.status}).`);
      setPayload(next);
    } catch (queryError) {
      setError(queryError.message || "Query failed.");
      setPayload(null);
    } finally { setLoading(false); }
  }

  async function loadDetail(id) {
    setDetailLoading(true); setError("");
    try {
      const path = descriptor.endpoints.detail.replace("{detail_id}", encodeURIComponent(id));
      const response = await fetch(pluginEndpoint(path), { credentials: "same-origin", headers: { Accept: "application/json" } });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || `Detail lookup failed (${response.status}).`);
      setDetail(next);
    } catch (detailError) { setError(detailError.message || "Detail lookup failed."); }
    finally { setDetailLoading(false); }
  }

  const result = descriptor.result;
  const rows = Array.isArray(payload && payload[result.rows_path]) ? payload[result.rows_path] : [];
  const detailEnabled = descriptor.capabilities?.detail === true;
  return (
    <div className="native-plugin-page">
      <Panel>
        <PanelHeader title="Query" />
        <PanelBody>
          <PluginForm inputs={descriptor.inputs} values={values} onValueChange={updateValue}
            onSubmit={submit} error={error} submitting={loading} submitLabel="Search" />
        </PanelBody>
      </Panel>
      {loading && <p role="status">Loading results…</p>}
      {payload && (
        <Panel>
          <PanelHeader title="Results" />
          <PanelBody>
            {rows.length === 0 ? <p>No results.</p> : (
              <table className="omni-table">
                <thead><tr>{result.columns.map(column => <th key={column.key}>{column.label}</th>)}{detailEnabled && result.detail_key && <th>Detail</th>}</tr></thead>
                <tbody>{rows.map((row, index) => {
                  const detailId = result.detail_key ? valueAt(row, result.detail_key) : "";
                  return <tr key={detailId || index}>{result.columns.map(column => <td key={column.key}>{String(valueAt(row, column.key))}</td>)}{detailEnabled && result.detail_key && <td><button type="button" onClick={() => loadDetail(detailId)} disabled={!detailId || detailLoading}>View</button></td>}</tr>;
                })}</tbody>
              </table>
            )}
          </PanelBody>
        </Panel>
      )}
      {detail && (
        <Panel>
          <PanelHeader title="Detail" />
          <PanelBody><dl>{Object.entries(detail).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)).map(([key, value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{String(value)}</dd></React.Fragment>)}</dl></PanelBody>
        </Panel>
      )}
    </div>
  );
}
