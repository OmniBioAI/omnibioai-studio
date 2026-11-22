import React, { useEffect, useMemo, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "../UI";
import PluginResults from "../PluginResults";
import PluginForm from "./PluginForm";
import LogViewer from "./LogViewer";
import RunStatus from "./RunStatus";
import SampleDataPanel from "./SampleDataPanel";
import { descriptorComponent } from "./PluginField";
import { csrfToken, pluginEndpoint, pluginSampleRunUrl } from "../../lib/pluginApi";
import { validateArtifactPayload } from "../../lib/pluginUiContracts";

const TERMINAL = new Set(["COMPLETED", "COMPLETE", "FAILED", "ERROR", "CANCELED", "CANCELLED"]);

function inputName(input) {
  return ["text", "textarea", "checkbox", "multiselect", "resource_select"].includes(descriptorComponent(input))
    ? `param_${input.id}`
    : `input_${input.id}`;
}

function effectiveValue(input, values) {
  if (values[input.id] !== undefined) return values[input.id];
  if (input.default !== undefined) return input.default;
  if (descriptorComponent(input) === "checkbox") return false;
  if (descriptorComponent(input) === "multiselect") return [];
  return "";
}

function isVisible(input, inputs, values) {
  const byId = new Map(inputs.map(candidate => [candidate.id, candidate]));
  return (input.conditions || []).filter(condition => condition.effect === "visible").every(condition => {
    const controller = byId.get(condition.controller);
    const value = controller ? effectiveValue(controller, values) : "";
    return condition.operator === "in" ? condition.value.includes(value) : value === condition.value;
  });
}

function transformedInputText(input, value, values) {
  const text = String(value);
  if (input.fileTransform === "gene-list-json") {
    const genes = text.split(/[\s,]+/).map(gene => gene.trim()).filter(Boolean);
    return JSON.stringify([...new Set(genes)]);
  }
  if (input.fileTransform === "gene-list-text") {
    const genes = text.split(/[\s,]+/).map(gene => gene.trim()).filter(Boolean);
    return [...new Set(genes)].join("\n");
  }
  if (input.fileTransform === "edge-list-tsv") {
    const separator = values.ui_separator || "space";
    const rows = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const columns = separator === "tab" ? line.split("\t") : separator === "comma" ? line.split(",") : line.split(/\s+/);
      return columns.map(column => column.trim());
    }).filter(columns => columns.length >= 2);
    return ["source\ttarget\tweight\ttype", ...rows.map(columns => [columns[0], columns[1], columns[2] || "1", columns[3] || ""].join("\t"))].join("\n");
  }
  return text;
}

