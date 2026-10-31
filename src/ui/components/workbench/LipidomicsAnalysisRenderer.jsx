import React, { useEffect, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "../UI";
import { endpointUrl } from "../../lib/pluginApi";

const CONTRACT_URL = "/plugins/lipidomics_analysis/";

const cardStyle = {
  background: "var(--bg2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md, 10px)",
  padding: 16,
};

const mutedStyle = { color: "var(--text-muted, var(--text-secondary))", lineHeight: 1.6 };

export default function LipidomicsAnalysisRenderer() {
  const [contract, setContract] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setContract(null);
    setError("");
    fetch(endpointUrl(CONTRACT_URL), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).then(async response => {
      let payload = {};
      try { payload = await response.json(); } catch { /* handled as an invalid contract below */ }
      if (!response.ok) throw new Error(`Unable to load plugin capabilities (${response.status}).`);
      if (payload.plugin !== "lipidomics_analysis" || payload.read_only !== true ||
          !Array.isArray(payload.operations) || !payload.operations.includes("analyze_lipids")) {
        throw new Error("Workbench returned an unexpected lipidomics capability contract.");
      }
      return payload;
    }).then(payload => {
      if (!controller.signal.aborted) setContract(payload);
    }).catch(loadError => {
      if (!controller.signal.aborted) setError(loadError.message || "Unable to load lipidomics capabilities.");
    });
    return () => controller.abort();
  }, [attempt]);

  return (
    <section aria-label="Lipidomics analysis workspace" style={{ display: "grid", gap: 16 }}>
      <Panel>
        <PanelHeader title="Lipidomics analysis" icon="teal" />
        <PanelBody>
          <p style={{ marginTop: 0, ...mutedStyle }}>
            Deterministic summaries of a supplied lipid feature matrix: per-feature mean abundance,
            lipid-class counts, per-sample totals, quality checks, and provenance. No annotations or
            lipid identities are inferred.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span className="plugin-meta">Metabolomics</span>
            <span className="plugin-meta">Workflow node</span>
            <span className="plugin-meta">Read-only plugin page</span>
          </div>
        </PanelBody>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 16 }}>
        <Panel>
          <PanelHeader title="Input contract" />
          <PanelBody>
            <p style={{ ...mutedStyle, marginTop: 0 }}>Provide a CSV feature matrix as the workflow input <code>feature_matrix</code>.</p>
            <ul style={{ ...mutedStyle, paddingLeft: 20 }}>
              <li><code>feature_id</code> is required.</li>
              <li>Include one or more numeric sample columns.</li>
              <li><code>lipid_class</code>, <code>lipid_subclass</code>, and <code>annotation_confidence</code> are optional.</li>
              <li>Abundances must be numeric and non-negative; unlabeled classes remain <code>UNANNOTATED</code>.</li>
            </ul>
            <pre style={{ ...cardStyle, overflowX: "auto", marginBottom: 0, fontSize: 12 }}>
              {"feature_id,lipid_class,lipid_subclass,sample_1,sample_2\nLIPID_001,PC,PC 34:1,120.5,98.2\nLIPID_002,TG,TG 52:3,42.0,51.7"}
            </pre>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Computed outputs" />
          <PanelBody>
            <ul style={{ ...mutedStyle, paddingLeft: 20, marginTop: 0 }}>
              <li><code>features</code>: mean abundance and supplied class/subclass labels.</li>
              <li><code>class_counts</code>: feature counts by lipid class.</li>
              <li><code>sample_totals</code>: summed abundance for each sample.</li>
              <li><code>qc</code>: feature count, sample count, and zero-mean feature count.</li>
              <li><code>provenance</code>: computation method, source, and run ID.</li>
            </ul>
            <p style={{ ...mutedStyle, marginBottom: 0 }}>The result is emitted as the <code>lipidomics_results</code> JSON artifact.</p>
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Execution availability" />
        <PanelBody>
          {error ? <div role="alert" className="plugin-error">
            {error} <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" onClick={() => setAttempt(value => value + 1)}>Retry</button>
          </div> : null}
          {!error && !contract ? <p role="status" style={mutedStyle}>Checking the Workbench capability contract…</p> : null}
          {contract ? <>
            <p role="status" style={{ marginTop: 0 }}>
              <strong>Capability registered:</strong> <code>{contract.operations[0]}</code>
            </p>
            <p style={{ ...mutedStyle, marginBottom: 0 }}>
              This plugin route is read-only and does not provide a direct upload/run endpoint. Run it as a workflow node with a registered <code>feature_matrix</code> input; this page does not simulate or submit an analysis.
            </p>
          </> : null}
        </PanelBody>
      </Panel>
    </section>
  );
}
