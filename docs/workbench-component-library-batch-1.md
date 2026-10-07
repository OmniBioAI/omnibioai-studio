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
are exactly `file`, `text`, `textarea`, `select`, `number`, `table`,
`pagination`, `key_value`, `detail`, `filters`, `reference`;
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

## Batch 2: declared scalar detail and finite filters

Batch 2 keeps schema v2 and adds optional strict `detail` and `filters` objects.
Descriptors without them remain valid. RCSB PDB is the production proof;
Ensembl remains unchanged. IntAct and dbSNP remain legacy because scalar detail
cannot preserve their nested, multi-section scientific results.

```json
{
  "filters": {"component":"filters","title":"Filters","field_ids":["organism","max_resolution"]},
  "detail": {"component":"detail","title":"Structure detail","fields":[
    {"key":"pdb_id","label":"PDB ID"},
    {"key":"resolution_angstrom","label":"Resolution (Å)"}
  ]}
}
```

Filter IDs are unique references to existing optional inputs. They cannot name
every input, introduce operators, repeat field definitions, or carry query
expressions. Reset restores only referenced fields to declared defaults and does
not submit. Detail fields are unique flat keys and labels. The authorized
response may contain only those keys; values are strings, finite numbers,
booleans, null, or missing. Arrays, objects, arbitrary paths, formatters, URLs,
HTML and callbacks fail closed.

### KeyValueResult

- **Purpose / when to use:** ordered labeled scalar identity, measurements,
  counts, dates, flags and long scientific descriptions.
- **When not to use:** nested records, arrays, JSON inspection, links or tables.
- **Descriptor contract:** registry identifier `key_value`; fields come from
  validated `detail.fields`, not dynamic component metadata.
- **Required runtime properties:** `fields`, `record`.
- **Optional runtime properties:** `emptyMessage`.
- **Allowed values:** string, finite number, boolean, null/missing.
- **Backend responsibilities:** project declared fields and serialize identifiers
  exceeding JavaScript precision as strings.
- **Security boundary:** escaped text only; no recursion, HTML or formatters.
- **Accessibility:** semantic `dl`/`dt`/`dd`; empty data is a status message.
- **Error behavior:** malformed fields or structured values render an alert.
- **Real example / response:** RCSB detail; `{"pdb_id":"4HHB","resolution_angstrom":1.74}`.

### DetailPanel

- **Purpose / when to use:** loading, error, empty and success states for one
  fixed authorized scalar detail operation; it composes KeyValueResult.
- **When not to use:** fetching, automatic object inspection, reports or mutations.
- **Descriptor contract:** required `component: "detail"`, nonempty `title`, and
  nonempty `fields: [{key,label}]`; no optional descriptor properties.
- **Runtime contract:** trusted `record`, `loading`, `error`, `headingRef`.
- **Backend responsibilities:** auth, detail-ID validation, upstream access and projection.
- **Security boundary:** exact response keys and scalar values; extras fail closed.
- **Accessibility:** labeled busy region, live status/error and focused heading.
- **Error behavior:** detail errors do not remove existing result rows.
- **Real example:** RCSB PDB structure detail.

### FilterControls

- **Purpose / when to use:** group secondary optional `text`, `select`, or
  `number` criteria already in `inputs`.
- **When not to use:** query builders, arbitrary operators, expressions, URLs or paths.
- **Descriptor contract:** required `component: "filters"`, nonempty `title`, and
  unique nonempty `field_ids`; no optional descriptor properties.
- **Runtime contract:** trusted field children, disabled state and reset event.
- **Backend responsibilities:** allowed fields/operators, normalization,
  scientific validation, query construction and authorization.
- **Security boundary:** it constructs no request; QueryRenderer retains the fixed adapter.
- **Accessibility:** native fieldset/legend, disabled semantics and focus-visible reset.
- **Error behavior:** unknown IDs/components/properties invalidate the descriptor.
- **Real examples:** RCSB organism/resolution; reuse evidence exists in ClinVar,
  ArrayExpress, BioStudies and Reactome optional criteria.

### MetadataPanel decision

No MetadataPanel was added. Scalar contextual metadata is already covered by
DetailPanel plus KeyValueResult. IntAct/dbSNP provenance is nested or
semantically distinct and must wait for an evidence-backed section/provenance
contract rather than receive a duplicate scalar panel or automatic JSON view.

See `docs/creating-workbench-plugin-ui.md` for the implemented query workflow.

## Batch 3: finite structured detail sections

### Evidence and boundary

IntAct, dbSNP, RCSB PDB, ClinVar and Reactome demonstrate repeated scalar
identity, bounded child-table and provenance sections. They do not justify an
arbitrary component tree. DetailPanel therefore accepts exactly one ordered
section level and composes existing KeyValueResult and ResultsTable primitives.
No new registry component is required.

RCSB PDB proves the production contract with structure identity, optional
primary citation, a bounded citation-author table and provenance. IntAct remains
held for POST interaction semantics and complete participant/evidence sections.
dbSNP remains held pending complete backend projection and safe server-authorized
cross-reference navigation.

### DetailPanel section contract

**Purpose / when to use:** one authorized selected entity whose backend can
project an ordered finite set of scalar, bounded child-table and provenance
sections. **Do not use** it for recursive JSON, arbitrary nesting, trees, links,
mutations, dashboards or frontend scientific interpretation.

```json
{
  "component": "detail",
  "title": "Structure detail",
  "sections": [
    {
      "id": "identity", "title": "Structure identity", "presentation": "scalar",
      "fields": [{"key": "pdb_id", "label": "PDB ID"}]
    },
    {
      "id": "citation_authors", "title": "Primary citation authors",
      "presentation": "table", "optional": true,
      "row_key": "position", "max_rows": 100,
      "columns": [{"key": "position", "label": "Order"}, {"key": "author", "label": "Author"}]
    },
    {
      "id": "provenance", "title": "Provenance", "presentation": "provenance",
      "fields": [{"key": "source", "label": "Source database"}]
    }
  ]
}
```

Required section properties are `id`, `title`, `presentation`, plus `fields`
for `scalar`/`provenance` or `columns`, `row_key`, `max_rows` for `table`.
`optional` is the only optional property. IDs and keys use the established safe
identifier grammar. Presentations are exactly `scalar`, `table`, `provenance`.
Table bounds are safe integers from 1 through 500; the row key must be a declared
flat column. Duplicate IDs/keys, paths, unknown properties and mixed `fields`
plus `sections` fail closed.

Runtime data is keyed by section ID. Required sections must exist; optional
sections may be absent. Scalar/provenance records contain only declared string,
finite-number, boolean or null values. Table rows contain only declared scalar
columns, remain within `max_rows`, and have unique stable row identities.

```json
{
  "identity": {"pdb_id": "4HHB"},
  "citation_authors": [{"position": 1, "author": "A. Researcher"}],
  "provenance": {"source": "RCSB Protein Data Bank"}
}
```

Django authenticates, authorizes, validates the detail ID, performs upstream
access, projects each section and enforces bounds. React validates and presents
that projection. Objects in scalar cells, arbitrary response sections, excess
rows, URLs, HTML, callbacks, component names, formatters and recursive sections
are rejected. Text is escaped.

