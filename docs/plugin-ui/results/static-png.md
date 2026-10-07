# StaticPngResult

**Category: INTERNAL/COMPOSITE shared component — not a `componentRegistry`
entry.** `StaticPngResult` lives at `src/ui/components/StaticPngResult.jsx`,
outside the `workbench/` registry tree, and is composed directly by
`PluginResults` — no descriptor `component`/`presentation` key ever
resolves to it through `resolveWorkbenchComponent()`.

## Purpose

Display exactly one primary result image, fetched as a binary blob (not a
plain `<img src>` to a URL) and rendered with its own caption.

## When to use it

A plugin whose result is genuinely one primary plot — a single volcano
plot, a single summary figure.

## When NOT to use it

Ordinary plot artifacts do not need this contract: [ImageGallery](image-gallery.md)
shows every qualifying artifact image automatically, even when there is only
one. The two components can coexist when a run has a separately declared
`static_png` primary render and downloadable plot artifacts.

## Descriptor contract

```json
{"result": {"presentation": "static_png", "primary": {"kind": "plot", "media_type": "image/png", "label": "Volcano plot", "alt": "Volcano plot of differential expression results"}}}
```

Required: `result.presentation` exactly `"static_png"`; `primary.kind`
exactly `"plot"`; `primary.media_type` exactly `"image/png"`;
non-empty `primary.label` and `primary.alt`. A descriptor declaring this
result must also declare `capabilities.render: true` and a `render`
endpoint, validated with the same plugin-scope check as every other
endpoint.

## Backend responsibilities

Serve the actual PNG bytes from the `render` endpoint, authenticated and
scoped to the run, and provide `render.alt`/`render.caption`/`render.label`
describing it.

## Frontend responsibilities

`StaticPngResult.jsx` fetches the `render` endpoint with
`Accept: image/png`, converts the response to a blob URL
(`URL.createObjectURL`), displays it in a `<figure>`, and revokes the blob
URL on cleanup/unmount to avoid leaking memory.

## Security boundary

The image is fetched through the same authenticated, same-origin,
plugin/run-scoped endpoint pattern as every other result — never a raw
external or storage URL. The frontend treats the response as an opaque
binary blob, not as anything it inspects or re-serves elsewhere.

## States

Loading ("Loading result image…"), error (`role="alert"`), empty (no
`renderEndpoint`/`render` data — renders nothing), ready (the figure).

## Accessibility

A semantic `<figure>`/`<img alt>`/`<figcaption>` using the descriptor's own
`alt`/`caption`/`label` text — never a generic or missing `alt`.

## Scientific-data considerations

Captions carry full scientific labels (e.g. "Volcano plot of differential
expression results") without abbreviation.

## Example

The `volcano_plot` plugin's single backend-declared PNG render.

## Rendered behavior

A single figure with its image and caption, replacing the loading state
once the blob resolves.

## Validation / failure behavior

A failed fetch renders a controlled error message; no `renderEndpoint`/
`render` pair renders nothing (not an error) since this is a legitimate
"no primary image" case for a plugin that otherwise only has downloadable
artifacts.

## Testing

`tests/ui/static-png-result.test.jsx`.

## Related components

[image-gallery](image-gallery.md), [artifacts](artifacts.md)
