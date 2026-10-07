import React from "react";
import { pluginEndpoint } from "../../../lib/pluginApi";
import { referenceTypeLabel, scientificReferenceTypesForPlugin, validScientificReference } from "../../../lib/pluginUiContracts";
import "./detail.css";

function referencePath(pluginSlug, referenceType, identifier) {
  const query = new URLSearchParams({ identifier }).toString();
  return pluginEndpoint(`/plugins/${pluginSlug}/api/ui-reference/${referenceType}/?${query}`);
}

/**
 * Navigation-only scientific reference. Destination policy remains in Django;
 * this component creates only the fixed, same-origin resolution operation.
 */
export default function ScientificReference({ pluginSlug, referenceType, identifier }) {
  const valid = /^[a-z0-9][a-z0-9_-]*$/.test(pluginSlug || "") &&
    validScientificReference({ reference_type: referenceType, identifier }, scientificReferenceTypesForPlugin(pluginSlug));
  const label = referenceTypeLabel(referenceType);
  if (!valid) {
    const text = typeof identifier === "string" && identifier ? identifier : "Reference unavailable";
    return <span className="workbench-scientific-reference is-unavailable" aria-disabled="true">{text}</span>;
  }
  return <a className="workbench-scientific-reference"
    href={referencePath(pluginSlug, referenceType, identifier)}
    aria-label={`${label}: ${identifier} (external scientific resource)`}>
    <span>{label}: {identifier}</span><span className="workbench-reference-mark" aria-hidden="true">↗</span>
  </a>;
}
