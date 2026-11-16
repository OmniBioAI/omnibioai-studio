import React from "react";

// The graph as a list of runs, each with what it read and wrote: readable
// with a screen reader and at phone width, unlike a drawn graph.
function nodeLabel(node, datasetId) {
  if (!node) return "unknown";
  if (node.hidden) return "a version you can’t see";
  const [ds, version] = String(node.id).split("@");
  const mark = node.deleted ? " (deleted)" : "";
  return `${ds === datasetId ? "this dataset" : ds} ${version || ""}${mark}`.trim();
}

export function runsFromGraph(graph) {
  const nodes = new Map((graph?.nodes || []).map(n => [n.id, n]));
  const runs = new Map();
  for (const n of nodes.values()) {
    if (n.kind === "workflow_run" || n.kind === "tes_run") runs.set(n.id, { run: n, inputs: [], outputs: [] });
  }
  for (const e of graph?.edges || []) {
    if (e.role === "input" && runs.has(e.to)) runs.get(e.to).inputs.push(nodes.get(e.from));
    if (e.role === "output" && runs.has(e.from)) runs.get(e.from).outputs.push(nodes.get(e.to));
  }
  return [...runs.values()];
}

export default function LineageView({ graph, datasetId, depth, onDepth, onOpenDataset }) {
  const runs = runsFromGraph(graph);
  const item = (node, index) => {
    const ds = node && !node.hidden ? String(node.id).split("@")[0] : null;
    return <li key={`${node?.id}-${index}`}>{ds && ds !== datasetId
      ? <button type="button" className="biorepo__link" onClick={() => onOpenDataset(ds)}>{nodeLabel(node, datasetId)}</button>
      : nodeLabel(node, datasetId)}{node?.backup_class === "derived" && <span className="biorepo__badge">derived</span>}</li>;
  };
  return <section className="biorepo__lineage" aria-labelledby="biorepo-lineage-heading">
    <header className="biorepo__subheader">
      <h3 id="biorepo-lineage-heading">Lineage</h3>
      <label>Run hops <select value={depth} onChange={event => onDepth(Number(event.target.value))}>
        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    </header>
    {runs.length === 0 ? <p className="biorepo__muted">No runs have read or produced this dataset yet.</p>
      : <ol className="biorepo__runs">{runs.map(({ run, inputs, outputs }) => <li key={run.id}>
        <strong>{run.kind === "tes_run" ? "TES run" : "Workflow run"} {String(run.id).split(":").slice(1).join(":")}</strong>
        <span className="biorepo__muted"> {run.workflow_id || "unknown workflow"}
          {run.workflow_version ? ` @ ${run.workflow_version}` : ""} · {run.pinned ? "pinned" : "not pinned"}</span>
        <div className="biorepo__run-io">
          <div><span>Read</span><ul>{inputs.length ? inputs.map(item) : <li className="biorepo__muted">no repository inputs</li>}</ul></div>
          <div><span>Wrote</span><ul>{outputs.map(item)}</ul></div>
        </div>
      </li>)}</ol>}
    {graph?.truncated && <p role="status" className="biorepo__muted">The graph is large; only part of it is shown.</p>}
  </section>;
}
