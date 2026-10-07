# ResourceSelectField (`resource_select`)

This component requires especially detailed documentation: it is the only
field that performs its own network request, the only field backed by a
server-owned discovery endpoint, and the one most likely to be misused as a
general-purpose "pick anything" input if its real, narrow boundary isn't
understood.

## Purpose

Let a caller pick **one of their own prior completed runs** as input to a
new run — "use the output of an earlier QC run."

## When to use it

Exactly one resource family today: a caller's own RunStore runs
(`resource_type: "run"`), filtered to runs of a server-declared source
plugin or plugins, scoped to the *rendering* plugin.

## When NOT to use it

- Finite descriptor-owned choices — use [select](select.md) or
  [multiselect](multiselect.md).
- Arbitrary remote/API search, datasets, or registered objects — **not
  supported.** `plugins.shared.resource_ui.PLUGIN_RESOURCE_SOURCES` is the
  only source-registration mechanism, and dataset/registered-object
  families have no evidence-backed, uniformly-enforced per-user ownership
  boundary the way RunStore runs do. Keep such plugins legacy rather than
  inventing a contract for them.
- Multiple-resource selection — `multiple` is always `false`; there is no
  evidence of a need for multi-select resource discovery.
- Schema v2 `query` descriptors — `resource_select` is **v1 only**
  (`validBatchField` does not include it).

## Current resource families

Only `"run"` exists (`RESOURCE_TYPES` in Studio's `pluginApi.js` and
Workbench's `plugins/shared/resource_ui.py`; `pluginUiContracts.js` supplies
the response identity checks). Dataset and registered-object adapters are
**not implemented** — do not document or build against them as if they
exist; `PLUGIN_RESOURCE_SOURCES` is empty in production today (no plugin is
wired to it yet).

## Opaque identity

The value is RunStore's own existing opaque run id (a `uuid4().hex`, assigned
server-side at run creation) — not a new identity system. It carries no
path, bucket, or storage detail, and matches `RESOURCE_ID`:
`^[A-Za-z0-9_.-]{1,128}$`.

## Discovery

`ResourceSelectField.jsx` fetches `GET /plugins/{slug}/api/ui-resources/{resource_type}/`
on mount (and on manual Retry) — this is the **only** field that issues its
own network request. The endpoint must exactly equal
`/plugins/{slug}/api/ui-resources/{resource_type}/` for the *rendering*
plugin's own slug; a descriptor cannot point this field at another plugin's
discovery endpoint.

The *source* plugin(s) actually searched are never a URL segment or
descriptor value — only `plugins.shared.resource_ui.PLUGIN_RESOURCE_SOURCES`,
keyed by the rendering plugin's slug, decides that server-side. A plugin's
own manifest cannot grant itself a new source.

**Response contract** (`validateResourcePayload` in `pluginUiContracts.js`):

```json
{"results": [{"id": "a1b2c3...", "label": "RNA-seq QC — Oct 3", "source_plugin": "rnaseq_qc"}]}
```

Bounded to `MAX_RESOURCES = 100`, newest-first. Each `id` matches
`RESOURCE_ID`, each `label` is non-empty, trimmed, ≤200 chars, with no
control characters — server-derived from the run's own `created_at` and
source-plugin name, **never a client-supplied label** (no caller-authored
run label exists yet). `source_plugin` matches `RESOURCE_SLUG`. No path,
params, or other `run.json` content is ever serialized into this response.

## Descriptor contract

```json
{"id": "source_run_id", "widget": "resource_select", "format": "text", "label": "Source run", "description": "A prior completed run to use as input.", "required": true, "multiple": false, "resource_type": "run", "endpoint": "/plugins/your_plugin/api/ui-resources/run/"}
```

