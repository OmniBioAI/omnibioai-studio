# async_analysis (alias: generic_runner)

## Purpose / interaction model

Submit-and-poll: one form submission starts a run; the page polls status
and logs until a terminal state, then shows results/artifacts.

## Intended plugin class

Any plugin that runs a real analysis job with duration — differential
expression, classification, enrichment, QC pipelines. Real example:
`deseq2_analysis`.

## Descriptor shape it expects

`renderer: "async_analysis"` (or the legacy alias `"generic_runner"`),
schema v1, `inputs` drawn from the v1 field vocabulary (`file`, `text`,
`textarea`, `select`, `checkbox`, `multiselect`, `resource_select`, with
optional conditional visibility/requiredness), required capabilities
`submit`, `status`, `logs`, `artifacts`, `downloads`, and matching fixed
endpoints. See [descriptor-spec.md](../descriptor-spec.md).

## Lifecycle

See [runtime/async-analysis.md](../runtime/async-analysis.md) for the full
mechanics (submission encoding, 2-second polling, the exact `TERMINAL`
state set, and why there's no generic cancel or fabricated progress).

## Backend endpoint responsibilities

- `submit` — authenticate, validate every field, create the run with
  `owner_user_id` from the authenticated request (never from submitted
  data), start execution, return `{"run_id", "status"}`.
- `status` — return the current, unenforced-free-text `state` plus optional
  `detail`.
- `logs` — return `{"lines": [...]}`.
- `artifacts` — return the validated artifact list once terminal (see
  [results/artifacts.md](../results/artifacts.md)).
- `download` — authenticated, ownership-checked, contained file download.

## Frontend responsibilities

`AsyncAnalysisRenderer` owns form state, submission, polling, and handing
off to `PluginResults` on success — no plugin-specific branching anywhere
in this component.

## Security boundary

Full [security-model.md](../security-model.md) FORM and ARTIFACT flows
apply. The run's `owner_user_id` must come from the authenticated request
only — see [migration-guide.md](../migration-guide.md) for the real,
documented defect class (legacy executors that re-create the run with
`meta={"cli": True}` and erase this) that currently blocks several
otherwise-ready plugins from going native.

## States / terminal states

`RUNNING` (or any other non-terminal string) while in progress;
`COMPLETED`/`COMPLETE`/`FAILED`/`ERROR`/`CANCELLED` are terminal — see
[runtime/async-analysis.md](../runtime/async-analysis.md).

## Fast-completing plugins

Not a separate mode — see
[runtime/async-analysis.md](../runtime/async-analysis.md)'s "Fast/
synchronous-completing plugins" section. A sync-execution-model plugin's
first poll simply observes an already-terminal state.

## Testing

`tests/ui/async-analysis-renderer.test.jsx`,
`tests/ui/generic-plugin-runner.test.jsx`,
`tests/ui/generic-plugin-contracts.test.js`.

## Related

[runtime/README.md](../runtime/README.md),
[results/artifacts.md](../results/artifacts.md),
[results/static-png.md](../results/static-png.md),
[results/image-gallery.md](../results/image-gallery.md)