DetailPanel provides a labeled busy region, focused detail heading, logical
section headings and live loading/error/empty messages. Child tables retain
captions and keyboard-focusable overflow regions. Scalar grids reflow to one
column on narrow screens; meaningful scientific values wrap without truncation.
Malformed section data renders a controlled alert. Missing optional sections are
omitted; declared empty tables retain ResultsTable's empty state.

Real evidence: RCSB PDB structure/citation/provenance, dbSNP variant sections,
IntAct interaction evidence and ClinVar condition rows. Tests live in
`tests/ui/workbench-structured-detail.test.jsx`, `tests/ui/query-batch.test.jsx`
and Workbench `plugins/shared/tests/test_query_ui.py`.

### Current component reference

| Component | Registry ID | Status | Use |
| --- | --- | --- | --- |
| TextField | `text` | PRODUCTION | Single-line text |
| TextAreaField | `textarea` | PRODUCTION | Multiline plain text |
| NumberField | `number` | PRODUCTION | Integer/float entry |
| SelectField | `select` | PRODUCTION | Finite backend-declared choices |
| FileUploadField | `file` | PRODUCTION | Existing file input contract |
| ResultsTable | `table` | PRODUCTION | Declared scalar tables, including child tables |
| PaginationControls | `pagination` | PRODUCTION | One-based backend pagination |
| KeyValueResult | `key_value` | PRODUCTION | Declared labeled scalars |
| DetailPanel | `detail` | PRODUCTION | Flat or finite section detail |
| FilterControls | `filters` | PRODUCTION | Existing optional query fields |
| TextareaField | — | COMPATIBILITY_ALIAS | Export alias for TextAreaField |
| RunStatus | — | PRODUCTION | Existing asynchronous run state |
| LogViewer | — | PRODUCTION | Existing run logs |
| PluginResults | — | PRODUCTION | Finite asynchronous artifact, image-gallery and static-PNG result composition |
| StaticPngResult | — | PRODUCTION | Existing static PNG result |
| MetadataPanel | — | PLANNED_NOT_AVAILABLE | Not distinct from scalar sections |
| ScientificReference | `reference` | PRODUCTION | Server-authorized scientific cross-reference navigation |
| ArtifactList | `artifact_list` | PRODUCTION | Bounded metadata for caller-owned run artifacts |
| ArtifactDownload | `artifact_download` | PRODUCTION | Fixed same-origin download by opaque artifact ID |
| CheckboxField | `checkbox` | PRODUCTION | Deterministic true/false input using a native checkbox |
| MultiSelectField | `multiselect` | PRODUCTION | Multiple selections from at most 50 descriptor-owned choices |
| ResourceSelectField | `resource_select` | PRODUCTION | Single selection from the caller's own completed prior runs, discovered server-side |
| ImageGallery | `image_gallery` | PRODUCTION | Inline collection of a run's own server-authorized plot images |
| Arbitrary hyperlink | — | INTENTIONALLY_UNSUPPORTED | Descriptors/runtime data never carry destinations |
| Structured recursive JSON viewer | — | PLANNED_NOT_AVAILABLE | Intentionally unsupported |
| ReportResult | — | INTENTIONALLY_UNSUPPORTED | ArtifactList/ArtifactDownload already cover every audited report/document case |
| SequenceResult / TextResult | — | PLANNED_NOT_AVAILABLE | No repeated RESULT-side (as opposed to input-side) evidence found yet |
| StructuredResult (generic) | — | INTENTIONALLY_UNSUPPORTED | Compose KeyValueResult/ResultsTable/DetailPanel instead; see Batch 8 |

## Batch 4: server-authorized scientific references

### Evidence and component boundary

RCSB PDB primary citations contain DOI and PubMed identifiers. IntAct also
contains PubMed publications. dbSNP exposes bounded ClinVar, NCBI Gene and
RefSeq cross-references, while ClinVar and UniProt demonstrate the same broader
catalog need. Existing scalar values cannot be anchors without making
KeyValueResult or ResultsTable destination-aware. Batch 4 therefore adds one
small navigation primitive, `ScientificReference` (`reference`), composed only
by the finite `references` detail section. It does not add arbitrary links,
cell renderers, downloads or actions.

### ScientificReference

- **Purpose / when to use:** navigate from a validated scientific identifier to
  its authoritative external record through Django's fixed redirect policy.
- **When not to use:** arbitrary web links, downloads, artifacts, internal
  routes, user-supplied URLs, signed URLs or server actions.
- **Trusted React props:** `pluginSlug`, `referenceType`, `identifier`. These are
  supplied by QueryRenderer and a validated backend response, not arbitrary
  descriptor component props.
- **Runtime contract:** exactly
  `{"reference_type":"pubmed","identifier":"6726807"}`. No other key is
  allowed. Identifiers are strings, retain their full scientific precision and
  must pass the type-specific grammar.
