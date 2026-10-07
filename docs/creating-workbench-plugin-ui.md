# Creating a New Workbench Plugin UI

This guide covers the implemented declarative query family only. Do not use it
for jobs, mutations, dashboards, graphs, arbitrary reports or multi-stage flows.

## 1. Confirm the interaction family

Choose `QueryRenderer` when one fixed Django operation returns a bounded scalar
table and may optionally provide backend pagination and one fixed authorized
detail operation. Keep a plugin legacy if parity requires nested automatic
rendering, arbitrary actions, frontend scientific logic or dynamic URLs.

## 2. Choose shared components

- Inputs: `text`, `textarea`, `number`, or the existing finite `select`.
- Results: `table`; optionally one-based `pagination`.
- Secondary criteria: optional `filters`, referencing declared optional inputs.
- Selected-record detail: optional `detail`, composed from either flat scalar
  rows or one ordered level of scalar, bounded-table, provenance and
  server-authorized scientific-reference sections.

Identifiers are registry allowlists. Descriptors never name React modules,
formatters, callbacks, arbitrary backend URLs or upstream URLs.

## 3. Define the descriptor

Use schema v2 only for this implemented query contract. This reduced RCSB shape
uses actual supported metadata:

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

The full contract also requires finite plugin metadata. Field, column and detail
keys use `^[a-z][a-z0-9_]*$` and cannot be prototype-dangerous or sensitive
names. Unknown properties fail closed.

## 4. Implement authoritative Django operations

Expose only `/plugins/{slug}/api/ui-query/` and, when declared,
`/plugins/{slug}/api/ui-detail/{detail_id}/`. Django authenticates and authorizes,
allowlists parameters, normalizes and scientifically validates values,
constructs upstream requests, enforces pagination, validates detail IDs and
projects declared scalar fields and bounded table rows. It must reject rather
than silently truncate data beyond a declared bound. Never expose credentials,
upstream URLs or raw payloads.

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
scientific meaning.

## Adding a Scientific Cross-Reference

Use a `references` detail section only when the backend projects a bounded list
of scientific identifiers and an existing server policy owns their external
destination. For example, RCSB declares `reference_types: ["doi", "pubmed"]`
and returns exact `{reference_type, identifier}` records. `DetailPanel` composes
the registered `ScientificReference` primitive automatically; plugins do not
select React components or write JSX.

Workflow:

1. Check `plugins/shared/scientific_references.py` for an existing allowlisted
   type and reuse it.
2. If the scientific resource is genuinely reusable, add a small server policy
   with a resource-specific identifier grammar, fixed HTTPS host and fixed path
   resolver, then scope it to the evidence plugin.
3. Add the type to the finite frontend validation/label registry. This duplicate
   check is UX/fail-closed defense; Django remains authoritative.
4. Declare the type and bound in a `references` section. Do not declare an
   endpoint, host or template.
5. Project only validated identifiers from Django. Never forward raw upstream
   links or ask React to infer database semantics.
6. Add backend redirect/open-redirect tests, descriptor/response contract tests,
   component accessibility tests and catalog regression coverage.

**DO NOT PUT URLS IN PLUGIN UI DESCRIPTORS.** Do not put `href`, `url`,
`base_url`, `url_template`, `route_template`, host, scheme, redirect destination
or callback metadata in the descriptor or response. The browser visits a fixed
same-origin resolver operation; Django validates the type and identifier and
constructs the allowlisted destination. Unknown/malformed references cannot
navigate.

Keep the plugin legacy if parity also needs unrelated interactions. dbSNP is the
canonical example: ClinVar/Gene/RefSeq references now fit the library, but its
complete multi-operation variant workflow still needs a separate authoritative
projection design.

## 5. Add tests

Add the plugin to parameterized backend contracts. Verify schema, auth, method,
input projection, scientific validation, section projection and bounds, malformed upstream
handling and endpoint scope. The Studio catalog test must validate every emitted
descriptor. Add a component test only for genuinely new shared behavior.

## 6. Verify production readiness

Run the configured Studio suite, shared UI package, relevant backend suite,
generated compatibility classification, web and Electron builds, and the
browser/accessibility matrix for material UI changes. Confirm every enabled
plugin remains classified exactly once before marking it native.
