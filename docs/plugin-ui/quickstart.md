# Quickstart: giving an ordinary plugin a native UI

You have a normal OmniBioAI plugin — one Django operation in, one bounded
result out (or a search/detail pair, or a static informational page) — and
you want it to render as native Workbench React instead of falling back to
the legacy `ServiceViewer` iframe. This page is the fast path. It assumes you
already understand React, Django/REST, and OmniBioAI plugins in general; it
does not re-explain the architecture (see [architecture.md](architecture.md)
for that).

For almost every ordinary plugin, you will **not write any plugin-specific
JSX**. You only write a declarative descriptor plus the Django endpoints it
points at.

## The five steps

1. **Pick a renderer family.** Does the plugin submit a job and wait for a
   result (`async_analysis`, also reachable via its `generic_runner` alias)?
   Search/query and return a table or detail (`query`)? Or just show static
   read-only content (`informational`)? See
   [renderer-selection.md](renderer-selection.md) for the full decision guide,
   and stop here — keep the plugin legacy — if it's a dashboard,
   multi-stage/orchestration flow, graph/network editor, or a genuinely
   interactive molecular/genome viewer; see
   [renderers/specialized-renderers.md](renderers/specialized-renderers.md).

2. **Pick shared components for your inputs and results.** Inputs come from
   the 8 field identifiers in [fields/README.md](fields/README.md) (`text`,
   `textarea`, `number`, `select`, `checkbox`, `multiselect`, `file`,
   `resource_select`). Results come from the 9 result identifiers in
   [results/README.md](results/README.md) (`table`, `pagination`,
   `key_value`, `detail`, `filters`, `reference`, `artifact_list`,
   `artifact_download`, `image_gallery`), plus the non-registry
   `StaticPngResult` for a declared primary render. Consult the result table:
   some IDs occupy validated descriptor slots, while others are composed by
   a renderer. You never name a React module or write plugin-specific JSX.

3. **Write the descriptor.** A JSON object naming your schema version,
   renderer, inputs, and result shape. See
   [descriptor-spec.md](descriptor-spec.md) for the full grammar and two
   complete minimal examples. The descriptor is pure declarative data — it
   never contains an arbitrary/external URL template, filesystem path,
   credential, script, or component name beyond the fixed registry
   identifiers and plugin-scoped endpoint grammar.

4. **Implement the Django side.** Your plugin's authoritative endpoints
   (`/plugins/{slug}/api/ui-query/`, `/plugins/{slug}/api/ui-detail/{id}/`,
   `/plugins/{slug}/api/artifacts/{run_id}/`, etc., depending on renderer)
   authenticate, authorize, validate, normalize, execute, and project exactly
   the fields your descriptor declares. See
   [security-model.md](security-model.md) for what must never cross into the
   frontend, and the renderer-specific pages under
   [renderers/](renderers/README.md) for exactly which endpoints each family
   expects.

5. **Add tests and verify.** Descriptor/schema tests, backend contract tests
   (auth, ownership, validation, malformed input), and frontend rendering
   tests. See [testing.md](testing.md) for the real test files to model yours
   on and the verification command sequence.

## Worked examples

- Submit-and-poll analysis: [examples/async-analysis-deseq2.md](examples/async-analysis-deseq2.md)
- Search-and-detail query: [examples/query-rcsb-pdb.md](examples/query-rcsb-pdb.md)
- Conditional/mode-dependent inputs: [examples/conditional-classifier.md](examples/conditional-classifier.md)
- Artifacts and images: [examples/artifact-image.md](examples/artifact-image.md)

## Migrating an existing legacy template instead of starting fresh?

See [migration-guide.md](migration-guide.md) — the steps above are the same,
but you additionally need to preserve the legacy template's scientific
behavior and keep `ServiceViewer` as a fallback until you've proven parity.

## The full guide

This page intentionally skips detail to stay short. For the complete
step-by-step walkthrough — including exact decision rules for booleans vs.
multi-select vs. resource selection, adding a scientific cross-reference,
exposing downloadable artifacts, and choosing a result presentation — read
[creating-plugin-ui.md](creating-plugin-ui.md).
