import React from "react";
import { pluginEndpoint } from "../../../lib/pluginApi";
import { validateResourcePayload } from "../../../lib/pluginUiContracts";

/** Single selection from a server-discovered, owner-scoped resource list.
 * The value is always the opaque server id -- never a display label, and
 * never anything this component invents or infers locally. */
export default function ResourceSelectField({ input, value = "", onChange, controlId, describedBy, invalid = false, disabled = false, readOnly = false }) {
  const [state, setState] = React.useState({ status: "loading", resources: [], error: "" });
  const requestToken = React.useRef(0);

  const load = React.useCallback(() => {
    const token = ++requestToken.current;
    setState({ status: "loading", resources: [], error: "" });
    let endpoint;
    try {
      endpoint = pluginEndpoint(input.endpoint);
    } catch {
      setState({ status: "error", resources: [], error: "Invalid resource endpoint." });
      return undefined;
    }
    const controller = new AbortController();
    fetch(endpoint, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(response => {
        if (!response.ok) throw new Error(`Unable to load options (${response.status}).`);
        return response.json();
      })
      .then(payload => validateResourcePayload(payload))
      .then(resources => {
        if (requestToken.current !== token) return;
        setState({ status: resources.length ? "loaded" : "empty", resources, error: "" });
      })
      .catch(error => {
        if (requestToken.current !== token || error.name === "AbortError") return;
        setState({ status: "error", resources: [], error: error.message || "Unable to load options." });
      });
    return () => controller.abort();
  }, [input.endpoint]);

  React.useEffect(() => load(), [load]);

  const busy = state.status === "loading";
  const unusable = busy || state.status === "error" || state.status === "empty";
  return (
    <>
      <select
        id={controlId || `plugin-${input.id}`}
        name={`param_${input.id}`}
        className="studio-field plugin-field-control"
        required={Boolean(input.required)}
        value={unusable ? "" : value}
        disabled={disabled || readOnly || unusable}
        aria-busy={busy || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={event => onChange?.(event.target.value)}
      >
        <option value="" disabled={Boolean(input.required)}>
          {busy ? "Loading…" : state.status === "empty" ? "No options available" : state.status === "error" ? "Unable to load options" : "Select…"}
        </option>
        {state.resources.map(resource => (
          <option key={resource.id} value={resource.id}>{resource.label}</option>
        ))}
      </select>
      {busy && <p role="status" className="plugin-muted">Loading options…</p>}
      {state.status === "empty" && <p role="status" className="plugin-muted">No eligible resources are available yet.</p>}
      {state.status === "error" && (
        <p role="alert" className="plugin-field-error">
          {state.error}{" "}
          <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" onClick={load}>Retry</button>
        </p>
      )}
    </>
  );
}
