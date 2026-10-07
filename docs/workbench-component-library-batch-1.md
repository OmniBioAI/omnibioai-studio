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
| PluginResults | — | PARTIAL | Existing asynchronous result dispatch |
| StaticPngResult | — | PRODUCTION | Existing static PNG result |
| MetadataPanel | — | PLANNED_NOT_AVAILABLE | Not distinct from scalar sections |
| ScientificReference | `reference` | PRODUCTION | Server-authorized scientific cross-reference navigation |
| ArtifactList | `artifact_list` | PRODUCTION | Bounded metadata for caller-owned run artifacts |
| ArtifactDownload | `artifact_download` | PRODUCTION | Fixed same-origin download by opaque artifact ID |
| CheckboxField | `checkbox` | PRODUCTION | Deterministic true/false input using a native checkbox |
| MultiSelectField | `multiselect` | PRODUCTION | Multiple selections from at most 50 descriptor-owned choices |
| ServerSelect | — | PLANNED_NOT_AVAILABLE | Server/user-resource discovery is a separate future contract |
| ResourceSelector | — | PLANNED_NOT_AVAILABLE | Never model resource discovery as a finite multiselect |
| Arbitrary hyperlink | — | INTENTIONALLY_UNSUPPORTED | Descriptors/runtime data never carry destinations |
| Structured recursive JSON viewer | — | PLANNED_NOT_AVAILABLE | Intentionally unsupported |

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
