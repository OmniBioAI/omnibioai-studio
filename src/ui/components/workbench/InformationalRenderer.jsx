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
    setErrors(next);
    setPreview(Object.keys(next).length ? null : values);
  }
  return <section aria-label="Local draft workspace">
    <p>Prepare and validate a local draft. Drafts stay in this page and are not submitted, persisted, or authorized for execution.</p>
    <nav aria-label="Workspace views">{["Inputs", "Draft", "Outputs"].map(name =>
      <button key={name} type="button" aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</nav>
    {tab === "Inputs" && <form onSubmit={validate} noValidate>
      {workspace.fields.length === 0 && <p>No editable parameters are declared in this plugin contract. Registry administration remains unavailable.</p>}
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
