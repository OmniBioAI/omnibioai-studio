# PaginationControls (`pagination`)

## Purpose

Navigate a backend-paginated query result set.

## When to use it

Any `query` plugin whose result set is too large to return in one response
and whose backend already implements page-based retrieval.

## When NOT to use it

There is no cursor mode and no client-invented pagination — if the backend
can't authoritatively answer "what page am I on, is there a next page,"
don't declare this component; return the full bounded result set instead
and skip pagination entirely.

## Descriptor contract

```json
{"component": "pagination", "mode": "page"}
```

Plus a required integer `number` input named `page_size` elsewhere in
`inputs`. The descriptor may **never** declare its own client-controlled
`page` field — the frontend owns that query parameter exclusively
(`pluginQueryApi.js`'s `queryRequestUrl` sets `page` itself and rejects a
descriptor that tries to declare an input with `id: "page"`).

## Properties / fields

Descriptor: only `component`/`mode` as above — no optional keys.

Runtime pagination object (validated by `validPagination`):

```json
{"mode": "page", "page": 1, "page_size": 20, "total_items": 37, "has_previous": false, "has_next": true}
```

`page`/`page_size` are positive safe integers, `total_items` is a
non-negative safe integer, `has_previous`/`has_next` are booleans and must
be internally consistent (`has_previous === page > 1`; if `has_next` is
true, `page < ceil(total_items / page_size)`). The backend may legitimately
set `has_next: false` before the reported total is exhausted when an
upstream policy imposes a page cap — the component honors that without
complaint.

## Backend responsibilities

Compute and return the entire pagination object authoritatively on every
query response; enforce the `page` parameter server-side; apply any upstream
page cap.

## Frontend responsibilities

`PaginationControls.jsx` accepts trusted `pagination`, `loading`, `disabled`,
`onNavigate` props and emits only internal `"previous"`/`"next"` events;
`QueryRenderer` translates those into the fixed `page` parameter through
`pluginQueryApi`. In-progress query-field edits never affect pagination
until the query is actually submitted; a new search resets pagination to
page 1; a failed page request keeps the last successful results visible and
allows retry; aborted/stale requests can never replace newer results.

## Security boundary

No navigation URLs ever appear in descriptor or runtime data — only the
fixed `page` query parameter the frontend itself constructs against the
already-validated `endpoints.query` URL.

## States

Default, loading (buttons disabled, "· Loading…" appended to the status
line), disabled, invalid pagination data (`<p role="alert">Invalid
pagination data.</p>`).

## Accessibility

A named `<nav aria-label="Results pagination">`; the current page uses
`aria-current="page"`; the summary line is `role="status" aria-live="polite"`;
Previous/Next are native `<button>`s with native `disabled` semantics tied
to `has_previous`/`has_next`.

## Scientific-data considerations

Not applicable — this component carries no scientific content, only counts.

## Example

RCSB PDB's real page navigation, including its backend's own page cap.

## Rendered behavior

Previous/Next buttons flanking a live "Page N · M results" summary.

## Validation / failure behavior

Any inconsistency in the runtime pagination object (bad types, inconsistent
boundary flags) renders a controlled alert instead of broken navigation
controls.

## Testing

`tests/ui/workbench-results.test.jsx`, `tests/ui/query-batch.test.jsx`.

## Related components

[table](table.md), [query renderer](../renderers/query.md)
