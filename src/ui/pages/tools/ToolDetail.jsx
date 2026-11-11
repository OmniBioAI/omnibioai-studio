import React, { useEffect, useMemo, useState } from "react";
import { safeErrorMessage } from "../../lib/safeErrorMessage";
import { tesApiFetch } from "../../lib/tesApi";
import {
  curlCommand, defaultValues, outputRows, runBlocker, schemaFields, serverBackendLabel, toolCategory,
  toolServers, toolVerification, validateInputs, valuesFromInputs,
} from "./toolModel";

// One tool: description, inputs form from its schema, outputs, backends with
// availability, verification, a Run button that submits through TES, "Fill example"
// when TES has a passing example, and a copyable curl with a token placeholder.
export default function ToolDetail({ toolId, fallbackTool = null, servers = [], onBack, onRunSubmitted }) {
  const [tool, setTool] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [exampleState, setExampleState] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setTool(null);
    tesApiFetch(`/api/tools/${encodeURIComponent(toolId)}`, { signal: controller.signal })
      .then(value => { if (value && typeof value === "object") setTool(value); else throw new Error("bad tool"); })
      .catch(failure => {
        if (controller.signal.aborted) return;
        // Older TES without the per-tool endpoint: fall back to the tool the list already loaded.
        if (fallbackTool) setTool(fallbackTool);
        else setError(/\(404\)/.test(String(failure?.message)) ? "This tool is not in the catalog." : safeErrorMessage(failure, "Could not load this tool."));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [toolId]);

  const fields = useMemo(() => tool ? schemaFields(tool) : [], [tool]);
  useEffect(() => { if (tool) { setValues(defaultValues(fields)); setErrors({}); setSubmitError(""); setExampleState(""); } }, [tool, fields]);

  if (loading) return <p role="status">Loading tool…</p>;
  if (error || !tool) return <div className="tools-empty" role="alert"><strong>{error || "Could not load this tool."}</strong><button type="button" onClick={onBack}>Back to Tools</button></div>;

  const verification = toolVerification(tool);
  const toolServerList = toolServers(tool, servers);
  const blocker = runBlocker(verification, toolServerList);
  const outputs = outputRows(tool);
  const name = String(tool.display_name || tool.tool_id).replaceAll("_", " ");
  const tags = Array.isArray(tool.tags) ? tool.tags.filter(t => typeof t === "string") : [];
  const exampleAvailable = tool.example_available === true;
  const preview = validateInputs(fields, values);
  const curl = curlCommand(tool.tool_id, preview.inputs);

  const update = (fieldName, value) => { setValues(v => ({ ...v, [fieldName]: value })); setErrors(e => { const next = { ...e }; delete next[fieldName]; return next; }); };

  const fillExample = async () => {
    setExampleState("loading");
    try {
      const example = await tesApiFetch(`/api/tools/${encodeURIComponent(tool.tool_id)}/example`);
      if (!example || typeof example.inputs !== "object") throw new Error("no example");
      setValues(valuesFromInputs(fields, example.inputs));
      setErrors({});
      setExampleState(`Filled with the inputs that passed end to end${example.verified_at ? ` on ${example.verified_at}` : ""}.`);
    } catch (failure) {
      setExampleState(/\(404\)/.test(String(failure?.message)) ? "No passing example is recorded for this tool." : safeErrorMessage(failure, "Could not load the example."));
    }
  };

  const submit = async event => {
    event.preventDefault();
    setSubmitError("");
    const checked = validateInputs(fields, values);
    setErrors(checked.errors);
    if (!checked.ok) return;
    setSubmitting(true);
    try {
      const result = await tesApiFetch("/api/runs/submit", { method: "POST", body: JSON.stringify({ tool_id: tool.tool_id, inputs: checked.inputs }) });
      if (!result || result.ok !== true || !result.run_id) {
        const details = result?.error?.details?.errors || result?.error?.errors;
        if (Array.isArray(details) && details.length) {
          const fieldErrors = {};
          for (const d of details) if (d?.field && fields.some(f => f.name === d.field)) fieldErrors[d.field] = d.message || "Invalid.";
          setErrors(fieldErrors);
          setSubmitError(details.filter(d => !d?.field || !fieldErrors[d.field]).map(d => d.message || d.code).join(" ") || "TES rejected the inputs.");
        } else {
          setSubmitError(result?.error?.message || result?.error?.code || "TES did not accept the run.");
        }
        return;
      }
      onRunSubmitted?.(result.run_id);
    } catch (failure) {
      setSubmitError(safeErrorMessage(failure, "Could not submit the run."));
    } finally {
      setSubmitting(false);
    }
  };

  const copyCurl = async () => {
    try { await navigator.clipboard.writeText(curl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  };

  return <article className="tool-detail">
    <header className="tool-detail__header">
      <div>
        <div className="tool-card__labels"><span className="tool-card__category">{toolCategory(tool)}</span>
          {verification.label && <span className={`tool-card__badge ${verification.className}`} title={verification.title}>{verification.label}</span>}</div>
        <h2>{name}</h2>
        <p className="tool-detail__id"><code>{tool.tool_id}</code></p>
      </div>
      <button type="button" className="tool-detail__back" onClick={onBack}>← All tools</button>
    </header>

    <p className="tool-detail__description">{tool.description || "No description yet."}</p>
    {tags.length > 0 && <ul className="tool-detail__tags" aria-label="Tags">{tags.map(tag => <li key={tag}>{tag}</li>)}</ul>}

    <div className="tool-detail__grid">
      <section className="tool-detail__section" aria-labelledby="tool-inputs-heading">
        <h3 id="tool-inputs-heading">Inputs</h3>
        {blocker && <div className="tool-detail__blocker" role="status"><strong>{blocker.title}.</strong> {blocker.detail}</div>}
        {!blocker && verification.status === "not_yet_tested" && <p className="tool-detail__note">This tool has not passed an end-to-end run yet; it may fail.</p>}
        <form onSubmit={submit} noValidate>
          {fields.length === 0 && <p className="tool-detail__note">This tool takes no inputs.</p>}
          {fields.map(f => <div key={f.name} className={`tool-field${errors[f.name] ? " tool-field--error" : ""}`}>
            <label htmlFor={`tool-field-${f.name}`}>{f.name}{f.required && <span className="tool-field__required" aria-label="required"> *</span>}<span className="tool-field__type">{f.type}</span></label>
            {f.description && <small id={`tool-field-${f.name}-desc`}>{f.description}</small>}
            {f.type === "boolean"
              ? <input id={`tool-field-${f.name}`} type="checkbox" checked={Boolean(values[f.name])} onChange={event => update(f.name, event.target.checked)} />
              : f.enum
                ? <select id={`tool-field-${f.name}`} value={values[f.name] ?? ""} onChange={event => update(f.name, event.target.value)} aria-describedby={f.description ? `tool-field-${f.name}-desc` : undefined}>
                  <option value="">Choose…</option>{f.enum.map(option => <option key={option} value={option}>{option}</option>)}</select>
                : f.type === "array" || f.type === "object"
                  ? <textarea id={`tool-field-${f.name}`} rows={3} value={values[f.name] ?? ""} onChange={event => update(f.name, event.target.value)} placeholder={f.type === "array" ? "[]" : "{}"} aria-describedby={f.description ? `tool-field-${f.name}-desc` : undefined} />
                  : <input id={`tool-field-${f.name}`} type={f.secret ? "password" : f.type === "integer" || f.type === "number" ? "number" : "text"} step={f.type === "integer" ? 1 : "any"}
                    min={f.minimum ?? undefined} max={f.maximum ?? undefined} value={values[f.name] ?? ""} onChange={event => update(f.name, event.target.value)}
                    aria-describedby={f.description ? `tool-field-${f.name}-desc` : undefined} aria-invalid={errors[f.name] ? "true" : undefined} />}
            {errors[f.name] && <span className="tool-field__error" role="alert">{errors[f.name]}</span>}
          </div>)}
          {submitError && <p className="tool-detail__error" role="alert">{submitError}</p>}
          <div className="tool-detail__actions">
            <button type="submit" className="tool-detail__run" disabled={Boolean(blocker) || submitting}>{submitting ? "Submitting…" : "Run"}</button>
            {exampleAvailable && <button type="button" onClick={fillExample} disabled={exampleState === "loading"}>Fill example</button>}
            {exampleState && exampleState !== "loading" && <span className="tool-detail__note" role="status">{exampleState}</span>}
          </div>
        </form>
      </section>

      <aside className="tool-detail__side">
        <section className="tool-detail__section" aria-labelledby="tool-backends-heading">
          <h3 id="tool-backends-heading">Backends</h3>
          {toolServerList.length === 0 ? <p className="tool-detail__note">No configured backend advertises this tool.</p>
            : <ul className="tool-detail__servers">{toolServerList.map(s => <li key={s.server_id} className={s.available === false ? "is-unavailable" : "is-available"}>
              <span className="tool-detail__server-name">{serverBackendLabel(s)} · {s.display_name || s.server_id}</span>
              <span className="tool-detail__server-state">{s.available === false ? `Unavailable: ${s.unavailable_reason || "backend unreachable"}` : "Available"}</span>
            </li>)}</ul>}
        </section>
        <section className="tool-detail__section" aria-labelledby="tool-verification-heading">
          <h3 id="tool-verification-heading">Verification</h3>
          <p>{verification.label ? <span className={`tool-card__badge ${verification.className}`}>{verification.label}</span> : <span className="tool-card__badge">Not covered</span>}</p>
          <p className="tool-detail__note">{verification.title}{verification.runId ? ` (run ${verification.runId})` : ""}</p>
        </section>
        <section className="tool-detail__section" aria-labelledby="tool-outputs-heading">
          <h3 id="tool-outputs-heading">Outputs</h3>
          {outputs.length === 0 ? <p className="tool-detail__note">Outputs are returned as the run's result object.</p>
            : <ul className="tool-detail__outputs">{outputs.map(o => <li key={o.name}><code>{o.name}</code>{o.type && <span className="tool-field__type">{o.type}</span>}{o.description && <small>{o.description}</small>}</li>)}</ul>}
        </section>
        <section className="tool-detail__section" aria-labelledby="tool-curl-heading">
          <h3 id="tool-curl-heading">Run from the command line</h3>
          <p className="tool-detail__note">Replace <code>$OMNIBIOAI_TOKEN</code> with an API token from Account → API keys.</p>
          <pre className="tool-detail__curl"><code>{curl}</code></pre>
          <button type="button" onClick={copyCurl}>{copied ? "Copied" : "Copy curl"}</button>
        </section>
      </aside>
    </div>
  </article>;
}
