# Runtime components

`RunStatus` and `LogViewer` are the complete runtime-presentation UI for an
async run — both unchanged across the whole #708 effort. Neither is a
`componentRegistry` entry; both are composed directly by
[AsyncAnalysisRenderer](../renderers/async-analysis.md), which also owns the
submit → poll → results lifecycle documented on
[async-analysis.md](async-analysis.md) in this directory.

| Component | File | Descriptor key? | Purpose |
| --- | --- | --- | --- |
| [RunStatus](run-status.md) | `src/ui/components/workbench/RunStatus.jsx` | No | Current run state + optional detail text |
| [LogViewer](logs.md) | `src/ui/components/workbench/LogViewer.jsx` | No | Joined run log lines |
| [async run lifecycle](async-analysis.md) | `AsyncAnalysisRenderer.jsx` | `renderer: "async_analysis"` | Submit/poll/terminal/results orchestration |

There is no `RunProgress` component, and none is currently justified: the
shared `RunStore` `status.json` contract has no percentage/progress field
anywhere, so a progress bar would have no real, authoritative data to show.
There is likewise no generic run-action (cancel/retry) component — see
[async-analysis.md](async-analysis.md) for why.

## Related

- [renderers/async-analysis.md](../renderers/async-analysis.md) — the
  renderer that composes these.
- [results/artifacts.md](../results/artifacts.md) — what appears once a run
  reaches a terminal success state.