export default function AsyncAnalysisRenderer({ descriptor, parameterFields = [], inputOverrides = {} }) {
  const [values, setValues] = useState({});
  const [files, setFiles] = useState({});
  // Pasted examples for file inputs: { id: { text, fileName } }. Sent as a
  // file when no file is chosen for that input.
  const [pasted, setPasted] = useState({});
  const [runId, setRunId] = useState("");
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [renderedResult, setRenderedResult] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const customParameterFields = Array.isArray(parameterFields) ? parameterFields : [];
  const declaredInputs = (descriptor.inputs || []).map(input => ({ ...input, ...(inputOverrides[input.id] || {}) }));
  const inputs = customParameterFields.length
    ? [...declaredInputs.filter(input => input.id !== "parameters"),
      ...customParameterFields.map(input => ({ ...input, id: `ui_${input.id}`, customParameter: true }))]
    : declaredInputs;
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

  function pasteExample(id, text, fileName) {
    const input = inputs.find(candidate => candidate.id === id);
    if (!input) return;
    if (descriptorComponent(input) === "file") setPasted(previous => ({ ...previous, [id]: { text, fileName } }));
    else updateValue(id, text);
  }

  function fillExampleValues(params) {
    Object.entries(params).forEach(([id, value]) => {
      const input = inputs.find(candidate => candidate.id === id);
      if (!input) return;
      const component = descriptorComponent(input);
      if (component === "checkbox" || component === "multiselect") updateValue(id, value);
      else updateValue(id, value !== null && typeof value === "object" ? JSON.stringify(value, null, 2) : String(value));
    });
  }

  function removePasted(id) {
    setPasted(previous => { const next = { ...previous }; delete next[id]; return next; });
  }

  async function startRun(url, body) {
    setSubmitting(true);
    setRunId(""); setStatus(null); setLogs([]); setArtifacts([]); setRenderedResult(null);
    try {
      const response = await fetch(url, {
        method: "POST", body, credentials: "same-origin",
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

  function runSample() {
    setError("");
    startRun(pluginSampleRunUrl(descriptor.plugin.slug), undefined);
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    for (const input of inputs) {
      if (input.customParameter && input.fileTarget &&
          !declaredInputs.some(declared => declared.id === input.fileTarget && descriptorComponent(declared) === "file")) {
        setError(`${input.label} is not connected to a supported Workbench file input.`);
        return;
      }
    }
    for (const input of inputs) {
      if (!input.required) continue;
      if (descriptorComponent(input) === "file" && !(files[input.id] || []).length && !pasted[input.id]) {
        setError(`${input.label} is required.`);
        return;
      }
      if ((descriptorComponent(input) === "text" || descriptorComponent(input) === "textarea") && !String(values[input.id] || "").trim()) {
        setError(`${input.label} is required.`);
        return;
      }
      if (descriptorComponent(input) === "checkbox" && effectiveValue(input, values) !== true) {
        setError(`${input.label} is required.`);
        return;
      }
      if (descriptorComponent(input) === "multiselect" && !effectiveValue(input, values).length) {
        setError(`${input.label} is required.`);
        return;
      }
    }
    const formData = new FormData();
    const customParameters = {};
    const customParameterArrays = {};
    const generatedInputFiles = [];
    let parameterError = "";
    inputs.forEach(input => {
      if (!isVisible(input, inputs, values)) return;
      const component = descriptorComponent(input);
      const value = effectiveValue(input, values);
      if (input.customParameter) {
        if (input.fileTarget) {
          if (value !== "" && value !== null && value !== undefined) {
            const content = transformedInputText(input, value, values);
            generatedInputFiles.push({ id: input.fileTarget, file: new File([content], input.fileName || `${input.fileTarget}.txt`, { type: input.fileType || "text/plain" }) });
          }
        } else if (value !== "" && value !== null && value !== undefined) {
          if (input.format === "json") {
            try { customParameters[input.id.slice(3)] = JSON.parse(String(value)); }
            catch { parameterError = `${input.label} must be valid JSON.`; }
          } else if (Array.isArray(input.parameterPath) && input.parameterPath.length) {
            let target = customParameters;
            for (const part of input.parameterPath.slice(0, -1)) {
              if (!target[part] || typeof target[part] !== "object" || Array.isArray(target[part])) target[part] = {};
              target = target[part];
            }
            target[input.parameterPath.at(-1)] = value;
          } else if (typeof input.parameterArray === "string" && input.parameterArray) {
            if (value === true) {
              customParameterArrays[input.parameterArray] ||= [];
              customParameterArrays[input.parameterArray].push(input.parameterValue ?? input.id.slice(3));
            }
          } else customParameters[input.id.slice(3)] = value;
        }
        return;
      }
      if (component === "file") {
        const chosen = files[input.id] || [];
        if (chosen.length) chosen.forEach(file => formData.append(inputName(input), file));
        else if (pasted[input.id]) formData.append(inputName(input), new File([pasted[input.id].text], pasted[input.id].fileName, { type: "text/plain" }));
      }
      else if (component === "checkbox") formData.append(inputName(input), value ? "true" : "false");
      else if (component === "multiselect") formData.append(inputName(input), JSON.stringify(value));
      else if (value !== "" && value !== null && value !== undefined) formData.append(inputName(input), value);
    });
    Object.entries(customParameterArrays).forEach(([key, selectedValues]) => { customParameters[key] = selectedValues; });
    generatedInputFiles.forEach(({ id, file }) => {
      const target = declaredInputs.find(input => input.id === id);
      if (target) formData.append(inputName(target), file);
    });
    if (parameterError) {
      setError(parameterError);
      return;
    }
    if (customParameterFields.length) formData.append("param_parameters", JSON.stringify(customParameters));
    await startRun(pluginEndpoint(descriptor.endpoints.submit), formData);
  }

  async function cancelRun() {
    if (!runId || !descriptor.endpoints.cancel || cancelling || TERMINAL.has(state)) return;
    setCancelling(true); setError("");
    try {
      const response = await fetch(pluginEndpoint(endpoint("cancel")), {
        method: "POST", credentials: "same-origin",
        headers: { Accept: "application/json", "X-CSRFToken": csrfToken() },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.error || `Unable to cancel run (${response.status}).`);
      setStatus(previous => ({ ...(previous || {}), state: payload.state || "CANCELLING", detail: payload.detail || "Cancellation requested." }));
    } catch (cancelError) { setError(cancelError.message || "Unable to cancel run."); }
    finally { setCancelling(false); }
  }

  const state = status?.state || "";
  return (
    <div className="native-plugin-page">
      <Panel>
        <PanelHeader title="Inputs" />
        <PanelBody>
          {descriptor.sample ? (
            <SampleDataPanel
              slug={descriptor.plugin.slug}
              sample={descriptor.sample}
              inputs={inputs}
              busy={submitting}
              onUseSample={runSample}
              onPaste={pasteExample}
              onFillParams={fillExampleValues}
            />
          ) : null}
          {Object.entries(pasted).map(([id, item]) => {
            const label = inputs.find(input => input.id === id)?.label || id;
            return (
              <div key={id} className="plugin-sample__pasted">
                <label htmlFor={`pasted-${id}`}>{`Pasted example for ${label} (${item.fileName})`}</label>
                <textarea
                  id={`pasted-${id}`}
                  value={item.text}
                  rows={6}
                  onChange={event => setPasted(previous => ({ ...previous, [id]: { ...item, text: event.target.value } }))}
                />
                <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" onClick={() => removePasted(id)}>
                  {`Remove pasted example for ${label}`}
                </button>
              </div>
            );
          })}
          <PluginForm
            inputs={inputs}
            values={values}
            files={files}
            satisfiedInputs={Object.keys(pasted)}
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
            {descriptor.endpoints.cancel && !TERMINAL.has(state) ? <button type="button" className="omni-btn omni-btn--secondary omni-btn--md" onClick={cancelRun} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Cancel run"}
            </button> : null}
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
