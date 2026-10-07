# Plugin UI developer guide

This is the current-state developer reference for the OmniBioAI Workbench
declarative React UI system (GitHub issue #708): how to give an ordinary
Django plugin a native Studio page using a JSON descriptor and a fixed set of
shared React components, without writing plugin-specific JSX.

**Audience:** OmniBioAI developers who know React, Django/REST, and this
codebase's plugin concepts, but have not read the #708 implementation
history. You should be able to build or migrate an ordinary plugin's UI from
this tree alone.

**Relationship to existing docs:** `../workbench-component-library-batch-1.md`
and `../creating-workbench-plugin-ui.md` are the original implementation
record (batch-by-batch, with full audit evidence) and remain as historical/
audit reference — nothing here contradicts them, and several pages below
cite them directly. This tree restates the same, verified contract as a
coherent current-system reference, organized for lookup rather than history,
and incorporates the #708 closure corrections now present on the canonical
branches.

This reference was reconciled against Workbench `main` at
`7d8212a632031c3e1b1d532978fd1c8b87cb4b39` and Studio `main` at
`33792fcdae940f649d454d381b025d252e526140`.

## Start here

- **New to this?** [quickstart.md](quickstart.md) — the 10-minute map.
- **Building a plugin UI?** [creating-plugin-ui.md](creating-plugin-ui.md) —
  the full step-by-step guide.
- **Migrating a legacy template?** [migration-guide.md](migration-guide.md)

## Core reference

- [architecture.md](architecture.md) — the full pipeline and the
  presentation-only principle.
- [descriptor-spec.md](descriptor-spec.md) — the complete schema v1/v2
  reference.
- [renderer-selection.md](renderer-selection.md) — which renderer to pick.
- [security-model.md](security-model.md) — what a descriptor can and cannot
  control.
- [testing.md](testing.md) — how to test a plugin UI, using real existing
  patterns.

## Components

- [fields/README.md](fields/README.md) — the 8 input field primitives.
- [results/README.md](results/README.md) — the 9 registered non-field
  presentation primitives plus `StaticPngResult`.
- [runtime/README.md](runtime/README.md) — `RunStatus`, `LogViewer`, and the
  async run lifecycle.
- [renderers/README.md](renderers/README.md) — the 3 renderers plus the
  `generic_runner` alias, and the specialized-renderer boundary.

| Reference surface | Registered IDs | Count | Notes |
| --- | --- | ---: | --- |
| Input fields | `file`, `text`, `textarea`, `select`, `number`, `checkbox`, `multiselect`, `resource_select` | 8 | Schema availability differs between v1 and v2. |
| Result/presentation components | `table`, `pagination`, `key_value`, `detail`, `filters`, `reference`, `artifact_list`, `artifact_download`, `image_gallery` | 9 | Some are renderer-composed rather than descriptor-selected; see the result table. |
| Component registry total | the two rows above | **17** | `StaticPngResult` is shared but not registered. |
| Renderers | `async_analysis`, `informational`, `query` | **3** | `generic_runner` is a compatibility alias for `async_analysis`, not a fourth entry. |

## Extending the system

- [adding-a-component.md](adding-a-component.md)
- [adding-a-renderer.md](adding-a-renderer.md)

## Worked examples

- [examples/async-analysis-deseq2.md](examples/async-analysis-deseq2.md)
- [examples/query-rcsb-pdb.md](examples/query-rcsb-pdb.md)
- [examples/conditional-classifier.md](examples/conditional-classifier.md)
- [examples/artifact-image.md](examples/artifact-image.md)
