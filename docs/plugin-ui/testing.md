# Testing a plugin UI

This page lists what to test when you give a plugin a native declarative UI,
pointing at real existing test files to model yours on rather than inventing
a new test framework. All paths below were confirmed to exist at the time of
writing; where a path could not be confirmed, it is marked as such instead of
being asserted.

## Descriptor-level tests (Studio, confirmed)

- `tests/ui/workbench-catalog-contracts.test.js` — validates every emitted
  descriptor (native and legacy fallback) against the real frontend
  validator. This is the test that must pass for your plugin's descriptor
  before it can ship, and it is also the test the cross-repository invocation
  below drives against a real backend checkout.
- `tests/ui/renderer-registry.test.js` — exercises `resolveWorkbenchRenderer`
  against both valid renderer names and injection-shaped strings
  (`../../module`, `https://evil.example`, `javascript:alert(1)`,
  `constructor`, `prototype`, `__proto__`), confirming fail-closed behavior.
- `tests/ui/workbench-components.test.jsx`, `tests/ui/components.test.jsx` —
  registry resolution and fail-closed behavior for component identifiers.

## Backend contract tests

Confirmed present on Workbench `main` at
`7d8212a632031c3e1b1d532978fd1c8b87cb4b39`:
`plugins/shared/tests/test_plugin_ui_schema.py`, `test_plugin_ui.py`,
`test_query_ui.py`, `test_scientific_references.py`, `test_artifact_ui.py`,
`test_resource_ui.py`, `test_resource_select_field.py`, and
`test_input_components.py`. Together they cover schema validation,
unsupported-version and executable-metadata rejection, plus these focused
contracts:

- `test_query_ui.py` — query/detail endpoint auth, method, schema, and
  projection tests.
- `test_scientific_references.py` — reference-type grammar, redirect
  construction, and the open-redirect defense matrix.
- `test_artifact_ui.py` — artifact ID derivation, ownership, containment,
  filename/content-type safety.
- `test_resource_ui.py` — resource discovery view plus the IDOR test matrix
  (cross-plugin scope, cross-resource-type, undiscoverable-resource
  rejection).
- `test_resource_select_field.py` — descriptor shape plus submission
  reauthorization (discovery-listed-then-revoked resources are rejected the
  same as never-listed ones).
- `test_input_components.py` — checkbox/multiselect value, default, and
  submission-encoding tests.

At minimum, your plugin's backend tests should cover: anonymous access
(rejected), authorization (wrong user/wrong plugin/wrong run rejected),
ownership (the authenticated user's own resources only), validation
(malformed input rejected, not silently coerced), scientific constraints
(your plugin's own domain bounds), resource authorization (if using
`resource_select`), and artifact authorization (if using
`artifact_list`/`artifact_download`).

## Frontend tests (Studio, confirmed)

Model new field/result tests on:

- `tests/ui/workbench-fields.test.jsx` — basic field rendering,
  required/invalid states.
- `tests/ui/workbench-choice-fields.test.jsx` — checkbox/multiselect value,
  default, keyboard behavior.
- `tests/ui/workbench-resource-select.test.jsx` — loading/empty/error/retry
  states for resource discovery.
- `tests/ui/workbench-results.test.jsx`, `tests/ui/workbench-detail-filter.test.jsx`,
  `tests/ui/workbench-structured-detail.test.jsx` — table/pagination/detail
  rendering and section projection.
- `tests/ui/workbench-scientific-reference.test.jsx` — reference rendering
  and inert/error states for malformed data.
- `tests/ui/workbench-artifacts.test.jsx`, `tests/ui/workbench-image-gallery.test.jsx`,
  `tests/ui/static-png-result.test.jsx` — artifact/image result rendering.
- `tests/ui/async-analysis-renderer.test.jsx` — submit → poll → terminal-state
  lifecycle, including the `CANCELLED` terminal state.
- `tests/ui/query-renderer.test.jsx`, `tests/ui/query-batch.test.jsx` — query
  lifecycle, pagination reset on new search, stale-request handling.
- `tests/ui/plugin-page.test.jsx` — end-to-end descriptor load → validate →
  resolve-renderer → fallback-to-`ServiceViewer` behavior.

At minimum: rendering, required/invalid states, loading/empty/error states,
result display, and keyboard behavior where the component is interactive. Add
a new frontend test only for genuinely new shared behavior — reusing an
existing registry component for a new plugin does not need a new component
test, only new backend contract tests and a catalog-contract entry.

## Migration parity tests

When migrating a legacy template (see [migration-guide.md](migration-guide.md)),
add tests proving the native path produces the **same** scientific result,
uses the **same** executor, and preserves the **same** authorization/ownership
behavior as the legacy template did — not just that the new descriptor
validates.

## Verification command sequence

Confirmed in `package.json` and the existing Studio audit doc. Run from the
Studio repo root:

```sh
npm run test:ui                 # -> npm --prefix packages/omnibioai-ui run test:app
npm --prefix packages/omnibioai-ui test
npm run web:build                # vite build --mode web
npm run build:ui                 # vite build
node tests/workbench-components-browser.mjs
git diff --check
```

The cross-repository catalog test is skipped unless a backend path is
supplied. To run it against an isolated backend checkout with a
Django-capable Python environment:

```sh
WORKBENCH_SOURCE=/path/to/isolated/workbench PYTHON=/path/to/python npm run test:ui
```

There is no root lint or application-JSX typecheck script at the time of
writing; package TypeScript checks do not typecheck the Workbench JSX.
Browser verification uses real components/styles, fixture responses, and
blocked external traffic — it does not by itself prove a live upstream
scientific run or a packaged Electron build; run those separately for
material changes.

## Related pages

[descriptor-spec.md](descriptor-spec.md) ·
[security-model.md](security-model.md) ·
[migration-guide.md](migration-guide.md) ·
[fields/README.md](fields/README.md) ·
[results/README.md](results/README.md)