Allowed keys exactly: `id`, `widget`/`component`, `label`, `description`,
`required`, `format` (`"text"`), `multiple` (always `false`),
`resource_type` (`"run"`), `endpoint`. No `choices`, `default`, `accept`, or
`placeholder` is accepted. `validatePluginDescriptor` also re-checks that
`field.endpoint` exactly equals
`/plugins/{slug}/api/ui-resources/{resource_type}/` for the plugin's own
slug. A field whose rendering plugin has no `PLUGIN_RESOURCE_SOURCES` entry
is dropped from the descriptor entirely — the same fail-closed convention
as every other malformed field.

## Selection semantics

Single selection only; the submitted value is the opaque id string, in
`param_{id}`, identical in shape to a `text` field.

## Submission reauthorization

**Discovery never authorizes execution.** The backend's `resource_select`
input-handling branch independently calls something equivalent to
`resource_owned_by_user(user_id=request.user.id, source_plugins=..., resource_id=...)`,
which re-resolves RunStore ownership and requires `state == "COMPLETED"` —
exactly as if the id had never been seen before. A value that was
legitimately listed in discovery, then becomes unowned, incomplete, or
deleted before submission, is rejected the same as one that was never
listed at all.

## UI states

`ResourceSelectField.jsx`'s own `state.status` drives every case:

- **loading** — native `<select aria-busy>` plus an `aria-live` status line
  ("Loading options…"); the control is disabled and its value is forced to
  `""` while loading.
- **loaded** — populated `<option>` list; a disabled placeholder
  (`"Select…"`, or just disabled with no text if not required) ensures
  nothing is ever silently preselected.
- **empty** — `role="status"`, "No eligible resources are available yet.",
  control disabled.
- **error** — `role="alert"` with the error message and a **Retry** button
  that re-fetches (bumping an internal request token so a stale response
  can't clobber a newer one).
- selected, disabled, required, invalid, read-only — standard `FieldShell`
  states layered on top of the above.

## Accessibility

Native `<select>`, the same label/description/error association every field
gets from `FieldShell`, full keyboard operation, visible focus, and a
disabled placeholder option so nothing is silently preselected.

## Scientific-data considerations

Labels are short, human-oriented summaries ("RNA-seq QC — Oct 3"), not raw
scientific identifiers — there's no long-identifier wrapping concern here
the way there is for `text`/`table` content elsewhere.

## Security boundary

```text
CAN_RESOURCE_ID_BYPASS_OWNERSHIP = NO
CAN_RESOURCE_ID_CROSS_PLUGIN_SCOPE = NO
CAN_RESOURCE_ID_CROSS_RESOURCE_TYPE = NO   (only "run" exists)
CAN_CLIENT_SELECT_UNDISCOVERABLE_RESOURCE = NO   (reauthorization is independent of discovery)
```

Never put resource URLs, storage paths, or authorization data in a
descriptor for this field — only the fixed discovery endpoint shape and
`resource_type` are ever declared.

## Example

```json
{"id": "source_run_id", "widget": "resource_select", "format": "text", "label": "Source run", "description": "A prior completed run to use as input.", "required": true, "multiple": false, "resource_type": "run", "endpoint": "/plugins/report_builder/api/ui-resources/run/"}
```

## Rendered behavior

A native dropdown that starts in a loading state, then either lists owned
completed runs of the registered source plugin(s), or shows an empty/error
state with Retry.

## Validation / failure behavior

No production plugin is currently wired to `PLUGIN_RESOURCE_SOURCES` — the
contract is proven entirely by its own backend and frontend test suites, so
a future plugin can adopt it without re-deriving the security model (the
same evidence pattern [ImageGallery](../results/image-gallery.md) uses).

## Testing

Workbench backend: `plugins/shared/tests/test_resource_ui.py` (discovery
view + IDOR matrix), `plugins/shared/tests/test_resource_select_field.py`
(descriptor + submission reauthorization). Studio frontend:
`tests/ui/workbench-resource-select.test.jsx`.

## Related components

[select](select.md), [multiselect](multiselect.md),
[artifacts](../results/artifacts.md) (the other opaque-identity contract in
this system)
