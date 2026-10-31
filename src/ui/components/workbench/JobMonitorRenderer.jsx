import React, { useCallback, useEffect, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "../UI";
import { pluginEndpoint } from "../../lib/pluginApi";
import { safeErrorMessage } from "../../lib/safeErrorMessage";
import "./JobMonitorRenderer.css";

const LIST_ENDPOINT = "/plugins/job_monitor/api/runs/";
const TERMINAL = new Set(["COMPLETED", "COMPLETE", "FAILED", "ERROR", "CANCELED", "CANCELLED"]);

async function getJson(path, signal) {
  const response = await fetch(pluginEndpoint(path), {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || payload.error || `Workbench request failed (${response.status}).`);
  return payload;
}

export default function JobMonitorRenderer() {
  const [runs, setRuns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refreshRuns = useCallback(async (signal) => {
    const payload = await getJson(LIST_ENDPOINT, signal);
    setRuns(Array.isArray(payload.runs) ? payload.runs : []);
    setError("");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const refresh = async () => {
      try {
        await refreshRuns(controller.signal);
      } catch (failure) {
        if (active && !controller.signal.aborted) setError(safeErrorMessage(failure, "Could not load runs."));
      } finally {
        if (active) setLoading(false);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [refreshRuns]);

  useEffect(() => {
    if (!selected) { setDetails(null); return undefined; }
    const controller = new AbortController();
    let active = true;
    const refreshDetails = async () => {
      const runPath = `/plugins/job_monitor/api/run/${encodeURIComponent(selected.run_id)}/`;
      const suffix = `?plugin=${encodeURIComponent(selected.plugin)}`;
      try {
        const [status, logs, artifacts] = await Promise.all([
          getJson(`${runPath}status/${suffix}`, controller.signal),
          getJson(`${runPath}logs/${suffix}`, controller.signal),
          getJson(`${runPath}artifacts/${suffix}`, controller.signal),
        ]);
        if (active) {
          setDetails({ status, logs: logs.logs || [], artifacts: artifacts.outputs || [] });
          setSelected(previous => previous && previous.run_id === selected.run_id && previous.plugin === selected.plugin && previous.state !== status.state
            ? { ...previous, state: status.state }
            : previous);
        }
      } catch (failure) {
        if (active && !controller.signal.aborted) setError(safeErrorMessage(failure, "Could not load run details."));
      }
    };
    refreshDetails();
    const timer = TERMINAL.has(selected.state) ? null : window.setInterval(refreshDetails, 3000);
    return () => { active = false; controller.abort(); if (timer) window.clearInterval(timer); };
  }, [selected?.run_id, selected?.plugin, selected?.state]);

  return (
    <div className="native-plugin-page job-monitor-page">
      <Panel>
        <PanelHeader title="Recent runs" />
        <PanelBody>
          {error ? <p className="plugin-error" role="alert">{error}</p> : null}
          {loading ? <p role="status">Loading runs…</p> : null}
          {!loading && !runs.length ? <p>No runs found.</p> : null}
          {runs.length ? (
            <div className="job-monitor-table-wrap">
              <table className="job-monitor-table">
                <thead><tr><th>Run ID</th><th>Plugin</th><th>State</th><th>Created</th><th>Action</th></tr></thead>
                <tbody>{runs.map(run => (
                  <tr key={`${run.plugin}:${run.run_id}`}>
                    <td>{run.run_id}</td><td>{run.plugin}</td><td>{run.state}</td><td>{run.created_at || "—"}</td>
                    <td><button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" onClick={() => setSelected(run)}>Open</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : null}
        </PanelBody>
      </Panel>
      {selected ? (
        <Panel>
          <PanelHeader title={`Run details · ${selected.run_id}`} />
          <PanelBody>
            {details ? <>
              <h3>Status</h3><pre>{JSON.stringify(details.status, null, 2)}</pre>
              <h3>Logs</h3><pre>{details.logs.join("\n") || "No logs found."}</pre>
              <h3>Artifacts</h3><pre>{JSON.stringify(details.artifacts, null, 2)}</pre>
            </> : <p role="status">Loading run details…</p>}
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}
