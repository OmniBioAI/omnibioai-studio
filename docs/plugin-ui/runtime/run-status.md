# RunStatus

## Purpose

Display the current state of an async run, plus any backend-supplied detail
text.

## When to use it

Always, for any `async_analysis` plugin — it's composed automatically by
`AsyncAnalysisRenderer` whenever a run exists (`runId` is set); you never
declare it from a descriptor.

## When NOT to use it

Not applicable to `informational` or `query` plugins — neither has a run
lifecycle.

## Descriptor contract

None. `RunStatus` takes one trusted prop, `status`, supplied by the
renderer's own polling loop.

## Properties / fields

```jsx
<RunStatus status={{ state: "RUNNING", detail: "Normalizing counts…" }} />
```

`status.state` is rendered verbatim (defaulting to the literal text
"Queued" if absent/empty); `status.detail`, if present, is appended as
`": {detail}"`.

## Backend responsibilities

**`state` is an unenforced free-text string, not a strict backend enum.**
Do not assume a fixed set beyond what `AsyncAnalysisRenderer`'s own
`TERMINAL` set treats specially (see [async-analysis.md](async-analysis.md)).
A backend may report any state string that's meaningful for its own
lifecycle; `detail` should be a short, human-readable, already-safe string
— it is rendered as plain text, not interpreted.

## Frontend responsibilities

Render `state`/`detail` as a `role="status"` paragraph — nothing else.
`RunStatus` performs no interpretation, mapping, or styling decision based
on specific state values; that logic (e.g. showing a failure message) lives
in `AsyncAnalysisRenderer` itself, not here.

## Security boundary

Plain escaped text only; `state`/`detail` are never used to construct a
URL, class name lookup, or any dynamic behavior.

## States

Whatever the backend reports — commonly `RUNNING`, `COMPLETED`/`COMPLETE`,
`FAILED`/`ERROR`, `CANCELLED` (the five values `AsyncAnalysisRenderer`'s
`TERMINAL` set recognizes), but the component itself has no opinion on
which strings are valid.

## Accessibility

`role="status"` — screen readers announce state changes as they happen,
without requiring focus to move.

## Scientific-data considerations

Not applicable.

## Example

```json
{"state": "FAILED", "detail": "Counts matrix contained non-numeric values in column 3."}
```

## Rendered behavior

A single live-updating status line, polled every 2 seconds by the parent
renderer until a terminal state.

## Validation / failure behavior

No independent validation; a missing/empty `state` simply shows "Queued."

## Testing

`tests/ui/async-analysis-renderer.test.jsx`, `tests/ui/logs.test.jsx`.

## Related components

[logs](logs.md), [async run lifecycle](async-analysis.md)
