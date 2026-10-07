# Result components

Nine of the registry's 17 entries cover non-field result and presentation
behavior; a tenth component, `StaticPngResult`, presents a result but is
**not** a registry entry at all.

| Component | Registry id | Runtime selection | Purpose |
| --- | --- | --- | --- |
| [ResultsTable](table.md) | `table` | `result.presentation` through the registry | Scalar row/column table |
| [PaginationControls](pagination.md) | `pagination` | `pagination.component` through the registry | One-based backend pagination |
| [KeyValueResult](key-value.md) | `key_value` | Composed by `DetailPanel` | Flat labeled scalars |
| [DetailPanel](detail-panel.md) | `detail` | `detail.component` (or the v1 default) through the registry | Flat or one-level sectioned detail |
| [FilterControls](filters.md) | `filters` | `filters.component` through the registry | Finite optional-input grouping |
| [ScientificReference](scientific-reference.md) | `reference` | Composed by a `references` detail section | Authorized external scientific link |
| [ArtifactList](artifacts.md) | `artifact_list` | Composed by `PluginResults` | Bounded run-artifact metadata |
| [ArtifactDownload](artifacts.md) | `artifact_download` | Composed by `ArtifactList`/`ImageGallery` | Opaque-id authenticated download |
| [ImageGallery](image-gallery.md) | `image_gallery` | Composed by `PluginResults` for qualifying images | Inline multi-plot presentation |
| [StaticPngResult](static-png.md) | *(not registered)* | Composed by `PluginResults` when `result.presentation` is `static_png` | Single primary plot image |

All nine named IDs are real entries in `WORKBENCH_COMPONENT_REGISTRY` and
therefore resolve fail-closed through `resolveWorkbenchComponent()`. The
"Runtime selection" column is deliberately narrower: the current renderers
resolve `table`, `pagination`, `detail`, and `filters` from descriptor fields,
while they import and compose the other result primitives directly. Registry
membership does not imply that every ID is currently legal in every descriptor
position. `StaticPngResult` is the sole result primitive outside the 17-entry
registry.

## Cross-cutting rules

- **Escaped text and declared scalars only.** Table, key/value, and detail
  cells render `string | number (finite) | boolean | null` through
  `scalarText()` — never raw objects, arrays-as-cells, or HTML. Artifact and
  image components consume their own finite metadata contract. There is no
  recursive JSON viewer and none is planned (see
  [adding-a-component.md](../adding-a-component.md) for why
  `StructuredResult` was explicitly rejected).
- **No formatters, callbacks, or HTML in any result contract.** A column
  `label`, a detail `title`, or an artifact `label` is always inert display
  text.
- **Backend-derived identity.** Explicit row keys, artifact IDs, and detail
  IDs are server-derived and validated for uniqueness. Older v1 tables that
  declare no stable row identity may use display-only index keys; v2 requires
  a declared, unique `row_key`, and detail actions require a valid
  server-provided identity.

## Related

- [fields/README.md](../fields/README.md) — the other half of the registry.
- [descriptor-spec.md](../descriptor-spec.md) — the v1/v2 `result`, `detail`,
  `filters`, `pagination`, and `artifacts` contracts these components bind to.
