import React, { useEffect, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "../UI";
import { pluginEndpoint } from "../../lib/pluginApi";

const RUN_ID = /^[A-Za-z0-9_.:-]{1,255}$/;

function lifecycleEndpoints(descriptor, slug, runId) {
  if (descriptor.endpoints?.status && descriptor.endpoints?.logs && descriptor.endpoints?.artifacts) {
    return {
      status: descriptor.endpoints.status.replace("{run_id}", runId),
      logs: descriptor.endpoints.logs.replace("{run_id}", runId),
      artifacts: descriptor.endpoints.artifacts.replace("{run_id}", runId),
    };
  }
  if (slug === "job_monitor") {
    const encodedRun = encodeURIComponent(runId);
    const query = "?plugin=job_monitor";
    return {
      status: `/plugins/job_monitor/api/run/${encodedRun}/status/${query}`,
      logs: `/plugins/job_monitor/api/run/${encodedRun}/logs/${query}`,
      artifacts: `/plugins/job_monitor/api/run/${encodedRun}/artifacts/${query}`,
    };
  }
  if (["scanpy_import", "scanpy_qc_filter"].includes(slug)) {
    const encodedRun = encodeURIComponent(runId);
    return {
      status: `/plugins/${slug}/api/status/${encodedRun}/`,
      logs: `/plugins/${slug}/api/log/${encodedRun}/`,
      artifacts: `/plugins/${slug}/api/artifacts/${encodedRun}/`,
    };
  }
  if (slug === "workflow_explorer") {
    return { detail: `/plugins/workflow_explorer/api/run/${encodeURIComponent(runId)}/` };
  }
  return null;
}

async function readJson(path, signal) {
  const response = await fetch(pluginEndpoint(path), {
    credentials: "same-origin", signal, headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Unable to load run (${response.status}).`);
  return payload;
}

export default function ExistingRunRenderer({ descriptor, slug, runId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const endpoints = lifecycleEndpoints(descriptor, slug, runId);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    if (!RUN_ID.test(runId || "") || !endpoints) {
      setError("This run cannot be opened from the React interface.");
      return () => controller.abort();
    }
    const load = async () => {
      try {
        if (endpoints.detail) {
          const detail = await readJson(endpoints.detail, controller.signal);
          if (!controller.signal.aborted) setData({ detail });
          return;
        }
        const [status, logs, artifacts] = await Promise.all([
          readJson(endpoints.status, controller.signal),
          readJson(endpoints.logs, controller.signal),
          readJson(endpoints.artifacts, controller.signal),
        ]);
        if (!controller.signal.aborted) setData({ status, logs, artifacts });
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.message || "Unable to load this run.");
      }
    };
    load();
    return () => controller.abort();
  }, [descriptor, endpoints?.status, endpoints?.detail, runId, slug]);

  if (error) return <p role="alert" className="plugin-error">{error}</p>;
  if (!data) return <p role="status">Loading run…</p>;

  if (data.detail) return <Panel><PanelHeader title="Workflow run" /><PanelBody>
    {Object.entries(data.detail).map(([key, value]) => <section key={key}>
      <h3>{key.replaceAll("_", " ")}</h3>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>
    </section>)}
  </PanelBody></Panel>;

  return <div className="native-plugin-page">
    <Panel><PanelHeader title="Run status" /><PanelBody>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(data.status, null, 2)}</pre>
    </PanelBody></Panel>
    <Panel><PanelHeader title="Logs" /><PanelBody>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(data.logs, null, 2)}</pre>
    </PanelBody></Panel>
    <Panel><PanelHeader title="Artifacts" /><PanelBody>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(data.artifacts, null, 2)}</pre>
    </PanelBody></Panel>
  </div>;
}
