# Complete example: query — RCSB PDB Integration

Real plugin, verified from the backend repository at `plugins/rcsb_pdb/`
(`plugin.json`, `executor.py`). `plugin.json` describes a synchronous
(`execution_model: "sync"`), read-only REST integration with the public RCSB
Protein Data Bank — structures, entities, chains, assemblies, ligands,
sequences, and cross-references.

This plugin's `plugin.json` exposes its capabilities as a generic
`workflow_node` input/output map (`pdb_id`, `entity_id`, `chain_id`,
`assembly_id`, `ligand_id` in; `search_results`, `structure`, `entities`,
`chains`, `assemblies`, `ligand`, etc. out) rather than embedding the native
UI query/detail descriptor directly in `plugin.json` — the actual v2 query
descriptor is produced by the shared descriptor-generation path (the same
one documented in [../descriptor-spec.md](../descriptor-spec.md)), not
hand-written per plugin. The reduced descriptor below is the same
already-verified illustrative shape used in
[../creating-plugin-ui.md](../creating-plugin-ui.md) and the existing
`docs/creating-workbench-plugin-ui.md`; it is explicitly a reduced
illustration of the real supported contract, not a literal dump of generated
JSON.

## 1. Plugin descriptor (reduced, illustrative)

```json
{
  "schema_version": 2,
  "renderer": "query",
  "native_supported": true,
  "inputs": [
    {"id": "pdb_id", "component": "text", "format": "text", "label": "PDB ID", "description": "Optional structure accession.", "required": false},
    {"id": "organism", "component": "text", "format": "text", "label": "Organism", "description": "Optional source organism filter.", "required": false}
  ],
  "outputs": [],
  "capabilities": {"query": true, "detail": true},
  "endpoints": {"query": "/plugins/rcsb_pdb/api/ui-query/", "detail": "/plugins/rcsb_pdb/api/ui-detail/{detail_id}/"},
  "result": {"presentation": "table", "rows_path": "results", "row_key": "pdb_id", "detail_key": "pdb_id", "columns": [{"key": "pdb_id", "label": "PDB ID"}]},
  "filters": {"component": "filters", "title": "Filters", "field_ids": ["organism"]},
  "detail": {"component": "detail", "title": "Structure detail", "sections": [
    {"id": "identity", "title": "Structure identity", "presentation": "scalar", "fields": [{"key": "pdb_id", "label": "PDB ID"}]},
    {"id": "citation_authors", "title": "Primary citation authors", "presentation": "table", "optional": true, "row_key": "position", "max_rows": 100, "columns": [{"key": "position", "label": "Order"}, {"key": "author", "label": "Author"}]},
    {"id": "primary_references", "title": "Primary citation references", "presentation": "references", "optional": true, "reference_types": ["doi", "pubmed"], "max_items": 2},
    {"id": "provenance", "title": "Provenance", "presentation": "provenance", "fields": [{"key": "source", "label": "Source database"}]}
  ]}
}
```

## 2. Input fields

`text` fields for `pdb_id` (optional structure accession) and `organism`
(optional source organism filter) — see
[../fields/text.md](../fields/text.md). Real production RCSB input also
includes a float `number` field (`max_resolution`, no artificial
`min`/`step` beyond what Django validates) per the batch audit notes; see
[../fields/number.md](../fields/number.md).

## 3. Renderer selection

`query` — this is a search-and-detail family: one fixed Django operation
returns a bounded scalar table, with backend-driven pagination and one fixed
authorized detail operation. See
[../renderers/query.md](../renderers/query.md).

## 4. Backend responsibilities

Verified to the level the plugin.json/descriptor contract exposes: Django's
`/plugins/rcsb_pdb/api/ui-query/` endpoint authenticates, allowlists query
parameters, constructs the upstream RCSB request, enforces pagination
(including RCSB's own backend page cap), and projects only the declared
columns. The `/plugins/rcsb_pdb/api/ui-detail/{detail_id}/` endpoint
validates the detail ID and projects the `identity`, `citation_authors`,
`primary_references`, and `provenance` sections shown above. This guide does
not independently re-verify the Django view/serializer source line-by-line
beyond what the existing audited documentation and the plugin's declared
`workflow_node` capabilities already establish — treat the endpoint behavior
above as the documented contract, not a line-by-line code citation.

## 5. Validation

Species/accession validation, numeric normalization, and the upstream query
construction are Django responsibilities; the frontend's native numeric
input validity is UX feedback only, never authorization.

## 6. Query and detail flow

`QueryRenderer` (see [../renderers/query.md](../renderers/query.md)) submits
the query form to the fixed `ui-query` endpoint, renders the response via
`ResultsTable` + `PaginationControls`, and — when a row is selected — calls
the fixed `ui-detail` endpoint and renders the response via `DetailPanel`.

## 7. Result/artifact contract

Scalar table rows (`table`, see [../results/table.md](../results/table.md)),
backend-driven one-based pagination (see
[../results/pagination.md](../results/pagination.md)), and a sectioned
detail view combining scalar identity, a bounded citation-author table, DOI/
PubMed scientific references (see
[../results/scientific-reference.md](../results/scientific-reference.md)),
and provenance (see [../results/detail-panel.md](../results/detail-panel.md)).

## 8. Tests

Studio: `tests/ui/query-renderer.test.jsx`, `tests/ui/query-batch.test.jsx`,
`tests/ui/workbench-scientific-reference.test.jsx`,
`tests/ui/workbench-structured-detail.test.jsx`. Backend-side query/detail
contract tests exist on Workbench `main` as
`plugins/shared/tests/test_query_ui.py`; see [../testing.md](../testing.md).

## 9. Expected UI behavior

The developer enters an optional PDB ID and/or organism filter and submits;
a scalar results table appears with backend-driven pagination controls.
Selecting a row shows a detail panel with structure identity, a bounded
citation-author table, clickable DOI/PubMed references that navigate through
a same-origin authenticated redirect, and provenance — all without any
plugin-specific React code.
