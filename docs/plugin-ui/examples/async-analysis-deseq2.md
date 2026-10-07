# Async-analysis contract walkthrough — DESeq2 Differential Expression

Real plugin, verified from Workbench `main` at
`plugins/deseq2_analysis/` (`plugin.json`, `executor.py`, `scripts/run.R`).
It demonstrates the descriptor, renderer, and intended artifact shapes, but
it is **not** current end-to-end production proof: its executor has the
ownership-erasure defect described below.

## 1. Plugin shape

From `plugins/deseq2_analysis/plugin.json`: `execution_model: "async_thread"`,
`poll_interval_s: 5`, `timeout_s: 3600`. One required input
(`counts_matrix`, TSV), one produced output (`de_results`, TSV). The card
description: "Runs the real DESeq2 workflow and emits differential results,
MA plot, and normalized counts."

## 2. Input fields

The plugin's `io_contract.consumes` declares `counts_matrix` as a required
file-shaped input. In the native UI vocabulary this is a `file` field (see
[../fields/file-upload.md](../fields/file-upload.md)) — exactly the kind of
bounded, file-based input the shared field contract already supports, with
no plugin-specific JSX needed.

## 3. Renderer selection

`async_analysis` (or its `generic_runner` compatibility alias — see
[../renderers/async-analysis.md](../renderers/async-analysis.md)) is correct
because the plugin submits a job and the browser must poll for a result
rather than get one back synchronously.

## 4. Django/backend responsibilities (verified from `executor.py`)

The executor's intended run path:

- Resolves the counts matrix either from an uploaded artifact
  (`step_input.artifact_path("counts_matrix")`) or from `params`.
- Re-calls `RunStore.create_run(plugin=plugin, category=CATEGORY, ...)`
  (the ownership defect detailed immediately below), then uses
  `RunStore.set_state(..., "RUNNING", ...)` and `RunStore.set_step(...)` as
  it progresses.
- Writes progress via `RunStore.append_log(...)`.
- On completion, reads `artifacts.json` from its own output directory and
  calls `RunStore.write_artifacts(plugin=plugin, run_id=run_id, ...)` to
  publish the validated artifact manifest, then
  `RunStore.complete(plugin=plugin, run_id=run_id, detail="OK")`.
- On failure, calls `RunStore.fail(plugin=plugin, run_id=run_id,
  error=str(e))`.

The generic `_api_run` view records `owner_user_id` from the authenticated
request before calling the executor. Current `Deseq2AnalysisExecutor.submit()`
then calls `RunStore.create_run()` again with `meta={"cli": True}` and no
`owner_user_id`. Because that operation replaces `run.json`, it erases the
owner and causes subsequent status/artifact authorization to fail closed.
This is the same out-of-scope executor ownership defect documented in
[artifact-image.md](artifact-image.md), not a missing React component or
descriptor capability. Fixing it belongs to the separate backend-hardening/
migration workstream; this documentation does not change production code.

## 5. Validation

Input validation (matrix shape, required columns) happens inside the
executor/DESeq2 R workflow itself before any result is written — not in
React, and not in a generic frontend numeric check.

## 6. Run creation and polling

`AsyncAnalysisRenderer` (see
[../runtime/async-analysis.md](../runtime/async-analysis.md)) submits the
form, receives a run identity, and polls status/logs until a terminal state
(`COMPLETED`/`FAILED`/`CANCELLED`/etc.) is reached — this is generic runtime
behavior, not anything DESeq2-specific.

## 7. Result/artifact contract

When the executor completes, its manifest exposes differential-expression
results (a table-kind artifact), an MA plot (a plot-kind artifact), and
normalized counts — presented through `ArtifactList`/`ArtifactDownload` (see
[../results/artifacts.md](../results/artifacts.md)) for every output. The MA
plot is also shown inline by `ImageGallery` because the current component
renders any non-empty set of `kind: "plot"`, `image/*` artifacts — including
this one-image case (see
[../results/image-gallery.md](../results/image-gallery.md)). DESeq2 does not
declare the separate `static_png` primary-render contract. In the current
backend, however, the erased owner prevents the browser from reaching this
otherwise-supported presentation path.

## 8. Tests

Studio: `tests/ui/async-analysis-renderer.test.jsx`,
`tests/ui/workbench-artifacts.test.jsx`. This example's backend-side test
coverage (executor correctness, RunStore interaction) lives in
`plugins/deseq2_analysis/tests/` in the backend repository — present at the
time of writing, not independently re-verified line-by-line for this guide.

## 9. Intended UI behavior and current limitation

With ownership preserved, the developer submits the counts matrix and the
page shows a run-status region
(see [../runtime/run-status.md](../runtime/run-status.md)) that updates from
`RUNNING` to a terminal state, a log viewer streaming the executor's
appended log lines, and — once complete — a results panel with the
downloadable differential-expression table, the normalized counts file, and
the MA plot rendered inline. At the pinned Workbench head, the executor's
second run creation erases ownership, so authorization fails before that
successful result state can be used as an end-to-end proof.
