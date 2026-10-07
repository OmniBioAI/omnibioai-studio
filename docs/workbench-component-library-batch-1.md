# Workbench component library — Batch 1

Workbench descriptors select explicitly registered presentation behavior. Plugin
code remains in Django. There are no plugin-specific React pages, plugin-name
branches, descriptor callbacks, or dynamic component imports.

```text
backend descriptor → pluginApi validation → PluginPage → rendererRegistry
  → QueryRenderer → PluginForm/PluginField + ResultsTable + PaginationControls
                  → pluginQueryApi → fixed authenticated Django adapter
```

## Version boundary and compatibility

Schema v1 remains supported for the existing 129 native plugins, including all
nine query plugins, conditional fields, file submissions, asynchronous runs and
static PNG results. V1 does not accept the new numeric/pagination contract.
V2 is query-only and adds exactly the Batch-1 field/table/page vocabulary below.
Old Studio clients reject v2 safely and retain ServiceViewer. Unknown versions,
components, renderers and malformed descriptors never resolve dynamically.

The existing `text` component now renders a single-line input. The backend emits
the already-supported `textarea` identifier for JSON hyperparameters so their
multiline editing is preserved. `TextareaField` remains an export alias for
`TextAreaField`; it is not a second implementation. Valid v1 descriptors retain
their transport, required conditions, endpoints and scientific behavior.
Executable and sensitive metadata, previously sometimes ignored by v1, is now
explicitly rejected. All emitted v1 descriptors are checked for compatibility.

## Fields

`PluginField` supplies one shared `FieldShell`: associated label, native required
state, description, optional unit and inline error with `aria-describedby` and
`aria-invalid`. IDs are unique across instances. `PluginForm` owns controlled
values, defaults, conditional visibility, UX validation and focus on the first
invalid field. A default applies only to an undefined value; clearing a field
does not silently restore it. Disabled, read-only, error and loading states are
trusted React props, **not** descriptor capabilities.

V2 common required keys: `id`, `component`, `format`, `label`, `description`,
`required`. Optional common keys: `default`, `placeholder`. IDs must be strings
matching `^[a-z][a-z0-9_]*$`; `__proto__`, `prototype`, `constructor`,
`password`, `token`, `api_key`, `secret`, and `credentials` are rejected.
Unknown keys fail closed.

| Primitive | Component / format | Additional allowed descriptor keys | Purpose and responsibility |
| --- | --- | --- | --- |
| TextField | `text` / `text` | None; default and placeholder are strings | Single-line names, accessions, species and searches. All have the same presentation; no speculative semantic enum. |
| TextAreaField | `textarea` / `text` | None; default and placeholder are strings | Multiline plain text. V1 keeps its existing free-text format labels, including JSON. The field never parses JSON. |
| NumberField | `number` / `integer` or `float` | `min`, `max`, `step`, `unit` | Numeric input whose edited value stays a string until the backend normalizes it. |

Numeric bounds/defaults are finite numbers, with safe integers for integer
fields. Minimum must not exceed maximum; defaults must lie within provided
bounds. A step is positive and finite (integral for integer fields); `"any"` is
allowed only for floats. Omitted step defaults to `1` or `"any"` respectively.
`unit` is inert, nonempty text up to 32 characters. No frontend rounding or
scientific conversion occurs. Browser numeric validity is feedback, not backend
validation or authorization.

```json
{
  "id": "max_resolution", "component": "number", "format": "float",
  "label": "Maximum resolution", "description": "Positive limit, validated by Django.",
  "required": false, "max": 1000, "step": "any", "unit": "Å"
}
```

RCSB accepts positive resolutions smaller than 0.1, so its field must not impose
`min: 0.1` or `step: 0.1`. Page size uses integer bounds 1–100. Species/accession
validation, defaults after omission, numeric normalization and upstream queries
remain Django responsibilities. No password, token, API-key or secret fields
are supported.

## ResultsTable

The `table` registry entry is a presentation primitive. Query descriptors retain
their existing `result.presentation` discriminator; there is no competing
universal result schema.

```json
{
  "presentation": "table", "rows_path": "results", "row_key": "pdb_id",
  "columns": [{"key": "pdb_id", "label": "PDB ID"}, {"key": "score", "label": "Score"}],
  "detail_key": "pdb_id"
}
```

V2 requires `presentation`, `rows_path`, `row_key`, `columns`; `rows_path` is
exactly `results`. Columns contain only unique flat `key` and textual `label`.
`row_key` must name a column and response identities must be nonempty, unique
strings or finite numbers. `detail_key` is present only with the existing detail
capability and must also name a column. Existing v1 dotted column paths remain
supported through own-property lookup; prototype paths are rejected.

