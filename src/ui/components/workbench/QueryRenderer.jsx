import React, { useEffect, useRef, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "../UI";
import PluginForm from "./PluginForm";
import { resolveWorkbenchComponent } from "./componentRegistry";
import { ResultsTableRow } from "./results/ResultsTable";
import { rowKeys, scalarText, valueAt } from "../../lib/pluginUiContracts";
import { downloadQueryResult, queryDetail, queryPlugin } from "../../lib/pluginQueryApi";

// A legacy single-operation descriptor has no `operations` collection --
// `activeOperation` is then the descriptor itself, so every read below
// behaves exactly as before. A multi-operation descriptor resolves to the
// currently-selected entry of `descriptor.operations`, defaulting to the
// server's own `default_operation` (never a client invention).
function resolveOperation(descriptor, operationId) {
  if (!descriptor.operations) return descriptor;
  return descriptor.operations.find(op => op.id === operationId)
    ?? descriptor.operations.find(op => op.id === descriptor.default_operation);
}

export default function QueryRenderer({ descriptor }) {
  const [operationId, setOperationId] = useState(() => descriptor.operations ? descriptor.default_operation : undefined);
  const activeOperation = resolveOperation(descriptor, operationId);
  const [values, setValues] = useState(() => Object.fromEntries(activeOperation.inputs.map(input => [input.id, input.default ?? ""])));
  const [payload, setPayload] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [downloadId, setDownloadId] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const submittedValues = useRef(null);
  const queryRequest = useRef(null);
  const detailRequest = useRef(null);
  const detailHeading = useRef(null);

  function resetResultState(nextInputs) {
    setValues(Object.fromEntries(nextInputs.map(input => [input.id, input.default ?? ""])));
    setPayload(null); setDetail(null); setError(""); setDetailError("");
    setLoading(false); setDetailLoading(false); setDownloadId(""); setDownloadError(""); submittedValues.current = null;
  }

  useEffect(() => {
    setOperationId(descriptor.operations ? descriptor.default_operation : undefined);
    resetResultState(resolveOperation(descriptor, descriptor.default_operation).inputs);
    return () => { queryRequest.current?.abort(); detailRequest.current?.abort(); };
  }, [descriptor]);

  function selectOperation(nextId) {
    // Defense in depth only: the dropdown already offers nothing but
    // server-defined ids. The real enforcement is server-side
    // (select_operation in plugins/shared/query_ui.py never trusts the
    // frontend's own allowlisting).
    if (!descriptor.operations?.some(op => op.id === nextId) || nextId === operationId) return;
    queryRequest.current?.abort(); detailRequest.current?.abort();
    setOperationId(nextId);
    resetResultState(resolveOperation(descriptor, nextId).inputs);
  }

  useEffect(() => { if (detail && !detailLoading) detailHeading.current?.focus(); }, [detail, detailLoading]);

  async function search(nextValues, page) {
    queryRequest.current?.abort(); detailRequest.current?.abort();
    const controller = new AbortController();
    queryRequest.current = controller;
    setError(""); setDetail(null); setDetailError(""); setDetailLoading(false); setLoading(true);
    // Navigation uses committed query parameters, not unsubmitted field edits.
    if (page === undefined) setPayload(null);
    try {
      const next = await queryPlugin(descriptor, nextValues, {
        page, operation: activeOperation, operationId: descriptor.operations ? operationId : undefined, signal: controller.signal,
      });
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
      const next = await queryDetail(descriptor, id, {
        operation: activeOperation, operationId: descriptor.operations ? operationId : undefined, signal: controller.signal,
      });
      if (!controller.signal.aborted) setDetail(next);
    } catch (detailFailure) {
      if (!controller.signal.aborted) setDetailError(detailFailure.message || "Detail lookup failed.");
    } finally { if (!controller.signal.aborted) setDetailLoading(false); }
  }

  async function download(id) {
    setDownloadError(""); setDownloadId(String(id));
    try {
      const response = await downloadQueryResult(descriptor, String(id));
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl; link.download = String(id); link.hidden = true;
      document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(blobUrl);
    } catch (failure) {
      setDownloadError(failure.message || "Download failed.");
    } finally { setDownloadId(""); }
  }

  const result = activeOperation.result;
  const rows = payload?.[result.rows_path] ?? [];
  // V1 detail identities already existed; use them when unique, preserving
  // index fallback for older responses that never promised stable identity.
  const rowKey = result.row_key ?? (result.detail_key && rowKeys(rows, result.detail_key) !== null ? result.detail_key : undefined);
  const keys = rowKeys(rows, rowKey);
  // Detail is a per-operation capability -- descriptor.capabilities.detail
  // only says "some operation supports detail", not this one.
  const detailEnabled = result.detail_key !== undefined;
  const downloadEnabled = result.download_key !== undefined;
  const Table = resolveWorkbenchComponent(result.presentation);
  const Pagination = activeOperation.pagination ? resolveWorkbenchComponent(activeOperation.pagination.component) : null;
  const Filters = activeOperation.filters ? resolveWorkbenchComponent(activeOperation.filters.component) : null;
  const Detail = detailEnabled ? resolveWorkbenchComponent(activeOperation.detail?.component || "detail") : null;
  const detailFields = activeOperation.detail?.fields ?? (!activeOperation.detail?.sections && detail ? Object.keys(detail)
    .filter(key => ["string", "number", "boolean"].includes(typeof detail[key]))
    .map(key => ({ key, label: key.replaceAll("_", " ") })) : []);
  const OperationSelect = descriptor.operations ? resolveWorkbenchComponent("select") : null;
  if (!Table || (activeOperation.pagination && !Pagination) || (activeOperation.filters && !Filters) || (detailEnabled && !Detail) ||
      (descriptor.operations && !OperationSelect)) {
    return <p role="alert" className="plugin-error">Unsupported query presentation.</p>;
  }

  return <div className="native-plugin-page">
    <Panel><PanelHeader title="Query" /><PanelBody>
      {descriptor.operations && <div className="plugin-field" data-field-id="operation">
        <label htmlFor="plugin-operation">Operation</label>
        <OperationSelect
          input={{ id: "operation", choices: descriptor.operations.map(op => op.id), required: true }}
          value={operationId} controlId="plugin-operation" disabled={loading}
          onChange={selectOperation} />
      </div>}
      <PluginForm inputs={activeOperation.inputs} values={values} onValueChange={(id, value) => setValues(previous => ({ ...previous, [id]: value }))}
        onSubmit={submit} submitting={loading} submitLabel="Search" filters={activeOperation.filters} FilterComponent={Filters} />
    </PanelBody></Panel>
    {(loading || error || payload) && <Panel><PanelHeader title="Results" /><PanelBody>
      {downloadError && <p role="alert" className="plugin-error">{downloadError}</p>}
      <Table columns={result.columns} rows={rows} rowKey={rowKey} loading={loading} error={error}
        trailingHeading={detailEnabled || downloadEnabled ? "Actions" : undefined}>
        {(detailEnabled || downloadEnabled) && keys ? rows.map((row, index) => {
          const id = valueAt(row, result.detail_key);
          const validId = ["string", "number"].includes(typeof id) && String(id).length > 0;
          const objectId = valueAt(row, result.download_key);
          const validDownloadId = typeof objectId === "string" && objectId.length > 0;
          return <ResultsTableRow key={keys[index]} columns={result.columns} row={row}>
            <td>{detailEnabled && <button type="button" className="omni-btn omni-btn--secondary omni-btn--md"
              disabled={!validId || loading || detailLoading} onClick={() => loadDetail(id)}>
              View{" "}<span className="workbench-sr-only">details for {scalarText(id)}</span>
            </button>}{downloadEnabled && <button type="button" className="omni-btn omni-btn--secondary omni-btn--md"
              disabled={!validDownloadId || loading || Boolean(downloadId) || row.downloadable !== true}
              onClick={() => download(objectId)}>
              {downloadId === String(objectId) ? "Downloading…" : "Download"}
              <span className="workbench-sr-only"> {scalarText(objectId)}</span>
            </button>}</td>
          </ResultsTableRow>;
        }) : undefined}
      </Table>
      {Pagination && payload && <Pagination pagination={payload.pagination} loading={loading} onNavigate={navigate} />}
    </PanelBody></Panel>}
    {(detailLoading || detailError || detail) && <Detail title={activeOperation.detail?.title || "Detail"} fields={detailFields}
      sections={activeOperation.detail?.sections}
      record={detail} loading={detailLoading} error={detailError} headingRef={detailHeading}
      pluginSlug={descriptor.plugin.slug} />}
  </div>;
}
