# informational

## Purpose / interaction model

Read-only, static informational content. No execution lifecycle at all —
no submit, no run, no polling.

## Intended plugin class

A plugin that only presents fixed explanatory content (documentation-style
pages, "about this data source" pages) with no user input and no backend
job.

## Descriptor shape it expects

```json
{
  "schema_version": 1,
  "plugin": {"slug": "...", "name": "...", "version": "...", "description": "...", "category": "..."},
  "renderer": "informational",
  "native_supported": true,
  "inputs": [],
  "outputs": [],
  "capabilities": {"read_only": true},
  "content": {
    "summary": "One-paragraph overview.",
    "sections": [
      {"heading": "Data source", "paragraphs": ["This plugin indexes ...", "Updated ..."]}
    ]
  }
}
```

`inputs` and `outputs` must both be empty arrays; `capabilities` must be
exactly `{"read_only": true}`; `content.summary` is a string;
`content.sections` is an array of `{heading, paragraphs: [string, ...]}`.
The `content` object and each section use exact key sets. The v1 validator
does not apply a strict top-level allowlist, but any additional top-level
metadata is still subject to the recursive forbidden-key scan and is not
interpreted by this renderer.

## Lifecycle

None. The descriptor is fetched once and rendered — no polling, no
submission, no terminal state.

## Backend endpoint responsibilities

None beyond the `ui-schema` endpoint itself — there are no additional
`informational`-specific endpoints.

## Frontend responsibilities

`InformationalRenderer.jsx` renders `content.summary` as one paragraph,
then each section as a labeled `<section>` with an `<h2>` and its
paragraphs — plain text throughout, with no HTML/URL execution path at all.

## Security boundary

All content is escaped text. There is no field, section, or key in this
descriptor shape that can carry a URL, script, or callback.

## States

Only one real state: rendered. (Loading/error are handled generically by
`PluginPage` before the renderer ever mounts.)

## Testing

`tests/ui/plugin-page.test.jsx`, `tests/ui/workbench-base.test.jsx`.

## Related

[renderer-selection.md](../renderer-selection.md)
