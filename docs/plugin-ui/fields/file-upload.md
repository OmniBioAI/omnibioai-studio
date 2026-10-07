# FileUploadField (`file`)

## Purpose

Upload one or more files as run input.

## When to use it

Any plugin input that is a real file (counts matrix, sequence file, image)
rather than a text/numeric parameter.

## When NOT to use it

- Schema v2 `query` descriptors — `file` is **v1 only**.
- Picking a file that's actually a prior run's own output — that's
  [resource-select](resource-select.md), not a fresh upload.

## Descriptor contract

`FileUploadField` is defined inline inside `componentRegistry.jsx` (not its
own file under `fields/`) and has the smallest descriptor surface of any
field — it reads directly off the raw `input` object with no dedicated
validator function beyond the common field checks:

```json
{"id": "counts_matrix", "component": "file", "format": "file", "label": "Counts matrix", "description": "Gene-by-sample counts table.", "required": true, "multiple": false, "accept": ".csv,.tsv"}
```

## Properties / fields

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `multiple` | boolean | no | Allows multi-file selection when `true` |
| `accept` | string | no | Passed straight to the native `accept` attribute as a hint only |

## Backend responsibilities

**Everything.** This is the component with the least frontend-enforceable
contract — the backend must independently validate file type (never trust
`accept` or the browser-reported MIME type), size, content, and filename
safety, exactly as if `accept` had never been declared. React cannot trust
the filename, extension, declared content type, or contents of an uploaded
file.

## Frontend responsibilities

Render a native `<input type="file">`; track the selected `FileList`;
submit each file under `input_{id}` (async-analysis file naming) via
`multipart/form-data`. No client-side content inspection.

## Security boundary

The browser performs no validation beyond the native file picker's own
`accept` hint, which is cosmetic. All real validation — type, size,
scanning, path safety on the server side when writing the file — belongs
to the backend.

## States

Selected (shows `data-selected-count`), disabled, read-only, invalid,
required.

## Accessibility

Native `<input type="file">` keyboard/screen-reader behavior via `FieldShell`.

## Scientific-data considerations

Filenames may be long/scientific (e.g. full accession-based filenames); the
component does not rename, truncate, or otherwise alter them before
submission — downstream display of any derived artifact filename is a
backend+`ArtifactList` concern, not this field's.

## Example

Any `async_analysis` plugin taking a sequencing/expression file as primary
input, e.g. `deseq2_analysis`'s counts matrix.

## Rendered behavior

A native file picker button plus a selected-file count.

## Validation / failure behavior

`AsyncAnalysisRenderer`'s client-side required check for `file` components
checks only that at least one file was selected (`(files[input.id] ||
[]).length`) — it does not inspect file content. All real validation happens
after submission, server-side.

## Testing

`tests/ui/workbench-components.test.jsx`, `tests/ui/workbench-base.test.jsx`.

## Related components

[resource-select](resource-select.md)
