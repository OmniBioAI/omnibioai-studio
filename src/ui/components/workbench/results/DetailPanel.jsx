import React from "react";
import { Panel, PanelBody, PanelHeader } from "../../UI";
import KeyValueResult from "./KeyValueResult";
import ResultsTable from "./ResultsTable";
import { validStructuredDetailRecord } from "../../../lib/pluginUiContracts";
import "./detail.css";

function DetailSection({ section, value }) {
  const instanceId = React.useId().replaceAll(":", "");
  const headingId = `workbench-detail-${section.id}-${instanceId}`;
  return <section className="workbench-detail-section" aria-labelledby={headingId}>
    <h3 id={headingId}>{section.title}</h3>
    {section.presentation === "table"
      ? <ResultsTable columns={section.columns} rows={value} rowKey={section.row_key} caption={section.title} />
      : <KeyValueResult fields={section.fields} record={value} emptyMessage={`No ${section.title.toLowerCase()} available.`} />}
  </section>;
}

export default function DetailPanel({ title = "Detail", fields = [], sections, record = null, loading = false,
  error = "", headingRef }) {
  const structured = sections !== undefined;
  const validStructured = !structured || !record || validStructuredDetailRecord(record, sections, { strict: true });
  return <section className="workbench-detail" aria-busy={loading} aria-label={title}>
    <Panel>
      <PanelHeader title={title} />
      <PanelBody>
        <h2 className="workbench-sr-only" ref={headingRef} tabIndex={-1}>{title}</h2>
        {loading && <p role="status">Loading detail…</p>}
        {error && <p role="alert" className="plugin-error">{error}</p>}
        {!loading && !error && record && !validStructured && <p role="alert" className="plugin-error">Invalid structured detail data.</p>}
        {!loading && !error && record && validStructured && (structured
          ? <div className="workbench-detail-sections">{sections.filter(section => Object.hasOwn(record, section.id))
            .map(section => <DetailSection key={section.id} section={section} value={record[section.id]} />)}</div>
          : <KeyValueResult fields={fields} record={record} />)}
        {!loading && !error && !record && <p role="status">No detail selected.</p>}
      </PanelBody>
    </Panel>
  </section>;
}
