import React from "react";
import ArtifactDownload from "./ArtifactDownload";
import { pluginArtifactDownloadUrl } from "../../../lib/pluginApi";
import "./results.css";

const IMAGE_MEDIA_TYPE = /^image\//;

function imageArtifacts(artifacts) {
  return Array.isArray(artifacts)
    ? artifacts.filter(artifact => artifact?.kind === "plot" && IMAGE_MEDIA_TYPE.test(artifact?.media_type || ""))
    : [];
}

/** Inline collection of the run's own server-authorized plot images.
 * Purely a presentation grouping over the already-validated artifacts
 * array Batch 5 established: no new identity, endpoint, or descriptor
 * field. Every image remains independently listed and downloadable via
 * the existing ArtifactList/ArtifactDownload contract. */
export default function ImageGallery({ artifacts = [], pluginSlug, runId, loading = false, error = "" }) {
  if (loading || error) return null;
  const images = imageArtifacts(artifacts);
  if (!images.length) return null;
  return (
    <ul className="workbench-image-gallery" aria-label="Result images">
      {images.map(artifact => {
        let src = "";
        try {
          src = pluginArtifactDownloadUrl(pluginSlug, runId, artifact.artifact_id);
        } catch {
          // Runtime identities are untrusted even after payload validation.
        }
        return (
          <li className="workbench-image-gallery-item" key={artifact.artifact_id}>
            <figure className="workbench-image-gallery-figure">
              {src
                ? <img src={src} alt={artifact.label} loading="lazy" />
                : <span className="workbench-artifact-unavailable" aria-disabled="true">Image unavailable</span>}
              <figcaption>{artifact.label}</figcaption>
            </figure>
            <ArtifactDownload pluginSlug={pluginSlug} runId={runId} artifact={artifact} />
          </li>
        );
      })}
    </ul>
  );
}

export { imageArtifacts };