- **Backend responsibility:** authenticate; enforce plugin/type scope; validate
  the identifier; select the fixed HTTPS scheme, host and path policy; return a
  redirect with `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and
  `X-Content-Type-Options: nosniff`.
- **Security boundary:** React constructs only the fixed same-origin operation
  `/plugins/{slug}/api/ui-reference/{reference_type}/?identifier=...`. Neither
  descriptors nor response records contain `href`, URL, host, scheme, template,
  callback or destination. Unknown types and malformed identifiers render inert
  or fail closed. Django never accepts a `next`, redirect or destination input.
- **Accessibility:** a semantic anchor has a contextual name including the
  resource and full identifier, a visible focus ring and a non-color external
  resource mark. It uses the current browsing context; no casual
  `target="_blank"` behavior is introduced.
- **Responsive behavior:** the complete identifier wraps at narrow widths and
  is never ellipsized. The component uses existing theme/focus/type tokens.
- **Error behavior:** invalid or unavailable data is inert text with
  `aria-disabled`; a malformed authoritative response rejects the complete
  detail payload before rendering.
- **Real plugin evidence:** RCSB DOI/PubMed is the production proof. dbSNP
  ClinVar/Gene/RefSeq establishes registry reuse but remains legacy because its
  complete multi-operation projection is outside this batch.
- **Tests:** Studio `tests/ui/workbench-scientific-reference.test.jsx`; Workbench
  `plugins/shared/tests/test_scientific_references.py` and `test_query_ui.py`.

### Descriptor and response contract

Query-v2 adds one optional section presentation; no schema version changes.

```json
{
  "id": "primary_references",
  "title": "Primary citation references",
  "presentation": "references",
  "optional": true,
  "reference_types": ["doi", "pubmed"],
  "max_items": 2
}
```

Required keys are `id`, `title`, `presentation`, `reference_types`, and
`max_items`; `optional` is the sole optional key. Types are unique identifiers
from the frontend/backend allowlist. Bounds are integers from 1 through 100.
Unknown keys, duplicate types, unknown types and destination metadata fail
closed. Runtime data is a bounded array of unique exact reference records:

```json
{
  "primary_references": [
    {"reference_type": "doi", "identifier": "10.1016/0022-2836(84)90472-8"},
    {"reference_type": "pubmed", "identifier": "6726807"}
  ]
}
```

The production registry contains only evidence-backed `doi`, `pubmed`,
`clinvar`, `ncbi_gene`, and `refseq` policies. Each owns its validation grammar,
label, HTTPS host and path resolver on the server. DOI suffix slashes are
percent-encoded as identity data. RefSeq selects the fixed NCBI nucleotide or
protein collection from its validated accession prefix. This registry is not a
generic redirect service or arbitrary proxy.

**Open-redirect defense:** absolute/protocol-relative URLs, schemes, encoded
schemes/slashes, query or fragment injection, CR/LF, backslashes, traversal,
Unicode slash lookalikes, overlong values, duplicate query parameters and
destination-like query keys are rejected. The redirect `Location` can only be
created by a registry policy and is verified again for exact HTTPS host, no
userinfo and no port. **Do not put URLs in plugin UI descriptors.**

## Batch 5: opaque server-authorized artifacts

### Evidence and component boundary

The shared async family, including DESeq2 and the static-plot population,
publishes RunStore manifests containing relative paths. Previous Studio code
rendered those paths and constructed `?path=` downloads. Report-producing
plugins such as omics QC, ChIP-seq reporting, metabolomics reporting and Scanpy
QC show the same reusable file/table/plot/report metadata pattern.

Batch 5 adds `ArtifactList` (`artifact_list`) and `ArtifactDownload`
(`artifact_download`). A list is justified because artifact metadata must
reflow at narrow widths and compose a semantic download anchor; ResultsTable
remains scalar-only and receives no arbitrary cell renderer. The download
primitive owns only presentation of an already validated opaque identity.
`PluginResults` composes both components. StaticPngResult remains the specialized
inline PNG viewer and coexists with the downloadable artifact list.

### ArtifactList and ArtifactDownload contract

- **Purpose / when to use:** present a bounded list of completed, caller-owned
  RunStore outputs and download one through the authenticated Workbench route.
- **When not to use:** directory browsing, upload, deletion, rename, inline
  HTML/report execution, object-store navigation, arbitrary paths or URLs.
- **Artifact identity:** `art_` followed by 43 base64url characters. Django
  derives the ID with a keyed digest over plugin, run and manifest position.
  It reveals no path, bucket, object key, tenant directory or storage URL.
- **Descriptor contract:** exact
  `{"presentation":"list","max_items":100}` under `artifacts`. The bound is
  an integer from 1 through 100. The fixed download endpoint is
  `/plugins/{slug}/api/ui-artifacts/{run_id}/{artifact_id}/download/`.
- **Runtime contract:** exact `{"artifacts":[...]}`. Each item has
  `artifact_id`, `display_name`, `label`, `media_type`, `size_bytes`, and
  `kind`. Kinds are `archive`, `file`, `log`, `plot`, `report`, or `table`.
  Names are bounded path-free strings, sizes are non-negative safe integers,
  and media types are server-derived. Unknown properties reject the payload.
- **Backend authority and ownership:** authenticate, check RunStore
  `owner_user_id`, resolve the ID against the plugin/run manifest, resolve the
  path below the run output root, reject symlink escape, derive filename/type/
  size and return an attachment. Wrong-owner, wrong-run, wrong-plugin, guessed
  and missing IDs receive the same not-found response. Ownerless runs fail closed.
- **Containment:** IDs are never interpreted as paths. Server-only manifest
  paths must resolve below the authoritative run output directory.
- **Filename/content-type safety:** Django derives the leaf name, strips control
  characters and separators, delegates Content-Disposition quoting to
  FileResponse, derives media type from the safe filename and forces every
  artifact—including HTML—to `attachment` with `nosniff` and `no-store`.
- **Accessibility:** a semantic list contains full labels, filenames and
  textual kind/type/size metadata. Downloads are anchors with filename-specific
  accessible names and visible token-based focus. Empty, loading and error
  states use status/alert semantics.
- **Responsive behavior:** meaningful filenames wrap rather than ellipsize;
  metadata wraps and the download affordance stacks at narrow widths.
- **Error behavior:** invalid runtime metadata rejects the response; invalid
  primitive identity becomes an inert “Download unavailable” state.
- **Real evidence:** DESeq2 is the async proof and volcano plot verifies
  coexistence with StaticPngResult. Reuse evidence includes omics QC reports,
  ChIP-seq reports, metabolomics reports, anomaly detection and Scanpy QC.
- **Tests:** Studio `tests/ui/workbench-artifacts.test.jsx` and
  `tests/ui/async-analysis-renderer.test.jsx`; Workbench
  `plugins/shared/tests/test_artifact_ui.py` and `test_plugin_ui_schema.py`.

Example descriptor fragment:

```json
{
  "artifacts":{"presentation":"list","max_items":100},
  "endpoints":{
    "artifacts":"/plugins/deseq2_analysis/api/artifacts/{run_id}/",
    "download":"/plugins/deseq2_analysis/api/ui-artifacts/{run_id}/{artifact_id}/download/"
  }
}
```

Example response:

```json
{"artifacts":[{
  "artifact_id":"art_NzvP2cW7E0eCG_WoahB1FcWtt0Rdj1N27Z2u2d64FcA",
  "display_name":"sample_condition_differential_expression_results.tsv",
  "label":"Differential expression results",
  "media_type":"text/tab-separated-values",
  "size_bytes":18422,
  "kind":"table"
}]}
```

**DO NOT PUT FILESYSTEM PATHS OR DOWNLOAD URLS IN UI DESCRIPTORS.** Runtime
artifact records likewise never contain paths, storage keys, buckets, signed
URLs, credentials or arbitrary endpoints.

## Batch 6: finite boolean and multiple-choice fields

### CheckboxField (`checkbox`)

- **Purpose / when to use:** one genuine two-state scientific or execution
  option, such as enabling an analysis step or including a result class.
- **When not to use:** tri-state values, consent/mutation actions, conditional
  expression engines, or string/numeric encodings of booleans.
- **Descriptor contract:** `widget` is `checkbox`, `format` is `boolean`,
  `multiple` is `false`, and `default` is a real JSON boolean. The normal
  `id`, `label`, `description`, and `required` properties apply.
- **Value/default contract:** React state is always `true` or `false`; an
  omitted default is normalized by Django to `false`. There is no indeterminate
  state. Required means the value must be true.
- **Submission:** Studio always appends exact `true` or `false` text to
  `param_<field_id>`, including unchecked controls. Django accepts only those
  spellings and normalizes to a Python boolean.
- **Backend responsibility:** independently enforce type, requiredness,
  defaults, and scientific validity before execution.
- **Accessibility/error behavior:** native checkbox, associated label/help/
  error, keyboard Space behavior, visible token-based focus, and native
  disabled/required semantics.
- **Evidence:** toxicity prediction switches, spatial H5AD export, single-cell
  stages, GWAS/popgen steps, and marker-analysis switches.
- **Tests:** Studio `tests/ui/workbench-choice-fields.test.jsx`; Workbench
  `plugins/shared/tests/test_input_components.py`.

```json
{"id":"include_intronic","widget":"checkbox","format":"boolean",
 "label":"Include intronic variants","description":"Include intronic consequences.",
 "required":false,"multiple":false,"default":false}
