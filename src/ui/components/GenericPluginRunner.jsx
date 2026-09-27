import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@omnibioai/ui";
import { Panel, PanelBody, PanelHeader } from "./UI";
import PluginResults from "./PluginResults";
import { csrfToken, pluginEndpoint } from "../lib/pluginApi";

const TERMINAL = new Set(["COMPLETED", "COMPLETE", "FAILED", "ERROR"]);

function inputName(input) {
  return input.widget === "text" ? `param_${input.id}` : `input_${input.id}`;
}

export default function GenericPluginRunner({ descriptor }) {
  const [values, setValues] = useState({});
  const [files, setFiles] = useState({});
  const [runId, setRunId] = useState("");
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const inputs = descriptor.inputs || [];
  const endpoint = useMemo(() => key => descriptor.endpoints[key].replace("{run_id}", runId), [descriptor, runId]);

  useEffect(() => {
    if (!runId || !status || TERMINAL.has(status.state)) return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const [statusResponse, logResponse] = await Promise.all([
          fetch(pluginEndpoint(endpoint("status")), { credentials: "same-origin", headers: { Accept: "application/json" } }),
          fetch(pluginEndpoint(endpoint("logs")), { credentials: "same-origin", headers: { Accept: "application/json" } }),
        ]);
        if (!statusResponse.ok || !logResponse.ok) throw new Error("Unable to read run status.");
        const nextStatus = await statusResponse.json();
        const nextLog = await logResponse.json();
        if (cancelled) return;
        setStatus(nextStatus);
        setLogs(Array.isArray(nextLog.lines) ? nextLog.lines : []);
        if (["COMPLETED", "COMPLETE"].includes(nextStatus.state)) {
          window.clearInterval(timer);
          const artifactResponse = await fetch(pluginEndpoint(endpoint("artifacts")), { credentials: "same-origin", headers: { Accept: "application/json" } });
          if (!artifactResponse.ok) throw new Error("Unable to read run artifacts.");
          const artifactPayload = await artifactResponse.json();
          if (!cancelled) setOutputs(Array.isArray(artifactPayload.outputs) ? artifactPayload.outputs : []);
        } else if (TERMINAL.has(nextStatus.state)) window.clearInterval(timer);
      } catch (pollError) {
        window.clearInterval(timer);
        if (!cancelled) setError(pollError.message || "Unable to poll run.");
      }
    };
    poll();
    timer = window.setInterval(poll, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [runId, endpoint]);

  function updateValue(id, value) {
    setValues(previous => ({ ...previous, [id]: value }));
  }

  function updateFiles(id, fileList) {
    setFiles(previous => ({ ...previous, [id]: Array.from(fileList || []) }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    for (const input of inputs) {
      if (!input.required) continue;
      if (input.widget === "file" && !(files[input.id] || []).length) {
        setError(`${input.label} is required.`);
        return;
      }
      if (input.widget === "text" && !String(values[input.id] || "").trim()) {
        setError(`${input.label} is required.`);
        return;
      }
    }
    const formData = new FormData();
    inputs.forEach(input => {
      if (input.widget === "file") (files[input.id] || []).forEach(file => formData.append(inputName(input), file));
      else if (values[input.id]) formData.append(inputName(input), values[input.id]);
    });
    setSubmitting(true);
    setRunId(""); setStatus(null); setLogs([]); setOutputs([]);
    try {
      const response = await fetch(pluginEndpoint(descriptor.endpoints.submit), {
        method: "POST", body: formData, credentials: "same-origin",
        headers: { Accept: "application/json", "X-CSRFToken": csrfToken() },
      });
      let payload = {};
      try { payload = await response.json(); } catch (_) { /* handled below */ }
      if (!response.ok) throw new Error(payload.error || `Unable to start run (${response.status}).`);
      if (!payload.run_id) throw new Error("Workbench did not return a run ID.");
      setRunId(payload.run_id);
      setStatus({ state: payload.status || "RUNNING" });
    } catch (submitError) {
      setError(submitError.message || "Unable to start run.");
    } finally {
      setSubmitting(false);
    }
  }

  const state = status?.state || "";
  return (
    <div className="native-plugin-page">
      <Panel>
        <PanelHeader title="Inputs" />
        <PanelBody>
          <form onSubmit={submit} encType="multipart/form-data">
            {inputs.map(input => (
              <div className="plugin-field" key={input.id}>
                <label htmlFor={`plugin-${input.id}`}>{input.label}{input.required ? " *" : ""}</label>
                <small>{input.description} ({input.format})</small>
                {input.widget === "text" ? (
                  <textarea id={`plugin-${input.id}`} rows="3" placeholder={input.placeholder || ""}
                    value={values[input.id] || ""} onChange={event => updateValue(input.id, event.target.value)} />
                ) : (
                  <input id={`plugin-${input.id}`} type="file" multiple={input.multiple}
                    accept={input.accept || undefined} required={input.required}
                    onChange={event => updateFiles(input.id, event.target.files)} />
                )}
              </div>
            ))}
            {error && <p role="alert" className="plugin-error">{error}</p>}
            <button type="submit" className="omni-btn omni-btn--primary" disabled={submitting}>{submitting ? "Submitting…" : "Run analysis"}</button>
          </form>
        </PanelBody>
      </Panel>
      {runId && (
        <Panel>
          <PanelHeader title="Run status" />
          <PanelBody>
            <p role="status">{state || "Queued"}{status?.detail ? `: ${status.detail}` : ""}</p>
            {logs.length > 0 && <pre className="plugin-log">{logs.join("\n")}</pre>}
            {state === "FAILED" || state === "ERROR" ? <p role="alert" className="plugin-error">{status?.detail || "The run failed."}</p> : null}
          </PanelBody>
        </Panel>
      )}
      {runId && ["COMPLETED", "COMPLETE"].includes(state) && <PluginResults outputs={outputs} downloadEndpoint={endpoint("download")} />}
    </div>
  );
}
