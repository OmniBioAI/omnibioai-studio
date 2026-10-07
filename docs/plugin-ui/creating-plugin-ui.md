# Creating a New Workbench Plugin UI

This is the complete developer walkthrough for giving an ordinary plugin a
native Workbench React UI. For a condensed fast path, see
[quickstart.md](quickstart.md). This guide covers the three implemented
renderer families — `async_analysis` (and its `generic_runner` alias),
`query`, and `informational` — only. Do not use it for dashboards, mutations,
multi-stage orchestration, graph editors, or anything else listed in
[renderers/specialized-renderers.md](renderers/specialized-renderers.md); keep
those plugins on the legacy `ServiceViewer` path instead.

## 1. Confirm the interaction family

See [renderer-selection.md](renderer-selection.md) for the full decision tree.
In short: choose `query` when one fixed Django operation returns a bounded
scalar table and may optionally provide backend pagination and one fixed
authorized detail operation. Choose `async_analysis` when the plugin submits
a job and the browser polls for status/results/artifacts — a fast,
synchronously-completing plugin is simply a degenerate case of the same flow,
not a different renderer. Choose `informational` for static, read-only
content with no execution lifecycle. Keep a plugin legacy if parity requires
nested automatic rendering, arbitrary actions, frontend scientific logic, or
dynamic URLs.

## 2. Choose shared components

- Inputs: see [fields/README.md](fields/README.md) — `text`, `textarea`,
  `number`, the finite `select`, `checkbox`, `multiselect`, `file`, or
  `resource_select`.
- Results: see [results/README.md](results/README.md) — `table`; optionally
  one-based `pagination`; `key_value` or `detail` for declared scalar or
  finite sectioned detail; `reference` for a scientific cross-reference;
  `artifact_list`/`artifact_download` for downloadable outputs;
  `image_gallery` for plot-image artifacts; `StaticPngResult` (not a registry
  identifier) for a separately declared primary render.
- Secondary criteria: optional `filters`, referencing already-declared
  optional inputs.

Identifiers are registry allowlists. Descriptors never name React modules,
formatters, callbacks, arbitrary backend URLs, or upstream URLs — see
[security-model.md](security-model.md).

## 3. Define the descriptor

Use schema v2 for the query contract described here; see
[descriptor-spec.md](descriptor-spec.md) for the full v1/v2 grammar. This
reduced RCSB shape illustrates actual supported metadata (see
[examples/query-rcsb-pdb.md](examples/query-rcsb-pdb.md) for the full worked
example):

```json
{
  "schema_version":2,
  "renderer":"query",
  "native_supported":true,
  "inputs":[
    {"id":"pdb_id","component":"text","format":"text","label":"PDB ID","description":"Optional structure accession.","required":false},
    {"id":"organism","component":"text","format":"text","label":"Organism","description":"Optional source organism filter.","required":false}
  ],
  "outputs":[],
  "capabilities":{"query":true,"detail":true},
  "endpoints":{"query":"/plugins/rcsb_pdb/api/ui-query/","detail":"/plugins/rcsb_pdb/api/ui-detail/{detail_id}/"},
  "result":{"presentation":"table","rows_path":"results","row_key":"pdb_id","detail_key":"pdb_id","columns":[{"key":"pdb_id","label":"PDB ID"}]},
  "filters":{"component":"filters","title":"Filters","field_ids":["organism"]},
  "detail":{"component":"detail","title":"Structure detail","sections":[
    {"id":"identity","title":"Structure identity","presentation":"scalar","fields":[{"key":"pdb_id","label":"PDB ID"}]},
    {"id":"citation_authors","title":"Primary citation authors","presentation":"table","optional":true,"row_key":"position","max_rows":100,"columns":[{"key":"position","label":"Order"},{"key":"author","label":"Author"}]},
    {"id":"primary_references","title":"Primary citation references","presentation":"references","optional":true,"reference_types":["doi","pubmed"],"max_items":2},
    {"id":"provenance","title":"Provenance","presentation":"provenance","fields":[{"key":"source","label":"Source database"}]}
  ]}
}
```

The full contract also requires finite plugin metadata. Field, column, and
detail keys use `^[a-z][a-z0-9_]*$` and cannot be prototype-dangerous or
sensitive names. Unknown properties fail closed.

## 4. Implement authoritative Django operations

Expose only `/plugins/{slug}/api/ui-query/` and, when declared,
`/plugins/{slug}/api/ui-detail/{detail_id}/`. Django authenticates and
authorizes, allowlists parameters, normalizes and scientifically validates
values, constructs upstream requests, enforces pagination, validates detail
IDs, and projects declared scalar fields and bounded table rows. It must
reject rather than silently truncate data beyond a declared bound. Never
expose credentials, upstream URLs, or raw payloads.

For section detail, return an object keyed by exact section IDs:

```json
{
  "identity":{"pdb_id":"4HHB"},
  "citation_authors":[{"position":1,"author":"A. Researcher"}],
  "primary_references":[{"reference_type":"pubmed","identifier":"6726807"}],
  "provenance":{"source":"RCSB Protein Data Bank"}
}
```

Use `scalar` for identity or measurements, `table` for repeated uniform rows,
and `provenance` for source/retrieval facts. Do not nest sections, return
arbitrary objects, put URLs in provenance, or ask React to interpret upstream
scientific JSON. Keep the plugin legacy when a finite projection would lose
scientific meaning (dbSNP's complete multi-operation variant workflow is the
canonical example — see [migration-guide.md](migration-guide.md)).

## Adding a scientific cross-reference

