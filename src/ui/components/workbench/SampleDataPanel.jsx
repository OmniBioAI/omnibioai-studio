import React, { useId, useState } from "react";
import { pluginSampleContentUrl } from "../../lib/pluginApi";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// "Use sample data" / "Paste example" for a native run form. The descriptor's
// `sample` section is metadata only; the run itself is staged server-side.
export default function SampleDataPanel({ slug, sample, inputs, busy, onUseSample, onPaste, onFillParams }) {
  const reasonId = useId();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const labels = new Map(inputs.map(input => [input.id, input.label || input.id]));
  const pasteable = Object.entries(sample.inputs).filter(([id, item]) => item.pasteable && labels.has(id));
  const params = Object.keys(sample.params).filter(id => labels.has(id));

  async function paste(id) {
    setError(""); setLoading(id);
    try {
      const response = await fetch(pluginSampleContentUrl(slug, id), {
        credentials: "same-origin", headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.text !== "string") throw new Error(payload.error || `Unable to load the example (${response.status}).`);
      onPaste(id, payload.text, payload.file_name || `${id}.txt`);
    } catch (pasteError) {
      setError(pasteError.message || "Unable to load the example.");
    } finally {
      setLoading("");
    }
  }

  return (
    <section className="plugin-sample" aria-label="Sample data">
      <h3>Sample data{sample.label ? `: ${sample.label}` : ""}</h3>
      {sample.description ? <p>{sample.description}</p> : null}
      <p className="plugin-sample__meta">
        {sample.provenance ? <span>Provenance: {sample.provenance}. </span> : null}
        {sample.licence ? <span>Licence: {sample.licence}. </span> : null}
        <span>Size: {formatBytes(sample.total_bytes)}.</span>
      </p>
      {sample.runtime_restrictions.length ? (
        <div className="plugin-sample__restrictions">
          <strong>Runtime restrictions</strong>
          <ul>{sample.runtime_restrictions.map(item => <li key={item}>{item}</li>)}</ul>
        </div>
      ) : null}
      {sample.requires.gpu ? <p>Runs on a GPU.</p> : null}
      <div className="plugin-sample__actions">
        <button
          type="button"
          className="omni-btn omni-btn--secondary omni-btn--md"
          onClick={onUseSample}
          disabled={!sample.available || busy}
          aria-describedby={sample.available ? undefined : reasonId}
        >
          Use sample data
        </button>
        {params.length ? (
          <button type="button" className="omni-btn omni-btn--secondary omni-btn--md" onClick={() => onFillParams(sample.params)} disabled={busy}>
            Fill example values
          </button>
        ) : null}
        {pasteable.map(([id]) => (
          <button key={id} type="button" className="omni-btn omni-btn--secondary omni-btn--md" onClick={() => paste(id)} disabled={busy || loading === id}>
            {loading === id ? "Loading…" : `Paste example: ${labels.get(id)}`}
          </button>
        ))}
      </div>
      {sample.available ? null : <p id={reasonId} className="plugin-sample__reason">{sample.reason}</p>}
      {error ? <p role="alert" className="plugin-error">{error}</p> : null}
    </section>
  );
}
