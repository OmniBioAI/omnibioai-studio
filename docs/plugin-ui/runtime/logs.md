# LogViewer

## Purpose

Display a run's own log lines, read-only.

## When to use it

Always, for any `async_analysis` plugin with a `logs` endpoint — composed
automatically by `AsyncAnalysisRenderer`, polled alongside `status` every 2
seconds until a terminal state.

## When NOT to use it

Not applicable to `informational`/`query` plugins.

## Descriptor contract

None. One trusted prop: `lines` (an array of strings), supplied by the
renderer from the `logs` endpoint's `{"lines": [...]}` response.

## Properties / fields

```jsx
<LogViewer lines={["Starting normalization…", "Normalization complete."]} />
```

If `lines` is empty, the component renders nothing at all (not an empty
box) — there is no "no logs yet" placeholder state.

## Backend responsibilities

Return log lines as plain strings via the fixed `logs` endpoint, scoped and
authorized exactly like `status`/`artifacts`. The backend is the sole
source of log content — this component never tails a file, opens a
websocket, or polls anything itself.

## Frontend responsibilities

Join the provided lines with `\n` and render them inside a `<pre>` block.
No ANSI-color interpretation, log-level parsing, filtering, search, or
auto-scroll logic exists.

## Security boundary

Log content is rendered as plain preformatted text — never as HTML, and
never executed. A log line that happens to contain HTML- or script-looking
text is displayed verbatim and inertly.

## States

Empty (renders `null`), populated (`<pre>` block with joined lines) —
there is no distinct loading/error state for this component itself; a
polling failure is surfaced by the renderer's own error handling, not by
`LogViewer`.

## Accessibility

A plain `<pre>` block — screen readers read it as static text; there is no
live-region announcement on new lines (new lines simply appear in the DOM
on the next poll, like any other re-render).

## Scientific-data considerations

Long single log lines are not wrapped or truncated by this component —
they follow normal `<pre>` overflow behavior inside its container.

## Example

An analysis run's log tail showing normalization/dispersion-estimation
progress messages.

## Rendered behavior

A monospace block of the run's current log lines, growing as new lines
arrive on each 2-second poll.

## Validation / failure behavior

Non-array `lines` would fail before reaching this component
(`AsyncAnalysisRenderer` always normalizes the logs response to an array or
empty array before setting state).

## Testing

`tests/ui/logs.test.jsx`, `tests/ui/async-analysis-renderer.test.jsx`.

## Related components

[run-status](run-status.md), [async run lifecycle](async-analysis.md)