Use a `references` detail section only when the backend projects a bounded
list of scientific identifiers and an existing server policy owns their
external destination. `DetailPanel` composes the registered
`ScientificReference` primitive automatically; plugins do not select React
components or write JSX. See
[results/scientific-reference.md](results/scientific-reference.md) for the
full workflow and the open-redirect defense list.

**Do not put URLs in plugin UI descriptors.** The browser visits a fixed
same-origin resolver operation; Django validates the type and identifier and
constructs the allowlisted destination.

## Exposing downloadable artifacts

Use the artifact contract only for outputs already registered in the
caller-owned RunStore run. The browser receives opaque identities and display
metadata, never storage identity. See
[results/artifacts.md](results/artifacts.md) for the full workflow, and
[examples/async-analysis-deseq2.md](examples/async-analysis-deseq2.md) for a
real descriptor/executor walkthrough, including the current ownership blocker
that prevents treating it as end-to-end proof.

**Do not put filesystem paths or download URLs in UI descriptors.**

## Choosing boolean, multiple-choice, and resource inputs

Use the narrowest implemented field:

```text
Need a true/false option?             -> CheckboxField (`checkbox`)
Need one finite descriptor choice?    -> SelectField (`select`)
Need multiple finite descriptor
  choices?                            -> MultiSelectField (`multiselect`)
Need one of the caller's own prior
  completed runs?                     -> ResourceSelectField (`resource_select`)
Need any other server/user-owned
  resource (dataset, registered
  object, ...)?                       -> keep the plugin legacy; no
                                          evidence-backed contract exists yet
Need an arbitrary remote URL/API?     -> NOT SUPPORTED
```

See [fields/checkbox.md](fields/checkbox.md),
[fields/multiselect.md](fields/multiselect.md), and
[fields/resource-select.md](fields/resource-select.md) for full contracts.
`ResourceSelectField` fetches its own options from a fixed, server-computed
`GET /plugins/<slug>/api/ui-resources/<resource_type>/` endpoint — never a URL
the descriptor or `plugin.json` supplies — and discovery never authorizes
execution: the backend independently re-resolves and re-authorizes the
submitted id against RunStore ownership and `COMPLETED` state before your
executor ever sees it.

**Do not put resource URLs, storage paths, or authorization data in UI
descriptors.**

## 5. Add tests

Add the plugin to parameterized backend contracts. Verify schema, auth,
method, input projection, scientific validation, section projection and
bounds, malformed upstream handling, and endpoint scope. The Studio catalog
test must validate every emitted descriptor. Add a component test only for
genuinely new shared behavior. See [testing.md](testing.md) for real test
files to model yours on.

## 6. Verify production readiness

Run the configured Studio suite, shared UI package, relevant backend suite,
generated compatibility classification, web and Electron builds, and the
browser/accessibility matrix for material UI changes. Confirm every enabled
plugin remains classified exactly once before marking it native. See the full
command sequence in [testing.md](testing.md).

## 7. Choosing a result presentation

Answer these, in order, before writing anything:

1. **Is my result already representable?** A single downloadable file
   (table/log/archive/report/anything) is already fully covered by
   `ArtifactList`/`ArtifactDownload` — most plugins need nothing else.
2. **Which renderer should I use?** `async_analysis` (or its `generic_runner`
   alias) for a submit-and-poll run; `query` for a search-and-detail family;
   `informational` for a read-only static page. Do not invent a fourth.
3. **Which result presentation should the system use?** `table`
   (`ResultsTable`) for scalar rows, `key_value`/`detail` for declared scalar
   or finite sectioned detail, `reference` for a scientific cross-reference,
   or the `static_png` contract for a backend-declared primary render. If the
   run publishes **one or more** plot-type image artifacts, nothing extra is
   needed: `ImageGallery` renders automatically from the existing artifacts
   response — it is not a
   descriptor-level choice. See [results/README.md](results/README.md).
4. **What must Django normalize?** Every result value the frontend ever
   reads: finite scalar types, bounded lists, exact allowlisted keys, a real
   server-derived `media_type`/`kind`, never a raw tool-specific JSON blob
   passed through unexamined.
5. **What must never appear in a descriptor?** A URL, endpoint template,
   storage path, SQL, callback, JavaScript, component name, serializer,
   arbitrary query, expression, or credential. See
   [security-model.md](security-model.md).
6. **When should an output remain an `ArtifactDownload`?** Any report/document
   (HTML, PDF, Markdown) — every reporting plugin audited needs nothing beyond
   download. Do not build a bespoke inline report viewer.
7. **When should HTML/report output remain unsupported?** Always, for inline
   rendering — this codebase never injects a report's raw HTML into React
   (`dangerouslySetInnerHTML`, `srcDoc`, or an un-sandboxed `<iframe>` are all
   unsupported). A same-origin HTML artifact may be opened as its own document
   in a new tab, never embedded into the Workbench page's own DOM.
8. **When is plugin-specific React actually justified?** When a result or
   input shape is genuinely novel and does not repeat anywhere else in the
   plugin population — and even then, prefer keeping that plugin legacy over
   writing a one-off native component for it. See
   [adding-a-component.md](adding-a-component.md): a shared component is only
   worth building when the same shape repeats across multiple real plugins.

**Do not build a new result component without first auditing real, existing
plugin output shapes.** A plausible-sounding name from a roadmap is not
evidence.

## 8. Specialized-renderer guidance (when NOT to use this system)

See [renderers/specialized-renderers.md](renderers/specialized-renderers.md)
for the full, evidence-backed boundary list (dashboards, multi-stage
orchestration, graph/network editors, molecular/genome viewers, and true
external applications). None of those families require, or should be
approximated with, a generic recursive viewer, a dashboard framework, a
workflow/DAG builder, or an arbitrary plotting-spec engine.
