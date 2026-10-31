import React, { useCallback, useEffect, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "../UI";
import { nativePluginRequest } from "../../lib/nativePluginApi";
import { safeErrorMessage } from "../../lib/safeErrorMessage";
import "./HistopathologyCVRenderer.css";

function imageRecords(payload) {
  if (!Array.isArray(payload?.results)) throw new Error("Image catalog returned an invalid response.");
  return payload.results.filter(item => item && typeof item.object_id === "string" && item.object_id)
    .map(item => ({
      object_id: item.object_id,
      object_type: typeof item.object_type === "string" ? item.object_type : "image",
      status: typeof item.status === "string" ? item.status : "unknown",
      bytes: Number.isFinite(Number(item.bytes)) ? Number(item.bytes) : null,
    }));
}

function formatBytes(bytes) {
  if (bytes == null) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function HistopathologyCVRenderer() {
  const [images, setImages] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [threshold, setThreshold] = useState("");
  const [invert, setInvert] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Choose a registered image to get started.");

  const refresh = useCallback(async signal => {
    setLoading(true); setError("");
    try {
      const payload = await nativePluginRequest("/plugins/histopathology_cv/api/ui-query/?operation=list_images", { signal });
      const next = imageRecords(payload);
      if (signal?.aborted) return;
      setImages(next);
      setSelectedId(current => next.some(item => item.object_id === current) ? current : (next[0]?.object_id || ""));
      setNotice(next.length ? `${next.length} image OmniObject${next.length === 1 ? "" : "s"} available.` : "No image OmniObjects found. Register a PNG, JPG, or TIFF image first.");
    } catch (failure) {
      if (failure.name !== "AbortError") { setError(safeErrorMessage(failure, "Could not load image OmniObjects.")); setNotice(""); }
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const selected = images.find(item => item.object_id === selectedId) || null;

  async function runSegmentation(event) {
    event.preventDefault();
    if (!selectedId) { setError("Select an image OmniObject first."); return; }
    const parsedThreshold = threshold.trim() ? Number(threshold) : null;
    if (parsedThreshold !== null && (!Number.isFinite(parsedThreshold) || parsedThreshold < 0 || parsedThreshold > 255)) {
      setError("Threshold must be between 0 and 255, or left blank for automatic selection.");
      return;
    }
    setRunning(true); setError(""); setResults(null); setNotice("Segmentation is running…");
    try {
      const payload = await nativePluginRequest("/plugins/histopathology_cv/api/segment/", {
        method: "POST", body: { input_object_id: selectedId, threshold: parsedThreshold, invert },
      });
      if (payload.status !== "ok" || !payload.outputs || typeof payload.outputs !== "object") throw new Error(payload.error || "Segmentation returned an invalid response.");
      const output = payload.outputs;
      setResults({
        input_object_id: String(output.input_object_id || selectedId),
        mask_object_id: String(output.mask_object_id || ""),
        overlay_object_id: String(output.overlay_object_id || ""),
        summary_object_id: String(output.summary_object_id || ""),
        mask_positive_fraction: Number.isFinite(Number(output.summary?.mask_positive_fraction))
          ? Number(output.summary.mask_positive_fraction) : null,
      });
      setNotice("Segmentation completed. Output objects are registered in the governed object catalog.");
    } catch (failure) {
      setError(safeErrorMessage(failure, "Segmentation failed.")); setNotice("Segmentation did not complete.");
    } finally { setRunning(false); }
  }

  return <section className="histopath-cv" aria-label="Histopathology segmentation">
    <header className="histopath-cv__intro">
      <div><span className="histopath-cv__eyebrow">Digital pathology</span><h2>Histopathology Computer Vision</h2>
        <p>Select an image OmniObject and run segmentation to create governed mask, overlay, and summary objects.</p></div>
      <span className="histopath-cv__status" role="status">{loading ? "Loading images…" : notice}</span>
    </header>
    {error && <p className="histopath-cv__error" role="alert">{error}</p>}
    <div className="histopath-cv__grid">
      <Panel>
        <PanelHeader title="Segmentation setup" />
        <PanelBody>
          <form className="histopath-cv__form" onSubmit={runSegmentation} noValidate>
            <label>Image OmniObject
              <select value={selectedId} onChange={event => { setSelectedId(event.target.value); setResults(null); }} disabled={loading || !images.length}>
                {!images.length && <option value="">No image OmniObjects available</option>}
                {images.map(image => <option key={image.object_id} value={image.object_id}>{image.object_type} · {image.object_id}</option>)}
              </select>
              {selected && <small>{selected.status} · {formatBytes(selected.bytes)}</small>}
            </label>
            <label>Threshold <span className="histopath-cv__optional">Optional · blank uses automatic threshold</span>
              <input type="number" min="0" max="255" step="any" value={threshold} onChange={event => setThreshold(event.target.value)} placeholder="Automatic" />
            </label>
            <label className="histopath-cv__toggle"><input type="checkbox" checked={invert} onChange={event => setInvert(event.target.checked)} /> Invert segmentation mask</label>
            <div className="histopath-cv__actions">
              <button className="omni-btn omni-btn--secondary omni-btn--md" type="button" onClick={() => refresh()} disabled={loading || running}>Refresh images</button>
              <button className="omni-btn omni-btn--primary omni-btn--md" type="submit" disabled={!selectedId || loading || running}>{running ? "Segmenting…" : "Run segmentation"}</button>
            </div>
          </form>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Results" />
        <PanelBody>
          {!results && <p className="histopath-cv__empty">Segmentation output IDs and mask summary will appear here when a run completes.</p>}
          {results && <dl className="histopath-cv__results">
            {[["Input image", results.input_object_id], ["Mask object", results.mask_object_id], ["Overlay object", results.overlay_object_id], ["Summary object", results.summary_object_id]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd><code>{value || "Unavailable"}</code></dd></div>)}
            <div><dt>Mask positive fraction</dt><dd>{results.mask_positive_fraction == null ? "Unavailable" : `${(results.mask_positive_fraction * 100).toFixed(2)}%`}</dd></div>
          </dl>}
          <p className="histopath-cv__privacy">File-system paths are not displayed. Use the object catalog or your authorized viewer to open registered outputs.</p>
        </PanelBody>
      </Panel>
    </div>
  </section>;
}
