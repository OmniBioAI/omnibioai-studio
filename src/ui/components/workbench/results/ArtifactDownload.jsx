import React from "react";
import { pluginArtifactDownloadUrl } from "../../../lib/pluginApi";

export default function ArtifactDownload({ pluginSlug, runId, artifact }) {
  let href = "";
  try {
    href = pluginArtifactDownloadUrl(pluginSlug, runId, artifact?.artifact_id);
  } catch {
    // Runtime identities are untrusted even after payload validation.
  }
  if (!href) return <span className="workbench-artifact-unavailable" aria-disabled="true">Download unavailable</span>;
  return (
    <a className="workbench-artifact-download" href={href} download aria-label={`Download ${artifact.display_name}`}>
      Download
    </a>
  );
}
