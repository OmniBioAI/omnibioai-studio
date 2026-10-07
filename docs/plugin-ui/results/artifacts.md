# ArtifactList (`artifact_list`) + ArtifactDownload (`artifact_download`)

Documented together because they are always paired in practice:
`PluginResults` renders `ArtifactList`, and each list item embeds an
`ArtifactDownload`.

## Purpose

Present a bounded list of a completed, caller-owned run's outputs, and
download one through an authenticated route — using only an opaque,
server-derived identity.

## When to use it

Any `async_analysis` plugin's downloadable outputs: tables, logs, reports,
archives, or plots a user should be able to save. This already covers
essentially every report/document case audited in this codebase (15+
report-producing plugins, all reducing to one opaque HTML/PDF/Markdown
artifact) — most plugins need nothing beyond this pair.

## When NOT to use it

Directory browsing, upload, deletion, rename, inline HTML/report execution,
object-store navigation, or any arbitrary path/URL. A same-origin HTML
artifact may be opened as its own document in a new tab (existing
precedent: `clinical_report_generator`) — it is never embedded into the
Workbench page's own DOM via `dangerouslySetInnerHTML`, `srcDoc`, or an
un-sandboxed `<iframe>`; none of those exist anywhere in this codebase's
`src/ui`.

## Artifact identity

`art_` followed by 43 base64url characters
(`OPAQUE_ARTIFACT_ID = /^art_[A-Za-z0-9_-]{43}$/`). The backend derives this
ID with a keyed digest over plugin, run, and manifest position — it reveals
no path, bucket, object key, or tenant directory.

## Descriptor contract

```json
{
  "artifacts": {"presentation": "list", "max_items": 100},
  "endpoints": {
    "artifacts": "/plugins/my_analysis/api/artifacts/{run_id}/",
    "download": "/plugins/my_analysis/api/ui-artifacts/{run_id}/{artifact_id}/download/"
  }
}
```

`max_items` is a safe integer 1–100. The `download` endpoint must exactly
equal `/plugins/{slug}/api/ui-artifacts/{run_id}/{artifact_id}/download/`
for the plugin's own slug.

## Runtime contract

```json
{"artifacts": [{"artifact_id": "art_NzvP2cW7E0eCG_WoahB1FcWtt0Rdj1N27Z2u2d64FcA", "display_name": "sample_condition_differential_expression_results.tsv", "label": "Differential expression results", "media_type": "text/tab-separated-values", "size_bytes": 18422, "kind": "table"}]}
```

Validated by `validateArtifactPayload`: each item has exactly
`artifact_id`, `display_name` (≤255 chars, no control chars or `/`/`\`),
`label` (≤200 chars), `media_type` (a real `type/subtype` string), `size_bytes`
(non-negative safe integer), `kind`. `kind` is one of exactly:
**`archive`, `file`, `log`, `plot`, `report`, `table`**. Unknown properties,
duplicate IDs, or any value outside these bounds reject the entire payload.

## Backend responsibilities

Authenticate, check RunStore `owner_user_id`, resolve the opaque ID against
that specific plugin/run's manifest, resolve the path strictly below the
run's own output root, reject symlink escape, derive filename/media-type/
size, and return a server-named attachment. Wrong-owner, wrong-run,
wrong-plugin, guessed, and missing IDs all receive the **same** not-found
response — an ownerless run fails closed for everyone, including its own
creator.

**Containment:** IDs are never interpreted as paths; only server-held
manifest paths resolve below the run's output directory.

**Filename/content-type safety:** the backend derives the leaf filename,
strips control characters and path separators, delegates
`Content-Disposition` quoting to the response framework, derives media
type from the safe filename, and forces every artifact — including HTML —
to `attachment` with `nosniff` and `no-store`.

## Frontend responsibilities

`ArtifactList.jsx` renders a semantic list with label/filename/kind/media-type/
formatted-size metadata; `ArtifactDownload.jsx` constructs exactly one fixed
URL via `pluginArtifactDownloadUrl(pluginSlug, runId, artifactId)` and
renders a native download anchor — if that URL construction throws (an
untrusted runtime identity even after payload validation), it renders
"Download unavailable" instead of a broken link.

## Security boundary

The frontend never sees a path, bucket, signed URL, or credential — only
the opaque ID and display metadata above. Every claim this component makes
about a file (name, kind, size, type) is server-derived, never computed or
inferred by React. **Never put filesystem paths or download URLs in UI
descriptors** — the only URL shape ever declared is the fixed
`ui-artifacts/.../download/` endpoint pattern itself.

## States

Loading ("Loading artifacts…"), error (`role="alert"`), empty ("The run
completed without published artifacts."), populated.

## Accessibility

A semantic `<ul aria-label="Downloadable artifacts">`; each download is an
anchor with a filename-specific accessible name
(`"Download {display_name}"`) and visible token-based focus.

## Scientific-data considerations

Meaningful filenames (e.g.
`sample_condition_differential_expression_results.tsv`) wrap rather than
ellipsize; metadata stacks at narrow widths instead of overflowing.

## Example

The DESeq2 executor emits differential-expression, MA-plot, and
normalized-count artifacts, but its current second run creation erases the
recorded owner and prevents it from serving as end-to-end proof. See
[examples/artifact-image.md](../examples/artifact-image.md) for the audited
limitation.

## Rendered behavior

A list of artifact summaries, each with a Download link.

## Validation / failure behavior

Invalid runtime metadata rejects the whole artifacts response and is surfaced
through the renderer's controlled error handling; an individual
artifact with an unconstructable download URL shows "Download unavailable"
rather than a broken link, without blocking the rest of the list.

## Testing

`tests/ui/workbench-artifacts.test.jsx`, `tests/ui/async-analysis-renderer.test.jsx`;
Workbench backend `plugins/shared/tests/test_artifact_ui.py`,
`plugins/shared/tests/test_plugin_ui_schema.py`.

## Related components

[image-gallery](image-gallery.md), [static-png](static-png.md)
