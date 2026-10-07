import React from "react";
import { Panel, PanelBody, PanelHeader } from "../../UI";
import KeyValueResult from "./KeyValueResult";
import "./detail.css";

export default function DetailPanel({ title = "Detail", fields = [], record = null, loading = false,
  error = "", headingRef }) {
  return <section className="workbench-detail" aria-busy={loading} aria-label={title}>
    <Panel>
      <PanelHeader title={title} />
      <PanelBody>
        <h2 className="workbench-sr-only" ref={headingRef} tabIndex={-1}>{title}</h2>
        {loading && <p role="status">Loading detail…</p>}
        {error && <p role="alert" className="plugin-error">{error}</p>}
        {!loading && !error && record && <KeyValueResult fields={fields} record={record} />}
        {!loading && !error && !record && <p role="status">No detail selected.</p>}
      </PanelBody>
    </Panel>
  </section>;
}