```

### MultiSelectField (`multiselect`)

- **Purpose / when to use:** select zero or more values from a small, immutable
  descriptor-owned scientific vocabulary.
- **When not to use:** datasets, artifacts, saved objects, conditions loaded
  from data, remote search, free-text tags, or option creation. **DO NOT USE
  MULTISELECT FOR SERVER-BACKED RESOURCE DISCOVERY.**
- **Finite choice contract:** 1–50 exact `{value,label}` objects. Values are
  unique bounded safe scalar tokens; labels are bounded inert text.
- **Value/default contract:** a duplicate-free string array whose members are
  declared values. Defaults must be a subset. Descriptors define display and
  normalized submission order regardless of user selection order.
- **Required semantics:** at least one selection; optional fields may submit an
  empty array.
- **Submission:** Studio sends one JSON string array in `param_<field_id>` so
  empty selection differs from omission. Django accepts only a flat string
  array, rejects objects/unknowns/duplicates, and returns a normalized Python
  list. This is transport encoding, not a generic JSON input contract.
- **Accessibility/error behavior:** labeled native `select multiple`, help and
  error association, native keyboard operation and visible focus. Long labels
  wrap rather than ellipsize.
- **Evidence:** fixed GO/Reactome/GSEA methods in pathway enrichment and three
  fixed anomaly-detection algorithms. Proteomics conditions/states and ChIP-seq
  objects are excluded because their choices are server-derived.
- **Tests:** Studio `tests/ui/workbench-choice-fields.test.jsx`; Workbench
  `plugins/shared/tests/test_input_components.py`.

```json
{"id":"enrichment_types","widget":"multiselect","format":"text",
 "label":"Methods","description":"Select one or more enrichment methods.",
 "required":true,"multiple":true,
 "choices":[{"value":"go","label":"GO (Gene Ontology)"},
            {"value":"reactome","label":"Reactome"},
            {"value":"gsea","label":"GSEA"}],
 "default":["go"]}
```

## Batch 7: server-authorized resource selection using opaque resource identities

### Evidence and component boundary

Audited `plugins/bio_agent` (a legacy, non-native page that already lists a
caller's own runs via `owned_run_ids`/`_load_omniobjects_for_select`),
`plugins/multiqc_wrapper` (an `io_contract.consumes` field,
`source_run: {plugin, run_id}`, that lets one QC report reference an existing
RunStore run — but whose own `resolve_source_run_dir` performs no ownership
check, a pre-existing gap out of this batch's scope to fix), and
`plugins/pdf_report_builder` (a `report_id`/32-capability dispatch plugin,
far larger than one selector field). Only one resource family in this
codebase has an evidence-backed, uniformly-enforced per-user ownership
boundary and an existing cross-plugin precedent: a caller's own **RunStore
runs**, via `owner_user_id` + `plugins.shared.run_authz`. Dataset/registered-
object families were not adopted into this contract; they do not share this
run's exact ownership/state shape and would need their own narrow evidence
pass.

One shared component, not two: `ResourceSelectField` (`resource_select`)
supersedes both placeholder names this document previously reserved
(`ServerSelect`, `ResourceSelector`). A single server-owned resource family
(prior completed runs) needs exactly one narrowly-typed selector; inventing a
second generic component for the same shape would be a duplicate, not a
distinct architectural case.

### ResourceSelectField (`resource_select`)

- **Purpose / when to use:** let a caller pick one of their own prior
  **completed** runs (of a server-declared source plugin or plugins) as input
  to a new run — e.g. "use the output of an earlier QC run."
- **When not to use:** finite descriptor-owned choices (`select`/
  `multiselect`), arbitrary remote/API search, datasets or registered objects
  (no evidence-backed ownership contract yet), multiple-resource selection (no
  evidence found), or any field needing a client-chosen upstream/source.
- **Resource identity:** RunStore's own existing opaque run id
  (`uuid4().hex`, assigned server-side at `RunStore.create_run`) — not a new
  identity system. It carries no path, bucket, or storage detail.
- **Discovery contract:** `GET /plugins/<slug>/api/ui-resources/<resource_type>/`
  (same `plugins/<slug>/api/ui-*` family as `ui-query`/`ui-reference`/
  `ui-artifacts`). `resource_type` is presently only `"run"`. No query
  parameters are accepted. The *source* plugin(s) searched are never a URL
  segment or client input — only `plugins.shared.resource_ui
  .PLUGIN_RESOURCE_SOURCES`, keyed by the **rendering** plugin slug, decides
  that, exactly like `PLUGIN_REFERENCE_TYPES` already does for scientific
  references. A plugin's own manifest cannot grant itself a new source.
- **Response contract:** `{"results": [{"id", "label", "source_plugin"}, …]}`,
  bounded to 100, newest-first. `label` is server-derived from the run's own
  `created_at` and the source plugin's name — never a client-supplied value,
  since no caller-authored run label exists yet. No path, params, or other
  run.json content is ever serialized.
- **Descriptor contract:** `widget` is `resource_select`, `format` is `text`,
  `multiple` is always `false`, plus `resource_type` (`"run"`) and a
  server-computed `endpoint`. No `choices`, `default`, `accept`, or
  `placeholder` key is accepted. A field is dropped from the descriptor
  entirely (fails closed, same convention as every other malformed v1 field)
  if its rendering plugin has no `PLUGIN_RESOURCE_SOURCES` entry.
- **Selection semantics:** single selection only; the submitted value is the
  opaque id string, in `param_<field_id>`, identical to a `text` field.
- **Submission reauthorization:** discovery never authorizes execution.
  `_input_payload`'s `resource_select` branch calls
  `resource_owned_by_user(user_id=request.user.id, source_plugins=…,
  resource_id=…)`, which independently re-resolves RunStore ownership and
  requires `state == "COMPLETED"` — exactly as if the id had never been seen
  before. A value that was legitimately listed in discovery, then becomes
  unowned/incomplete/deleted before submission, is rejected the same as one
  that was never listed.
- **UI states:** loading (native `<select aria-busy>` plus an `aria-live`
  status line), loaded, empty (`role="status"`, disabled control), error
  (`role="alert"` with a Retry button that re-fetches), selected, disabled,
  required, invalid, and read-only — reusing `FieldShell` and the existing
  `.studio-field`/`.plugin-field-control` tokens; no new visual system.
- **Accessibility:** native `<select>`, the same label/description/error
  association every field gets from `FieldShell`, full keyboard operation,
  visible focus, and a disabled first "Select…" option so nothing is ever
  silently preselected.
- **Security boundary:** `CAN_RESOURCE_ID_BYPASS_OWNERSHIP=NO`,
  `CAN_RESOURCE_ID_CROSS_PLUGIN_SCOPE=NO`,
  `CAN_RESOURCE_ID_CROSS_RESOURCE_TYPE=NO` (only `"run"` exists),
  `CAN_CLIENT_SELECT_UNDISCOVERABLE_RESOURCE=NO` (reauthorization is
  independent of discovery) — see the IDOR test matrix below.
- **Evidence:** no production plugin is wired in yet
  (`PLUGIN_RESOURCE_SOURCES` is empty in production); the contract is proven
  by its own backend/frontend test suites so a future plugin can adopt it
  without re-deriving the security model.
- **Tests:** Workbench `plugins/shared/tests/test_resource_ui.py` (discovery
  view + IDOR matrix) and `plugins/shared/tests/test_resource_select_field.py`
  (descriptor + submission reauthorization); Studio
  `tests/ui/workbench-resource-select.test.jsx`.

```json
{"id":"source_run_id","widget":"resource_select","format":"text",
 "label":"Source run","description":"A prior completed run to use as input.",
 "required":true,"multiple":false,"resource_type":"run",
 "endpoint":"/plugins/report_builder/api/ui-resources/run/"}
