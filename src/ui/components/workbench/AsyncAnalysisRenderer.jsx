import React, { useEffect, useMemo, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "../UI";
import PluginResults from "../PluginResults";
import PluginForm from "./PluginForm";
import LogViewer from "./LogViewer";
import RunStatus from "./RunStatus";
import { descriptorComponent } from "./PluginField";
import { csrfToken, pluginEndpoint } from "../../lib/pluginApi";
import { validateArtifactPayload } from "../../lib/pluginUiContracts";

const TERMINAL = new Set(["COMPLETED", "COMPLETE", "FAILED", "ERROR"]);

function inputName(input) {
  return descriptorComponent(input) === "text" || descriptorComponent(input) === "textarea"
    ? `param_${input.id}`
    : `input_${input.id}`;
}

export default function AsyncAnalysisRenderer({ descriptor }) {
  const [values, setValues] = useState({});
  const [files, setFiles] = useState({});
  const [runId, setRunId] = useState("");
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [renderedResult, setRenderedResult] = useState(null);
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
          if (!cancelled) {
            setArtifacts(validateArtifactPayload(artifactPayload, descriptor.artifacts?.max_items || 100));
            setRenderedResult(artifactPayload.render || null);
          }
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
      if (descriptorComponent(input) === "file" && !(files[input.id] || []).length) {
        setError(`${input.label} is required.`);
        return;
      }
      if ((descriptorComponent(input) === "text" || descriptorComponent(input) === "textarea") && !String(values[input.id] || "").trim()) {
        setError(`${input.label} is required.`);
        return;
      }
    }
    const formData = new FormData();
    inputs.forEach(input => {
      if (descriptorComponent(input) === "file") (files[input.id] || []).forEach(file => formData.append(inputName(input), file));
      else if (values[input.id]) formData.append(inputName(input), values[input.id]);
    });
    setSubmitting(true);
    setRunId(""); setStatus(null); setLogs([]); setArtifacts([]); setRenderedResult(null);
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
          <PluginForm
            inputs={inputs}
            values={values}
            files={files}
            onValueChange={updateValue}
            onFilesChange={updateFiles}
            onSubmit={submit}
            error={error}
            submitting={submitting}
          />
        </PanelBody>
      </Panel>
      {runId && (
        <Panel>
          <PanelHeader title="Run status" />
          <PanelBody>
            <RunStatus status={status} />
            <LogViewer lines={logs} />
            {state === "FAILED" || state === "ERROR" ? <p role="alert" className="plugin-error">{status?.detail || "The run failed."}</p> : null}
          </PanelBody>
        </Panel>
      )}
      {runId && ["COMPLETED", "COMPLETE"].includes(state) && (
        <PluginResults
          artifacts={artifacts}
          pluginSlug={descriptor.plugin.slug}
          runId={runId}
          renderEndpoint={descriptor.endpoints.render ? endpoint("render") : ""}
          render={renderedResult}
        />
      )}
    </div>
  );
}
