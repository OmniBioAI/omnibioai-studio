import React from "react";
import { scalarText, validScalarFields, validScalarRecord } from "../../../lib/pluginUiContracts";
import "./detail.css";

export default function KeyValueResult({ fields, record, emptyMessage = "No detail available." }) {
  if (!validScalarFields(fields) || !validScalarRecord(record, fields)) {
    return <p className="plugin-error" role="alert">Invalid scalar result data.</p>;
  }
  const present = fields.filter(field => Object.hasOwn(record, field.key) && record[field.key] !== null);
  if (present.length === 0) return <p role="status">{emptyMessage}</p>;
  return <dl className="workbench-key-value">
    {fields.map(field => <div className="workbench-key-value-row" key={field.key}>
      <dt>{field.label}</dt>
      <dd>{scalarText(Object.hasOwn(record, field.key) ? record[field.key] : null)}</dd>
    </div>)}
  </dl>;
}
