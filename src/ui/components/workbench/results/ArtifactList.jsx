import React from "react";
import ArtifactDownload from "./ArtifactDownload";

function formatSize(sizeBytes) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) return "Size unavailable";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = sizeBytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

export default function ArtifactList({ artifacts = [], pluginSlug, runId, loading = false, error = "" }) {
  if (loading) return <p role="status" className="plugin-muted">Loading artifacts…</p>;
  if (error) return <p role="alert" className="plugin-error">{error}</p>;
  if (!artifacts.length) return <p role="status" className="plugin-muted">The run completed without published artifacts.</p>;
  return (
    <ul className="workbench-artifact-list" aria-label="Downloadable artifacts">
      {artifacts.map(artifact => (
        <li className="workbench-artifact-item" key={artifact.artifact_id}>
          <div className="workbench-artifact-summary">
            <strong className="workbench-artifact-label">{artifact.label}</strong>
            <span className="workbench-artifact-name">{artifact.display_name}</span>
            <span className="workbench-artifact-metadata">
              <span>{artifact.kind}</span>
              <span>{artifact.media_type}</span>
              <span>{formatSize(artifact.size_bytes)}</span>
            </span>
          </div>
          <ArtifactDownload pluginSlug={pluginSlug} runId={runId} artifact={artifact} />
        </li>
      ))}
    </ul>
  );
}

export { formatSize };