```

### DO NOT PUT RESOURCE URLS, STORAGE PATHS, OR AUTHORIZATION DATA IN UI DESCRIPTORS.

### DISCOVERY DOES NOT AUTHORIZE EXECUTION; THE BACKEND REAUTHORIZES THE SELECTED RESOURCE.

## Batch 8: shared result presentation — ImageGallery

### Evidence and component boundary

Audited the four candidate result families named in the issue: report/document,
sequence/text, structured JSON-like, and multi-image.

**Report/document** — every report-producing plugin sampled (`pdf_report_builder`,
`omics_qc_report_generator`, `chipseq_report_generator`, `clinical_report_generator`,
`rnaseq_report`, `proteomics_report`, `metabolomics_report`, `atac_report`,
`splicing_report`, `longread_report`, plus `spatial_report_generation`,
`drug_report_generator`, `microbiome_report`, `epigenomics_report`,
`single_cell_annotation`, `bio_narrator_ai`) reduces to exactly one opaque HTML,
PDF, or Markdown artifact, already correctly typed `"report"`/`"file"` in its
RunStore manifest. The existing `ArtifactList`/`ArtifactDownload` contract
(Batch 5) already covers every case; its own documentation already cites
"omics QC, ChIP-seq reporting, metabolomics reporting and Scanpy QC" as
reuse evidence. **No `ReportResult` component was built.** One real,
pre-existing issue was found and is explicitly *not* fixed here, as it sits
entirely in a legacy Django template outside the native registry:
`metabolomics_report/templates/metabolomics_report/run_detail.html` builds an
unescaped `innerHTML` string from a manifest `label` and embeds report HTML in
an un-sandboxed `<iframe>`. This is a legacy-template risk, not a native
descriptor/React registry risk, and fixing arbitrary legacy Django templates
is out of Batch 8's scope (shared result presentation for the native
registry). Flagged for a future, explicitly-scoped legacy-template hardening
pass.

**Structured JSON-like results** — the one shape that genuinely repeats (a flat
scalar `"summary"` dict, e.g. `{"n_genes":…, "n_samples":…}`) appears in the
manifest of essentially every plugin built from the shared Docker-tool-runner
boilerplate (`assembly_qc`, `deseq2_analysis`, `gsea_enrichment`, and 30+
other `NATIVE_GENERIC_RUNNER_PILOTS`, all with the identical
`outputs = extra.get("outputs", []); summary = extra.get("summary", {})`
pattern). This shape is architecturally a perfect match for the *existing*
`KeyValueResult` — no new component would be needed, only a per-plugin field
allowlist analogous to `STATIC_PNG_RESULT_METADATA`. **This was deliberately
not implemented**, because the actual `summary` keys are produced by
Docker images whose source is not present in this repository, and no
plugin here documents or tests its real summary schema (e.g.
`assembly_qc/tests/test_executor.py` only ever asserts against `"summary": {}`
— an empty dict). Declaring a field allowlist without verified ground truth
would either silently no-op or encode a wrong contract. Any other structured
shape found (`clinical_report_generator`'s report-content JSON, `environment_manager`'s
dict-of-scalars/dict-of-lists, `gene_annotation`'s one-off nested tab clusters)
either isn't a Workbench *result* at all, already maps onto
`KeyValueResult`/`ResultsTable`/`DetailPanel`, or doesn't repeat elsewhere. **No
new `StructuredResult` component was built; composition of existing
components remains the correct answer.**

**Sequence/text results** — across every `plugin.json` and executor/script in
the repository, exactly **one** plugin (`msa_conservation_viewer`) produces a
standalone short sequence-like text result (`consensus_sequence.fasta`), and
it is already mistyped as artifact kind `"table"` only because no better
`_KINDS` value exists. Every other FASTA/text-adjacent case found is either an
*input*, or sequence data already living as an ordinary column inside a table
artifact. One plugin out of roughly 529 does not meet the "repeated real
behavior" bar this audit is testing for. **No new `SequenceResult`/`TextResult`
component was built.**

**Multi-image** — genuinely repeated, with real evidence across at least a
dozen plugins: `proteomics` (legacy `runner.py` path — a *dynamic, unbounded*
count: one heatmap plus one volcano plot per differential comparison, already
hand-rendered as a 2-column image grid in `proteomics/templates/proteomics/results.html`),
`cell_comm_visualization` and `chipseq_signal_plots` (3 distinctly-labeled
plots each, written through the standard `RunStore.write_artifacts` manifest
with real `"label"` values), and a long tail of 2-plot plugins
(`scanpy_qc_metrics`, `restriction_digest`, `orf_finder`, `circrna_plotter`,
`rnaseq_analysis`, `venn_upset_plot`, `ml_eval_plots`, `manhattan_qq_plot`,
`chromatin_accessibility`, `qc_plots`). `StaticPngResult`'s single-fixed-PNG
model (Batch 1) cannot represent any of these. **`ImageGallery` (`image_gallery`)
was built** — the one component Batch 8 adds.

One component, not four: only the multi-image case had a real, repeated,
safely-representable gap. The other three families are either already fully
covered by existing components, or lack verifiable evidence to build against
safely.

### ImageGallery (`image_gallery`)

- **Purpose / when to use:** show a run's own multiple plot images inline,
  together, instead of as plain download links only — e.g. multiple QC plots,
  per-comparison volcano plots, or a cell-communication figure set.
- **When not to use:** a single primary plot (`StaticPngResult` already covers
  exactly that case and is unchanged by this batch), non-image artifacts,
  report/document viewing, or any case needing interactive zoom/lightbox/
  annotation (no evidence found for any of that).
- **Resource identity:** none — new. `ImageGallery` introduces **no new
  identity, endpoint, descriptor field, or backend code at all**. It is a pure
  frontend composition over the artifact list Batch 5 already established:
  it filters the same validated `artifacts` array (already fetched and
  validated by `AsyncAnalysisRenderer`/`PluginResults` via
  `validateArtifactPayload`) to items where `kind === "plot"` and
  `media_type` starts with `image/`, and renders each via the existing,
  already-authorized `GET /plugins/{slug}/api/ui-artifacts/{run_id}/{artifact_id}/download/`
  endpoint as an `<img src>`. `Content-Disposition: attachment` on that
  response does not prevent a browser from rendering it as an `<img>` (it only
  affects top-level navigation), so no backend change was needed to reuse it
  this way.
- **Descriptor contract:** none. No `widget`, no `resource_type`, no new
  `capabilities`/`endpoints` key — a plugin needs zero descriptor changes to
  get a gallery; it appears automatically whenever its existing, unchanged
  artifacts response contains two or more qualifying items.
- **Response contract:** none beyond the existing, unchanged Batch 5
  `{"artifacts":[{"artifact_id","display_name","label","media_type","size_bytes","kind"}]}`
  contract. `ImageGallery` performs no additional network request of its own.
- **Backend responsibilities:** unchanged from Batch 5 — authenticate, check
  `owner_user_id`, resolve the opaque artifact ID against the manifest,
  contain the path under the run output root, derive media type, force
  `attachment`/`nosniff`/`no-store`. Nothing in this batch touches
  `plugins/shared/artifact_ui.py` or `plugins/shared/plugin_ui.py`.
- **Security boundary:** every image URL is the same opaque, server-derived,
  ownership-checked download URL Batch 5 already produces; the component
  never receives or constructs a path, bucket, signed URL, or arbitrary
  endpoint. A malformed/attacker-shaped `artifact_id` falls back to an inert
  "Image unavailable" state instead of ever constructing a broken `src`
  (mirrors `ArtifactDownload`'s existing fail-closed behavior exactly).
- **Loading/empty/error behavior:** `ImageGallery` renders nothing while
  `loading` or `error` are set (the sibling `ArtifactList` already
  communicates those states so nothing duplicates them), and renders nothing
  when zero qualifying images are present — a plugin with no plot artifacts
  is simply unaffected. Every image artifact remains independently listed and
  downloadable in `ArtifactList` regardless of also appearing in the gallery
  (same coexistence precedent as `StaticPngResult`).
- **Accessibility:** each image is a semantic `<figure>`/`<figcaption>` pair
  inside a labeled `<ul aria-label="Result images">`; `alt` is always the
  artifact's own non-empty `label`; every item still carries its existing,
  keyboard-reachable `ArtifactDownload` link. Images use `loading="lazy"` so a
  large (bounded-by-100) result set doesn't eagerly fetch every image.
- **Scientific-content behavior:** long captions wrap (`overflow-wrap: anywhere`,
  reusing the same rule already applied to artifact names); nothing is
  truncated.
- **Responsive/theme:** CSS grid `repeat(auto-fill, minmax(220px, 1fr))`
  collapses to a single column well before 320px; all colors/spacing reuse
  existing tokens (`--bg2`, `--bg3`, `--border2`, `--radius-sm`,
  `--font-size-sm`); no new visual system, no hard-coded colors.
- **Evidence:** `proteomics` (dynamic/unbounded per-comparison volcano plots),
  `cell_comm_visualization`, `chipseq_signal_plots`, `scanpy_qc_metrics`,
  `restriction_digest`, `orf_finder`, `circrna_plotter`, `rnaseq_analysis`,
  `venn_upset_plot`, `ml_eval_plots`, `manhattan_qq_plot`,
  `chromatin_accessibility`, `qc_plots`.
- **Known limitation:** none of the plugins above are wired into the native
  registry yet (see Proof plugins below) — all are currently legacy. The
  component is proven by its own test suite against synthetic descriptors,
  exactly as `ResourceSelectField` was in Batch 7.
- **Tests:** Studio `tests/ui/workbench-image-gallery.test.jsx`.

```json
{"artifacts":[
  {"artifact_id":"art_…A","display_name":"qc_violin.png","label":"QC Violin Plot","media_type":"image/png","size_bytes":20480,"kind":"plot"},
  {"artifact_id":"art_…B","display_name":"qc_scatter.png","label":"QC Scatter Plot","media_type":"image/png","size_bytes":18240,"kind":"plot"}
]}
```

### Proof plugins — all held, with a systemic finding

Five real multi-image-producing legacy plugins were evaluated as potential
native proof plugins: `cell_comm_visualization`, `chipseq_signal_plots`,
`scanpy_qc_metrics`, `rnaseq_analysis`, and `proteomics`. **All five were
held; `NEW_NATIVE=0`.**

A single systemic blocker was found and independently confirmed in four of
the five (`cell_comm_visualization`, `chipseq_signal_plots`,
`scanpy_qc_metrics`, `rnaseq_analysis`): each executor's `submit()` method
calls `RunStore.create_run(...)` a **second** time with
`meta={"cli": True, …}` — which carries no `owner_user_id`. Since
`RunStore.create_run()` fully replaces `run.json` on every call (see
`plugins/shared/run_authz.py`'s own documented reasoning for `merge_meta`),
this second call erases whatever `owner_user_id` the generic `_api_run` view
had already recorded from `request.user.id` before invoking the executor.
Under the Batch 5 fail-closed ownership policy, a run with no recorded
`owner_user_id` is denied to **everyone**, including its own creator — so
wiring any of these plugins through the standard native `_api_run` path as-is
would make every run immediately inaccessible to the very user who started
it. `proteomics`'s dynamic-count evidence lives in an entirely separate,
non-`StepInput` legacy `runner.py`/`views.py` architecture, a larger
migration than this batch's scope.

This is a pre-existing, widespread pattern across legacy "CLI executor"
plugins, unrelated to result presentation, and explicitly out of scope to fix
in a shared-result-presentation batch ("do not rewrite scientific executors
merely to force a proof plugin native"). It is reported here as a concrete,
evidence-backed finding for a future, explicitly-scoped batch.

### DO NOT BUILD A RESULT COMPONENT WITHOUT REPEATED, VERIFIABLE EVIDENCE OF ITS DATA SHAPE.

## Batch 9: architecture completeness audit and #708 closure evidence

This is the final planned #708 implementation batch. Its objective was not to
add components, but to audit Batches 1–8 against the issue's Definition of
Done and either close genuine gaps or explicitly document why a boundary is
correct as-is.

### Final component registry (`componentRegistry.jsx`) — 17 entries

`file`, `text`, `textarea`, `select`, `number`, `checkbox`, `multiselect`,
`resource_select`, `table`, `pagination`, `key_value`, `detail`, `filters`,
`reference`, `artifact_list`, `artifact_download`, `image_gallery`. Every
entry is a static top-of-file `import`; `resolveWorkbenchComponent` uses
`Object.prototype.hasOwnProperty.call` and returns `null` for anything else —
no `eval`, no global lookup, no dynamic module path. No gaps found; no
duplicate semantic component found.

### Final renderer registry (`rendererRegistry.jsx`) — 3 entries + 1 alias

`async_analysis` (plus the `generic_runner` compatibility alias),
`informational`, `query`. `resolveWorkbenchRenderer` fails closed to `null`
for any other string (`tests/ui/renderer-registry.test.js` already exercises
injection-shaped strings: `../../module`, `https://evil.example`,
`javascript:alert(1)`, `constructor`, `prototype`, `__proto__` — all
rejected). No new renderer was added or was found justified.

