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
- Selected-record detail: optional `detail`, composed from scalar key/value rows.

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
  "detail":{"component":"detail","title":"Structure detail","fields":[{"key":"pdb_id","label":"PDB ID"}]}
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
projects declared scalar fields. Never expose credentials, upstream URLs or raw payloads.

## 5. Add tests

Add the plugin to parameterized backend contracts. Verify schema, auth, method,
input projection, scientific validation, scalar projection, malformed upstream
handling and endpoint scope. The Studio catalog test must validate every emitted
descriptor. Add a component test only for genuinely new shared behavior.

## 6. Verify production readiness

Run the configured Studio suite, shared UI package, relevant backend suite,
generated compatibility classification, web and Electron builds, and the
browser/accessibility matrix for material UI changes. Confirm every enabled
plugin remains classified exactly once before marking it native.