Trusted React props are `columns`, `rows`, optional `rowKey`, `caption`,
`loading`, `error`. Scalar strings, finite numbers and booleans render as text;
missing or structured cells display an em dash, never HTML or `[object Object]`.
No precision is rounded, columns hidden, values ellipsized, or rows locally
paginated. Backend adapters project scientific fields and validate response
identity. Meaningfully formatted large identifiers must arrive as strings to
avoid JavaScript number precision loss.

Semantic column headers, a caption, a named keyboard-focusable scroll region,
loading/error/empty announcements and responsive containment are included.
Stable server identities are preferred; legacy tables without identity retain
index fallback. Trusted JSX children and `ResultsTableRow` allow the renderer to
compose its existing detail cell. These are internal composition slots and are
never accepted from descriptors. The table has no actions, fetching, sorting,
filtering, URLs or render callbacks in its declarative contract.

## PaginationControls

Only one-based backend page navigation is supported; there is no cursor mode.

Descriptor metadata: `"pagination": {"component": "pagination", "mode": "page"}`.
The descriptor also has a numeric integer `page_size` input. It may not contain
a client-controlled `page` field or any navigation URLs.

```json
{
  "mode": "page", "page": 1, "page_size": 20, "total_items": 37,
  "has_previous": false, "has_next": true
}
```

This runtime object comes from Django. Values must be safe integers with
positive page/page size and nonnegative total; boundary flags must be boolean
and consistent. The backend may set `has_next: false` before the reported total
is exhausted when upstream policy imposes a page cap. The component honors it.

The primitive accepts trusted `pagination`, `loading`, `disabled`, `onNavigate`
props. It emits only internal `previous`/`next` events; QueryRenderer translates
them into the fixed `page` parameter through `pluginQueryApi`. Buttons have
native type/disabled semantics; the current page uses `aria-current="page"`;
the navigation region has a name and announces page/loading state. Query edits
do not affect navigation until submitted. New searches reset pagination; failed
page requests keep the last successful results and allow retry. Aborted/stale
requests cannot replace newer results or detail.

## Backend and security boundary

V2 uses only `/plugins/{slug}/api/ui-query/` and, when detail is enabled,
`/plugins/{slug}/api/ui-detail/{detail_id}/`. Django explicitly maps authorized
plugin operations to existing authenticated views. Descriptor endpoint strings
must match these exact shapes; the browser never receives upstream URLs or
constructs upstream queries. Authentication, IAM, CSRF, credentials, scientific
validation, normalization, auditing and detail authorization remain server-side.

Forbidden metadata includes callbacks, JSX, JavaScript, eval/functions, raw
HTML, modules/imports, script URLs, arbitrary API URLs, filesystem paths and
credentials. Unknown properties anywhere in v2 fail closed. Display strings
may contain HTML-looking text but are always escaped. Component identifiers
are exactly `file`, `text`, `textarea`, `select`, `number`, `table`, `pagination`;
field dispatch separately excludes result components. Renderer identifiers
remain `query`, `informational`, `async_analysis`, plus the existing
`generic_runner` alias. ServiceViewer remains the controlled fallback.

## Proofs and maintained compatibility

Ensembl proves bounded symbol search with text/integer fields and a scalar table.
It has no page navigation or detail in this batch. RCSB PDB proves float input,
scalar table/detail and real page navigation, including its backend page cap.
IntAct is held for status/provenance composition; dbSNP is held for multi-section
variant presentation. No other plugins migrate.

Workbench's `scripts/export_workbench_ui_compatibility.py` generates descriptors
and classification from enabled registry state. The Studio catalog contract test
consumes this output with `WORKBENCH_SOURCE` and `PYTHON`, validating all existing
native descriptors, both proofs, and every controlled legacy fallback. This is
a generated/test-backed artifact, not a hand-maintained plugin spreadsheet.

## Design and verification

Controls reuse Studio colors, fonts, radii, focus treatment, field rhythm,
`omni-btn`, `omni-table`, and existing panels. The repository has no general
spacing token scale, so the established spacing rhythm is retained. Both themes
use the same token system. Read-only/disabled controls remain identifiable;
scientific descriptions wrap; table values remain available at narrow widths.

Focused tests cover fields, registry, schema, table, pagination, query lifecycle,
fail-closed behavior and backend/frontend catalog agreement. Run from Studio:

```sh
npm run test:ui
npm --prefix packages/omnibioai-ui test
npm run web:build
npm run build:ui
node tests/workbench-components-browser.mjs
git diff --check
```

The cross-repository test is skipped unless the backend path is supplied. To
run it against an isolated checkout with a Django-capable Python environment:

```sh
WORKBENCH_SOURCE=/path/to/isolated/workbench PYTHON=/path/to/python npm run test:ui
```

No root lint or application-JSX typecheck script currently exists. Package
TypeScript checks do not typecheck the Workbench JSX. Browser verification uses
real components/styles, fixture responses and blocked external traffic. It does
not claim a live upstream scientific run or packaged Electron verification.