### Descriptor/engine completeness

`src/ui/pages/PluginPage.jsx` is the complete, already-correct engine:
`loadPluginDescriptor` → `validatePluginDescriptor` (schema version ∈ {1,2}
only; `rejectExecutableMetadata` recursively rejects `__proto__`,
`prototype`, `constructor`, `script`, `html`, `dangerouslySetInnerHTML`,
`callback`, `eval`, `function`, `module`, `import`, `credentials`,
`password`, `token`, `api_key`, `secret`, `upstream_url`, and more, on every
key at every depth) → `resolveWorkbenchRenderer` → one allowlisted renderer
component. A 404, a `PluginDescriptorError`, `native_supported: false`, or an
unresolvable renderer all fall back to the unchanged legacy `ServiceViewer`
iframe. A grep of the entire `src/ui` tree for `dangerouslySetInnerHTML`,
`eval(`, `new Function`, `Function(`, `srcDoc`, `javascript:`, and dynamic
`import(` found **zero** matches anywhere (the one string match is the guard
regex itself). The backend mirrors this: `grep` for `mark_safe`,
`format_html`, `|safe`, `eval(`, `exec(` across `plugins/shared/*.py` found
zero matches. `tests/ui/workbench-catalog-contracts.test.js`, run against
this exact worktree with `WORKBENCH_SOURCE`, independently validates **all
501 enabled plugin descriptors** (129 v1 native + 2 v2 native + 370 legacy)
through the real frontend validator and confirms every native input resolves
to a real registered component and every native renderer resolves to a real
registered renderer. This is the strongest available evidence that the
engine is complete and safe end-to-end.

