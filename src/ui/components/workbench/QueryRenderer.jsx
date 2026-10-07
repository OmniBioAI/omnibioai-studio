import React, { useEffect, useRef, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "../UI";
import PluginForm from "./PluginForm";
import { resolveWorkbenchComponent } from "./componentRegistry";
import { ResultsTableRow } from "./results/ResultsTable";
import { rowKeys, scalarText, valueAt } from "../../lib/pluginUiContracts";
import { queryDetail, queryPlugin } from "../../lib/pluginQueryApi";

export default function QueryRenderer({ descriptor }) {
  const [values, setValues] = useState(() => Object.fromEntries(descriptor.inputs.map(input => [input.id, input.default ?? ""])));
  const [payload, setPayload] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const submittedValues = useRef(null);
  const queryRequest = useRef(null);
  const detailRequest = useRef(null);
  const detailHeading = useRef(null);

  useEffect(() => {
    setValues(Object.fromEntries(descriptor.inputs.map(input => [input.id, input.default ?? ""])));
    setPayload(null); setDetail(null); setError(""); setDetailError("");
    setLoading(false); setDetailLoading(false); submittedValues.current = null;
    return () => { queryRequest.current?.abort(); detailRequest.current?.abort(); };
  }, [descriptor]);

  useEffect(() => { if (detail && !detailLoading) detailHeading.current?.focus(); }, [detail, detailLoading]);

  async function search(nextValues, page) {
    queryRequest.current?.abort(); detailRequest.current?.abort();
    const controller = new AbortController();
    queryRequest.current = controller;
    setError(""); setDetail(null); setDetailError(""); setDetailLoading(false); setLoading(true);
    // Navigation uses committed query parameters, not unsubmitted field edits.
    if (page === undefined) setPayload(null);
    try {
      const next = await queryPlugin(descriptor, nextValues, { page, signal: controller.signal });
      if (!controller.signal.aborted) {
        submittedValues.current = nextValues;
        setPayload(next);
      }
    } catch (queryError) {
      if (!controller.signal.aborted) setError(queryError.message || "Query failed.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }

  function submit(event) {
    event.preventDefault();
    search({ ...values });
  }

  function navigate(direction) {
    const pagination = payload?.pagination;
    if (loading || !pagination || !submittedValues.current) return;
    if (direction === "previous" && pagination.has_previous) search(submittedValues.current, pagination.page - 1);
    if (direction === "next" && pagination.has_next) search(submittedValues.current, pagination.page + 1);
  }

  async function loadDetail(id) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setDetailLoading(true); setDetailError(""); setDetail(null);
    try {
      const next = await queryDetail(descriptor, id, { signal: controller.signal });
      if (!controller.signal.aborted) setDetail(next);
    } catch (detailFailure) {
      if (!controller.signal.aborted) setDetailError(detailFailure.message || "Detail lookup failed.");
    } finally { if (!controller.signal.aborted) setDetailLoading(false); }
  }

  const result = descriptor.result;
  const rows = payload?.[result.rows_path] ?? [];
  // V1 detail identities already existed; use them when unique, preserving
  // index fallback for older responses that never promised stable identity.
  const rowKey = result.row_key ?? (result.detail_key && rowKeys(rows, result.detail_key) !== null ? result.detail_key : undefined);
  const keys = rowKeys(rows, rowKey);
  const detailEnabled = descriptor.capabilities.detail === true;
  const Table = resolveWorkbenchComponent(result.presentation);
  const Pagination = descriptor.pagination ? resolveWorkbenchComponent(descriptor.pagination.component) : null;
  const Filters = descriptor.filters ? resolveWorkbenchComponent(descriptor.filters.component) : null;
  const Detail = detailEnabled ? resolveWorkbenchComponent(descriptor.detail?.component || "detail") : null;
  const detailFields = descriptor.detail?.fields ?? (!descriptor.detail?.sections && detail ? Object.keys(detail)
    .filter(key => ["string", "number", "boolean"].includes(typeof detail[key]))
    .map(key => ({ key, label: key.replaceAll("_", " ") })) : []);
  if (!Table || (descriptor.pagination && !Pagination) || (descriptor.filters && !Filters) || (detailEnabled && !Detail)) {
    return <p role="alert" className="plugin-error">Unsupported query presentation.</p>;
  }

  return <div className="native-plugin-page">
    <Panel><PanelHeader title="Query" /><PanelBody>
      <PluginForm inputs={descriptor.inputs} values={values} onValueChange={(id, value) => setValues(previous => ({ ...previous, [id]: value }))}
        onSubmit={submit} submitting={loading} submitLabel="Search" filters={descriptor.filters} FilterComponent={Filters} />
    </PanelBody></Panel>
    {(loading || error || payload) && <Panel><PanelHeader title="Results" /><PanelBody>
      <Table columns={result.columns} rows={rows} rowKey={rowKey} loading={loading} error={error}
        trailingHeading={detailEnabled ? "Detail" : undefined}>
        {detailEnabled && keys ? rows.map((row, index) => {
          const id = valueAt(row, result.detail_key);
          const validId = ["string", "number"].includes(typeof id) && String(id).length > 0;
          return <ResultsTableRow key={keys[index]} columns={result.columns} row={row}>
            <td><button type="button" className="omni-btn omni-btn--secondary omni-btn--md"
              disabled={!validId || loading || detailLoading} onClick={() => loadDetail(id)}>
              View{" "}<span className="workbench-sr-only">details for {scalarText(id)}</span>
            </button></td>
          </ResultsTableRow>;
        }) : undefined}
      </Table>
      {Pagination && payload && <Pagination pagination={payload.pagination} loading={loading} onNavigate={navigate} />}
    </PanelBody></Panel>}
    {(detailLoading || detailError || detail) && <Detail title={descriptor.detail?.title || "Detail"} fields={detailFields}
      sections={descriptor.detail?.sections}
      record={detail} loading={detailLoading} error={detailError} headingRef={detailHeading} />}
  </div>;
}
