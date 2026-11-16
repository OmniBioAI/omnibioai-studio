import React, { useEffect, useState } from "react";
import { Spinner } from "@omnibioai/ui";
import { adminCapacity } from "../../lib/biorepoApi";
import { errorText } from "./messages";

const LEVEL_TEXT = { ok: "OK", warning: "Warning", critical: "Critical", hard_stop: "Uploads paused", unknown: "Unknown" };

function tib(value) {
  return value === null || value === undefined ? "unknown" : `${Number(value).toFixed(2)} TiB`;
}

// Acceptance 8a: pool usage, raw data against the backup disk, last backup,
// archive state. Every number is in TiB (2^40 bytes), as the API reports.
export default function AdminCapacity() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState(previous => ({ ...previous, status: "loading" }));
    adminCapacity({ signal: controller.signal })
      .then(data => setState({ status: "success", data, error: null }))
      .catch(error => { if (error?.name !== "AbortError") setState({ status: "error", data: null, error }); });
    return () => controller.abort();
  }, [reload]);

  if (state.status === "error") return <div className="account-state account-state--error" role="alert">
    <strong>Capacity is unavailable</strong><span>{errorText(state.error)}</span>
    <button type="button" onClick={() => setReload(n => n + 1)}>Retry</button></div>;
  const d = state.data;
  if (!d) return <p role="status"><Spinner size="sm" /> Loading capacity…</p>;
  const backup = d.backup || {};
  const protectedNow = backup.state === "protected";
  return <section className="biorepo" aria-labelledby="biorepo-capacity-heading">
    <header className="biorepo__header"><div><h2 id="biorepo-capacity-heading">Repository capacity</h2>
      <p>All sizes in TiB. Uploads warn at {(d.thresholds_pct?.warn || []).join(" % and ")} % and stop at {d.thresholds_pct?.hard_stop} %.</p></div>
      <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" onClick={() => setReload(n => n + 1)}>Refresh</button>
    </header>
    <div className="biorepo__table-wrap"><table className="biorepo__table">
      <caption className="biorepo__sr-only">Storage volumes</caption>
      <thead><tr><th scope="col">Volume</th><th scope="col">Class</th><th scope="col">Used</th><th scope="col">Free</th>
        <th scope="col">Capacity</th><th scope="col">Used %</th><th scope="col">Repository uploads</th><th scope="col">State</th></tr></thead>
      <tbody>{(d.volumes || []).map(v => <tr key={v.id}>
        <th scope="row">{v.id}</th><td>{v.class}</td><td>{tib(v.used_tib)}</td><td>{tib(v.free_tib)}</td>
        <td>{tib(v.capacity_tib)}</td><td>{v.used_pct === null || v.used_pct === undefined ? "unknown" : `${v.used_pct} %`}</td>
        <td>{tib(v.repository_uploaded_tib)}</td>
        <td className={`biorepo__level--${v.level}`}>{LEVEL_TEXT[v.level] || v.level}</td>
      </tr>)}</tbody>
    </table></div>
    <section className={`biorepo__backup ${protectedNow ? "" : "biorepo__backup--alert"}`} aria-labelledby="biorepo-backup-heading">
      <h3 id="biorepo-backup-heading">Backup: {protectedNow ? "protected" : "NOT PROTECTED"}</h3>
      <p>Raw data {tib(backup.raw_tib)} of {tib(backup.capacity_tib)} backup capacity{backup.raw_pct !== null && backup.raw_pct !== undefined ? ` (${backup.raw_pct} %)` : ""}.</p>
      <p>{backup.last_finished_unix
        ? `Last snapshot ${new Date(backup.last_finished_unix * 1000).toISOString().replace(".000", "")}, ${backup.age_hours} h ago, exit code ${backup.last_exit_code}.`
        : backup.reason || "No backup status."}</p>
    </section>
    <p>Archive: {d.archive?.state || "unknown"}.</p>
  </section>;
}