### Runtime state / progress / actions — audited, nothing new built

`RunStatus.jsx` (state + optional detail) and `LogViewer.jsx` (joined log
lines) are the complete runtime UI; both are unchanged. RunStore's
`status.json` has no percent/progress field anywhere, and no plugin writes
one into the shared contract (two plugins compute a percentage privately,
outside RunStore, precisely because the shared contract has none) — a
`RunProgress` component would have no real data to display. Exactly one
plugin (`multi_agent_bio_orchestrator`) has a wired, authorized cancel
endpoint, but it only flips `RunStore.set_state(...,"CANCELLED")` — its own
executor's step loop never checks for that flag, so it does not actually
interrupt execution, and its own template's per-step "Cancel" button calls an
undefined JS function (dead code). No other RunStore-tracked analysis plugin
has any cancel/retry/resume-by-id capability; the only real retry/cancel
endpoints found operate on two entirely separate DB models
(`job_queue_manager`'s `Job`, `file_transfer_manager`'s `Transfer`), not
RunStore. Generalizing a shared "cancel" contract would be safe on the
*authorization* half (`authorize_run_access` already covers it) but not on
the *execution* half — essentially every other RunStore-using executor's run
loop would need new cooperative-cancellation code first. That is backend
work across the legacy plugin population, not a #708 frontend gap.
**`RUN_PROGRESS_COMPONENT_REQUIRED=NO`, `RUN_ACTION_COMPONENT_REQUIRED=NO`.**

One narrow, zero-new-feature fix was made: `AsyncAnalysisRenderer.jsx`'s
`TERMINAL` state set (`COMPLETED`/`COMPLETE`/`FAILED`/`ERROR`) did not include
`CANCELLED`, even though `RunStatus.state` is an unenforced free-text string
and at least one plugin already writes exactly that value. A native plugin
that legitimately reported `CANCELLED` would poll forever. `CANCELLED` was
added to `TERMINAL`; this does not add a cancel *feature* (no button, no
descriptor field, no new endpoint) — it only makes the existing polling loop
correctly recognize a state value the architecture already permitted.
Covered by a new test in `tests/ui/async-analysis-renderer.test.jsx`.

**`SYNCHRONOUS_ACTION_RENDERER_REQUIRED=NO`.** `AsyncAnalysisRenderer` submits
then immediately begins polling; a `sync`-execution-model plugin's first poll
simply observes an already-terminal state. No plugin was found needing
different browser behavior for synchronous execution — it is a fast
degenerate case of the same flow, not a distinct renderer family.

### Specialized-renderer boundaries (documented, not implemented)

Two parallel audits covered the complete catalog of non-ordinary-analysis
plugins. None of the following were implemented — each is intentionally a
documented boundary, matching this issue's explicit scope:

- **Dashboard** (`alerting`, `api_analytics`, `audit_log`,
  `environment_manager`, `file_transfer_manager`, `job_monitor`,
  `job_queue_manager`, `multiqc_wrapper`, `notification_center`,
  `object_registry_explorer`, `resource_monitoring`, `schema_registry`,
  `security_dashboard`, `storage_quota_manager`, plus `catalog`,
  `plugin_manager`, `provenance`, `workflow_registry_admin`,
  `agent_workflow_studio`): a genuinely distinct, uniform shape (N
  independent read-mostly `api/*` widgets rendered on one page, manual
  refresh only — no polling found anywhere in the sampled plugins — plus
  simple single-record CRUD/mutate actions). Real and repeated, but a
  materially different interaction model than submit-one-form/get-one-result;
  building it is a new, nontrivial renderer family explicitly out of this
  batch's scope ("arbitrary dashboard framework"). **Disposition:
  `SPECIALIZED_RENDERER_REQUIRED`, future work.**
- **Multi-stage / orchestration** (`multi_agent_bio_orchestrator`,
  `workflow_runner`, `workflow_scheduler`, `bio_agent`,
  `integration_connections`, `data_manager`, `dataset_catalog`,
  `run_inspector`, `workflow_explorer`): too heterogeneous for one
  contract — DAG execution with resume/replay, cron-style scheduling CRUD,
  and a conversational chat UI are three different interaction models.
  Notably, `workflow_explorer`'s own docstring calls itself an "interactive
  DAG-based explorer," but its actual template is a plain HTML table with no
  graph library at all — simpler than advertised, but still not a
  generic_runner case. **Disposition: `SPECIALIZED_RENDERER_REQUIRED` /
  `SERVICEVIEWER_MIGRATION_FALLBACK` per-plugin, future work.**
- **Graph/network** (`dataset_ingest`, `literature_summarizer`,
  `network_analysis`, `workflow_builder`): three incompatible libraries
  (d3-force, cytoscape.js, a hand-rolled canvas editor) with incompatible
  data shapes; `workflow_builder` is an editable DAG canvas (an editor, not a
  viewer) and must stay specialized regardless. **Disposition:
  `SPECIALIZED_RENDERER_REQUIRED`, no shared contract exists.**
- **Molecular/structure**: split. `alphafold` loads NGL for a genuine
  interactive 3D viewer — **`SPECIALIZED_RENDERER_REQUIRED`**. But
  `agentic_pymol`, `docking_pose_viewer`, and `structure_visualizer` all
  render a plain matplotlib/PyMOL PNG today — **already fully expressible by
  the existing `StaticPngResult`/`ArtifactDownload` contract, no new
  component needed.** All three were evaluated as Batch 9 proof-plugin
  candidates for exactly this reason; all three are held (see Proof plugins,
  below) for the same pre-existing executor defect found in Batch 8, not for
  any component gap.
- **Genome/locus**: `genome_viewer` is the only real IGV.js-based
  locus/track browser in the codebase, with no sibling to generalize
  against. **Disposition: `SPECIALIZED_RENDERER_REQUIRED`, one-off.**
