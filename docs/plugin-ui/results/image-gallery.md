# ImageGallery (`image_gallery`)

## Purpose

Show a run's plot-image artifacts inline, including multi-image sets, instead
of as plain download links only.

## When to use it

A run that publishes **one or more** plot-kind image artifacts — an MA plot,
multiple QC plots, per-comparison volcano plots, or a cell-communication
figure set.

## When NOT to use it

A backend-declared primary render may use
[StaticPngResult](static-png.md), a separate contract that can coexist with
artifact images. Do not use the gallery for non-image artifacts,
report/document viewing, or anything needing interactive
zoom/lightbox/annotation (no such capability exists).

## Descriptor contract

**None.** This is the key fact about `ImageGallery`: it introduces no new
identity, endpoint, descriptor field, or backend code at all. A plugin needs
**zero** descriptor changes to get a gallery — it appears automatically
whenever the plugin's existing, unchanged artifacts response contains one or
more qualifying items.

## Properties / fields

`ImageGallery.jsx` is a pure frontend filter over the same validated
`artifacts` array [ArtifactList](artifacts.md) already receives:

```js
artifacts.filter(a => a?.kind === "plot" && /^image\//.test(a?.media_type || ""))
```

No additional network request, response contract, or capability/endpoint
key exists beyond the unchanged Batch-5 artifacts contract (see
[artifacts.md](artifacts.md)).

## Backend responsibilities

Unchanged from the artifact contract: authenticate, check `owner_user_id`,
resolve the opaque artifact ID, contain the path under the run's output
root, derive media type, force `attachment`/`nosniff`/`no-store`. Nothing
about this component touches artifact-serving code at all.

## Frontend responsibilities

Render each qualifying artifact as an `<img>` using the same opaque,
ownership-checked download URL `ArtifactDownload` already constructs.
`Content-Disposition: attachment` on that response does not prevent a
browser from rendering it as an `<img src>` — it only affects top-level
navigation — so no backend change was needed to reuse the endpoint this
way.

## Security boundary

Every image URL is the same opaque, server-derived download URL the
artifact contract already produces; the component never receives or
constructs a path, bucket, signed URL, or arbitrary endpoint. A malformed
or attacker-shaped `artifact_id` falls back to an inert "Image unavailable"
state instead of ever constructing a broken `src` — mirroring
`ArtifactDownload`'s own fail-closed behavior exactly.

## States

Renders nothing while `loading` or `error` are set (the sibling
`ArtifactList` already communicates those states, so nothing duplicates
them) and renders nothing when zero qualifying images are present — a
plugin with no plot artifacts is simply unaffected.

## Accessibility

Each image is a semantic `<figure>`/`<figcaption>` pair inside a labeled
`<ul aria-label="Result images">`; `alt` is always the artifact's own
non-empty `label`; every item still carries its existing, keyboard-reachable
`ArtifactDownload` link alongside the image. Images use `loading="lazy"` so
a large (bounded-by-100) result set doesn't eagerly fetch every image at
once.

## Scientific-data considerations

Long captions wrap (`overflow-wrap: anywhere`) rather than truncating —
reusing the same rule already applied to artifact names.

## Example

```json
{"artifacts": [
  {"artifact_id": "art_…A", "display_name": "qc_violin.png", "label": "QC Violin Plot", "media_type": "image/png", "size_bytes": 20480, "kind": "plot"},
  {"artifact_id": "art_…B", "display_name": "qc_scatter.png", "label": "QC Scatter Plot", "media_type": "image/png", "size_bytes": 18240, "kind": "plot"}
]}
```

## Rendered behavior

A responsive grid (CSS `repeat(auto-fill, minmax(220px, 1fr))`, collapsing
to one column well before 320px) of captioned figures, each still
independently downloadable via `ArtifactList` below it.

## Validation / failure behavior

This component performs no independent validation — it trusts the same
`validateArtifactPayload` pass the renderer already ran before it was given
the `artifacts` array.

## Known limitation — be honest about current production coverage

Real multi-image-producing plugins exist (`cell_comm_visualization`,
`chipseq_signal_plots`, `scanpy_qc_metrics`, `rnaseq_analysis`, legacy
`proteomics`), but **none are currently wired into the native registry** —
all are still on `ServiceViewer`, blocked by an unrelated legacy-executor
ownership defect (see [migration-guide.md](../migration-guide.md) and
[examples/artifact-image.md](../examples/artifact-image.md)). This
component is proven entirely by its own test suite against synthetic
descriptors, not by a production end-to-end plugin — the same evidence
pattern as [resource-select](../fields/resource-select.md).

## Testing

`tests/ui/workbench-image-gallery.test.jsx`.

## Related components

[artifacts](artifacts.md), [static-png](static-png.md)
