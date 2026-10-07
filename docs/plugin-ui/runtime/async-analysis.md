# Async run lifecycle

This page is about the **runtime mechanics** of a submit-and-poll run — form
submission through terminal state. For the renderer itself as a descriptor
choice (`renderer: "async_analysis"`), see
[renderers/async-analysis.md](../renderers/async-analysis.md).

## The lifecycle

```text
form (PluginForm/PluginField)
  -> submit (POST multipart/form-data to endpoints.submit, with CSRF token)
  -> run identity (backend returns {run_id, status})
  -> poll (every 2000ms: GET status + GET logs, in parallel)
  -> status/logs (RunStatus + LogViewer re-render on each poll)
  -> terminal state reached
  -> results/artifacts (GET artifacts once, then PluginResults renders)
```

This is implemented end-to-end in
`src/ui/components/workbench/AsyncAnalysisRenderer.jsx`.

## Submission

Required-field presence is checked client-side first, for immediate UX
feedback (`file`: at least one selected file; `text`/`textarea`: non-empty
trimmed string; `checkbox`: must be `true`; `multiselect`: non-empty array)
— this is a UX convenience, not the authoritative check. The backend
independently re-validates every field. On submit, Studio builds a
`FormData` body: file inputs append each file; checkboxes append the
literal string `"true"`/`"false"`; multiselects append a JSON-stringified
array; everything else appends the raw string value (omitting
empty/null/undefined). The POST includes `X-CSRFToken` and
`credentials: "same-origin"`.

## Polling

The renderer polls on a fixed **2000ms interval**, starting immediately
(the first poll fires before the interval's first tick). Each poll fetches
`status` and `logs` in parallel. Once `status.state` is one of `COMPLETED`/
`COMPLETE`, the loop fetches `artifacts` once more and stops; for any other
state in `TERMINAL`, it just stops. On a fetch failure, the loop stops and
surfaces an error — it does not keep retrying indefinitely.

## Terminal states

```js
const TERMINAL = new Set(["COMPLETED", "COMPLETE", "FAILED", "ERROR", "CANCELLED"]);
```

`CANCELLED` was added to this set as the one narrow, zero-new-feature fix in
the current codebase: `status.state` is an unenforced free-text string (see
[run-status.md](run-status.md)), and at least one plugin legitimately writes
exactly `"CANCELLED"`. Without it in `TERMINAL`, a plugin that reported
`CANCELLED` would poll forever. **This does not add a cancel feature** —
there is no cancel button, no descriptor field, and no new endpoint; it only
makes the existing polling loop correctly recognize a state value the
architecture already permitted.

## No generic cooperative cancellation

Exactly one plugin in this codebase (`multi_agent_bio_orchestrator`) has a
wired, authorized cancel endpoint today, and it only flips the run's
recorded state to `CANCELLED` — its own executor's step loop never checks
for that flag, so it does **not** actually interrupt execution. Do not build
against, or assume, a generic cancel capability: making one real would
require cooperative-cancellation support in essentially every other legacy
executor first, which is backend work, not a frontend/renderer gap.

## No fabricated progress

There is no percentage-complete anywhere in the shared `RunStore`
`status.json` contract. `RunProgress` is not currently a generic component
**because there is no authoritative percentage for it to display** — a
couple of plugins compute a percentage privately, entirely outside the
shared contract, which is exactly why it isn't something this system can
show generically today. Do not approximate progress with elapsed time, poll
count, or any other proxy.

## Fast/synchronous-completing plugins

`AsyncAnalysisRenderer` submits, then immediately begins polling — a
plugin whose `execution_model` is effectively synchronous just has its
first poll observe an already-terminal state. This is a fast degenerate
case of the same lifecycle, not a separate mode or renderer.

## Related

- [run-status.md](run-status.md), [logs.md](logs.md)
- [renderers/async-analysis.md](../renderers/async-analysis.md)
- [results/artifacts.md](../results/artifacts.md),
  [results/image-gallery.md](../results/image-gallery.md),
  [results/static-png.md](../results/static-png.md)

## Testing

`tests/ui/async-analysis-renderer.test.jsx` — including the `CANCELLED`
terminal-state regression test.
