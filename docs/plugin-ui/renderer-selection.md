# Renderer selection

Pick exactly one renderer family per plugin. There are three real renderers
and one compatibility alias — see [renderers/README.md](renderers/README.md)
for the full registry.

| Choose | When | Schema |
| --- | --- | --- |
| `async_analysis` | Submit one run, poll status/logs, then show artifacts/results | v1 |
| `informational` | Render finite read-only text with no execution lifecycle | v1 |
| `query` | Repeated search with a bounded table and optional detail/pagination | v1 or v2 |
| `generic_runner` | Existing descriptor compatibility spelling for `async_analysis` | v1 |

## The decision

```text
Does the plugin execute an analysis/job (submit, then poll for status/logs/results)?
  -> async_analysis (descriptor renderer name "async_analysis" or the legacy
     alias "generic_runner" -- they resolve to the same component)
     Descriptor/interaction example: deseq2_analysis (differential-expression
     run -> status/logs -> artifacts, including an MA-plot PNG; its current
     executor ownership blocker is documented in the worked example).
     See renderers/async-analysis.md.

Is it read-only informational content with no execution lifecycle at all?
  -> informational
     See renderers/informational.md.

Does it query/search backend data and return a bounded scalar table, optionally
with pagination, secondary filters, and one authorized detail lookup?
  -> query
     Real examples: rcsb_pdb and ensembl (schema v2; the only two v2-native
     plugins today).
     See renderers/query.md and descriptor-spec.md for the v1/v2 differences
     that matter here (number fields, pagination, detail/filters/references
     are v2-only).

Does it need something else entirely -- a dashboard, a multi-stage workflow,
a graph/network view, an interactive molecular or genome viewer, or control
of a separate running application?
  -> stays on ServiceViewer (legacy); see renderers/specialized-renderers.md
     for the documented boundary and real examples of each family.
```

## Why these three and not more

Each renderer represents a genuinely distinct **interaction model**, not just
a different look:

- `async_analysis` — submit once, poll until terminal, then show results.
  A synchronous/fast-completing plugin is not a fourth model: its first poll
  simply observes an already-terminal state, so it is naturally handled by
  the same lifecycle (see [renderers/async-analysis.md](renderers/async-analysis.md)).
- `informational` — no submission, no polling, no run at all.
- `query` — repeated search-and-inspect, with its own pagination/detail
  lifecycle instead of a single terminal run.

`generic_runner` is **not** a fourth renderer. It is a legacy descriptor name
that `normalizeRendererName()` maps straight to `async_analysis`
(`src/ui/components/workbench/rendererRegistry.jsx`) — the same component,
the same lifecycle, just an older spelling some descriptors still emit.

## When nothing above fits

Don't force a dashboard, orchestration flow, graph editor, or interactive
viewer into `query`/`async_analysis`/`informational` by approximating it with
`table`/`key_value` composition. Keep the plugin on `ServiceViewer` and read
[renderers/specialized-renderers.md](renderers/specialized-renderers.md) —
it documents exactly which real plugins fall into each unsupported family
today, and the process for eventually giving one of those families its own
narrow, evidence-backed renderer (see
[adding-a-renderer.md](adding-a-renderer.md)).

## Related

- [creating-plugin-ui.md](creating-plugin-ui.md) — the full step-by-step guide
  this decision is step one of.
- [descriptor-spec.md](descriptor-spec.md)