- **Interactive scientific plot**: no plugin was found producing an
  interactive (non-static-image) plot from a shared, safely-representable
  payload; `StaticPngResult`/`ImageGallery` already cover the real,
  repeated image-result population (Batch 8). An arbitrary
  Vega/Plotly/D3 spec supplied by a descriptor remains explicitly
  unsupported for security reasons (arbitrary plotting-spec execution).

None of these need a universal "viewer" abstraction; each documented family
is its own narrow future contract if and when pursued.

### True external applications — reclassified

Of the four historical candidates, only **`jupyterhub`** is a genuine
external application: `api_server_start`/`api_server_stop` launch and stop a
real per-user Jupyter server process via the Hub's own REST API. The other
three are reclassified:

- **`galaxy`**: documented (plugin.json) as calling only Galaxy's REST API,
  no database/filesystem access, and already shaped exactly like the
  Standard Plugin API (`api_run`/`api_status`/`api_log`/`api_artifacts`) — an
  ordinary API-data connector, not an embedded application.
- **`prometheus_grafana`**: documented as a read-only PromQL/Grafana-API
  connector with no dashboard embedding and no mutation capability.
- **`omniml_studio`**: not externally connected at all — it indexes this
  repository's own local tutorial README files.

`TRUE_EXTERNAL_APPLICATIONS=jupyterhub`.
`RECLASSIFIED_EXTERNAL_WRAPPERS=galaxy, prometheus_grafana, omniml_studio`.

### Grouped / dependent fields and dataset resource families

No real plugin's input set was found large or complex enough to need
presentational grouping beyond the existing per-field `FieldShell` (native
plugins top out around 5 fields, the conditional-classifier family's fixed
`mode`/primary-input/`labels`/`model_ref`/`hyperparams`). **`GROUPED_FIELD_STATUS=NOT_JUSTIFIED`
— no repeated evidence.** The existing finite classifier condition grammar
(`controller`/`operator=equals`/`value`/`effect`) remains the only, and
sufficient, dependency relationship found anywhere; it is not generalized.
**`DEPENDENT_FIELD_STATUS=SUFFICIENT`.** Dataset/registered-object resource
families remain exactly where Batch 7 left them: `PLUGIN_RESOURCE_SOURCES`
is still empty, ownership/visibility for those families is still
heterogeneous and unaudited, and nothing was added. **`RESOURCE_FAMILY_STATUS=DEFERRED_BACKEND_CONTRACT`**
— the generic `ResourceSelectField` architecture exists and is proven; adding
a dataset/object adapter later is additive, not a #708 blocker.

### Executor ownership defect — classification B, not fixed

Batch 8 found 4 legacy executors whose `submit()` re-calls
`RunStore.create_run()` with `meta={"cli": True, ...}`, carrying no
`owner_user_id` and erasing whatever the generic `_api_run` view had already
recorded. Batch 9's proof-plugin evaluation independently found the
**identical** pattern in 3 more (`agentic_pymol`, `docking_pose_viewer`,
`structure_visualizer` — all `meta={"cli": True}`, no `owner_user_id`), for
7 confirmed instances across two batches. This is a systemic, pre-existing
legacy-executor pattern, unrelated to the React/descriptor architecture
itself, and it is not fixed here.

**`EXECUTOR_OWNERSHIP_DEFECT_CLASSIFICATION=B`** — a #707 migration /
backend-hardening prerequisite, not a #708 architecture gap. The generic
descriptor → renderer → component pipeline is already correct and already
enforces ownership correctly (via `authorize_run_access`) for every plugin
whose executor doesn't independently erase it after the fact; this is a
per-executor bug to fix before *those specific plugins* can migrate, not a
missing architectural capability.

### Proof plugins — all held, zero new native

| Plugin | UI family | Components | Renderer | Hold reason |
|---|---|---|---|---|
| `agentic_pymol` | static image result | `StaticPngResult`/`ArtifactDownload` (existing) | `generic_runner` | Executor ownership defect (`meta={"cli": True}`, no `owner_user_id`) |
| `docking_pose_viewer` | static image result | `StaticPngResult`/`ArtifactDownload` (existing) | `generic_runner` | Same defect |
| `structure_visualizer` | static image result | `StaticPngResult`/`ArtifactDownload` (existing) | `generic_runner` | Same defect |
| `cell_comm_visualization`, `chipseq_signal_plots`, `scanpy_qc_metrics`, `rnaseq_analysis` | multi-image result | `ImageGallery` (existing, Batch 8) | `generic_runner` | Same defect (held since Batch 8, re-confirmed) |

**`NEW_NATIVE=0`.** Every candidate's UI-side requirement is already fully
satisfiable by existing, unchanged components; every hold reason is the
identical backend defect above, not a frontend gap.

### Catalog compatibility (unchanged)

`ENABLED_PLUGINS=501`, `V1_NATIVE=129`, `V2_NATIVE=2`, `TOTAL_NATIVE=131`,
`LEGACY=370`, `NEW_NATIVE=0` — independently re-verified both by direct
Python computation in the Workbench worktree and by the cross-repository
`workbench-catalog-contracts.test.js` run against this exact worktree.
Real plugin category counts (`load_registry`, 501 enabled):
`reference_db` 129, `integration` 66, `analysis` 54, `genomics` 36, `ml` 31,
`utilities` 27, `epigenomics` 21, `ai` 20, `metabolomics` 16,
`drug_discovery` 15, `single_cell` 14, `dashboard` 13, `clinical` 9,
`pipeline` 8, `proteomics` 8, `search` 8, `spatial` 7, `microbiome` 6,
`structure` 5, `circrna` 3, `crispr` 3, `chemoinformatics` 1, `utility` 1 —
confirming `dashboard`/`ai`/`pipeline` are the project's own pre-existing
categories for exactly the specialized families documented above, not a
classification invented for this audit (see `docs/PLUGIN_CATEGORIES.md` in
the Workbench repo).

### #708 completion evidence

- Complete, documented UI vocabulary: 17 components, 3 renderers, 2 schema
  versions — all in one place in this document.
- Explicit schema validation, with a dedicated fail-closed test for every
  rejection path (unknown component, unknown renderer, unsupported schema
  version, executable metadata, malformed field/result).
- 501/501 enabled plugins classified exactly once, cross-repo verified.
- Zero descriptor- or result-controlled HTML/JS/URL/module execution path
  anywhere in the engine (grepped, zero matches outside the guard itself).
- Ordinary-plugin evidence: 131 plugins already render natively with zero
  plugin-specific JSX; the Batch 9 proof-plugin evaluation shows the
  remaining simple-image-result candidates need no new frontend work at all,
  only an unrelated backend fix.
- Specialized families (dashboard, multi-stage, graph, molecular, genome,
  true external app) are explicitly scoped out with documented future
  contracts, not silently ignored or forced into the generic system.

See "Creating a New Workbench Plugin UI" for the developer-facing decision
path, including when a result stays `ArtifactDownload`, when HTML must never
be rendered inline, and when plugin-specific React is actually justified.
