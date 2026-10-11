import React, { useState } from "react";

function LocalDraftWorkspace({ workspace, slug }) {
  const defaults = Object.fromEntries(workspace.fields.map(field => [field.id, field.default]));
  const [values, setValues] = useState(defaults);
  const [errors, setErrors] = useState({});
  const [preview, setPreview] = useState(null);
  const [tab, setTab] = useState("Inputs");
  function validate(event) {
    event.preventDefault();
    const next = {};
    for (const field of workspace.fields) {
      const value = values[field.id] || "";
      if (value.length > 65536) next[field.id] = "Limit this draft field to 65,536 characters.";
      else if (field.required && !value.trim()) next[field.id] = "This field is required.";
      else if (field.id === "enabled" && value && !["0", "1"].includes(value)) next[field.id] = "Use 1 for enabled, 0 for disabled, or leave empty for all.";
      else if (field.id === "workflow_spec" && value.trim()) {
        try {
          const parsed = JSON.parse(value);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        } catch { next[field.id] = "Enter a JSON object for the workflow specification."; }
      }
    }
    if (slug === "decipher" && values.action && !["metadata", "health"].includes(values.action)) {
      next.action = "Use metadata or health; clinical/genomic queries are unsupported.";
    }
    if (slug === "metacyc") {
      if (values.action && values.action !== "search") next.action = "This local workspace supports search drafts only.";
      if (values.query && (values.query.length > 200 || /[\x00-\x1f]/.test(values.query))) next.query = "Use 1–200 characters without control characters.";
      if (values.orgid && !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(values.orgid)) next.orgid = "Use a valid 1–64 character BioCyc database identifier.";
      if (values.resource_type && !["pathway", "reaction", "compound", "enzyme", "gene", "protein", "organism"].includes(values.resource_type)) next.resource_type = "Use a documented MetaCyc resource type.";
      if (values.limit && (!/^\d+$/.test(values.limit) || Number(values.limit) < 1 || Number(values.limit) > 100)) next.limit = "Use an integer from 1 to 100.";
    }
    setErrors(next);
    setPreview(Object.keys(next).length ? null : values);
  }
  return <section aria-label="Local draft workspace">
    <p>Prepare and validate a local draft. Drafts stay in this page and are not submitted, persisted, or authorized for execution.</p>
    <nav aria-label="Workspace views">{["Inputs", "Draft", "Outputs"].map(name =>
      <button key={name} type="button" aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</nav>
    {tab === "Inputs" && <form onSubmit={validate} noValidate>
      {workspace.fields.length === 0 && <p>No editable parameters are declared in this plugin contract. Execution remains unavailable for {slug}.</p>}
      {workspace.fields.map(field => <div key={field.id}>
        <label htmlFor={`${slug}-${field.id}`}>{field.label}{field.required ? " (required)" : ""}</label>
        <textarea id={`${slug}-${field.id}`} value={values[field.id]} maxLength={65537}
          aria-invalid={Boolean(errors[field.id])} aria-describedby={`${slug}-${field.id}-help`}
          onChange={event => { setValues({ ...values, [field.id]: event.target.value }); setPreview(null); }} />
        <p id={`${slug}-${field.id}-help`}>{field.description}</p>
        {errors[field.id] && <p role="alert">{errors[field.id]}</p>}
      </div>)}
      <button type="submit">Validate local draft</button>
      <button type="button" onClick={() => { setValues(defaults); setErrors({}); setPreview(null); }}>Reset draft</button>
      <button type="button" disabled>Execute unavailable</button>
      {preview && <p role="status">Local draft validated. No backend request was made.</p>}
    </form>}
    {tab === "Draft" && <section aria-label="Draft preview">{preview ? <pre>{JSON.stringify(preview, null, 2)}</pre> : <p>Validate the draft to preview its parameters. This is not an execution result.</p>}</section>}
    {tab === "Outputs" && <section aria-label="Output contract">
      <p>No results are available because execution is restricted.</p>
      <ul>{workspace.outputs.map(output => <li key={output}>{output}: unavailable</li>)}</ul>
    </section>}
  </section>;
}

/**
 * Render the finite, read-only informational descriptor vocabulary.
 * Content is text data only; this component intentionally has no HTML or URL
 * execution path.
 */
export default function InformationalRenderer({ descriptor }) {
  const content = descriptor?.content || {};
  return (
    <section className="informational-renderer" aria-label="Plugin information">
      {descriptor?.workspace && <LocalDraftWorkspace key={descriptor.plugin.slug} workspace={descriptor.workspace} slug={descriptor.plugin.slug} />}
      {content.summary && <p>{content.summary}</p>}
      {(content.sections || []).map(section => (
        <section key={section.heading} aria-labelledby={`informational-${section.heading}`}>
          <h2 id={`informational-${section.heading}`}>{section.heading}</h2>
          {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        </section>
      ))}
    </section>
  );
}
