# Architecture

This page describes how a plugin goes from a Django backend to a native Studio
Workbench page, and why React never needs plugin-specific code to do it.

## The pipeline

```text
backend descriptor (JSON)
  -> pluginApi.loadPluginDescriptor()       fetch /plugins/{slug}/api/ui-schema/
  -> validatePluginDescriptor()             schema_version in {1,2}; fail closed
  -> rejectExecutableMetadata()             recursive forbidden-key scan
  -> resolveWorkbenchRenderer()             renderer name -> one allowlisted component
  -> <Renderer descriptor={descriptor} />   AsyncAnalysisRenderer | InformationalRenderer | QueryRenderer
       -> PluginForm / PluginField          -> resolveWorkbenchComponent() per input
       -> PluginResults                     -> ArtifactList / ArtifactDownload / ImageGallery / StaticPngResult
       -> (query only) ResultsTable / PaginationControls / DetailPanel / FilterControls
  -> fixed authenticated Django endpoints   ui-query / ui-detail / submit / status / logs / artifacts / ui-reference / ui-resources
```

Any failure in this pipeline — a 404, a `PluginDescriptorError`, `native_supported: false`,
or a renderer name that doesn't resolve — falls back to the legacy `ServiceViewer`
iframe/webview, never a partially-rendered native page. This fallback is
implemented directly in `src/ui/pages/PluginPage.jsx`:

```js
const Renderer = descriptor?.native_supported ? resolveWorkbenchRenderer(descriptor.renderer) : null;
if (error?.status === 404 || invalidDescriptor || (descriptor && (descriptor.native_supported === false || !Renderer))) {
  return <ServiceViewer url={url} label={label} onBack={onBack} backLabel={backLabel} />;
}
```

## The central principle: React is presentation-only

The descriptor is **data**, never code. React's job stops at:

- fetching and validating the descriptor,
- resolving descriptor identifiers to one of a small set of allowlisted
  components,
- rendering those components with the validated data,
- submitting form data / query parameters back to **fixed** backend
  endpoints named in the descriptor.

Django/the backend remains authoritative for everything else: authentication,
authorization, CSRF, ownership, scientific validation, input normalization,
resource visibility, execution, run lifecycle, artifacts, downloads, and
credentials/secrets. No descriptor field can change who is authorized to do
what — see [security-model.md](security-model.md) for the full boundary.

## "No plugin-specific JSX is normally required"

This is not aspirational. As of the current registry, 131 native plugins
(129 on schema v1, 2 on schema v2) render through this exact pipeline with
**zero** plugin-specific React code — no plugin-name branches, no descriptor
callbacks, and no dynamic component imports anywhere in `src/ui`. A repository-wide
grep for `dangerouslySetInnerHTML`, `eval(`, `new Function`, `Function(`,
`srcDoc`, `javascript:`, and dynamic `import(` across the entire `src/ui` tree
finds **zero** matches outside the guard regex itself
(`rejectExecutableMetadata`'s own forbidden-key pattern, in
`src/ui/lib/pluginApi.js`).

If you are building an ordinary analysis, query, or informational plugin, you
should not need to write any JSX at all — only a descriptor and the backend
endpoints it names. Plugin-specific React is reserved for the rare case
described in [adding-a-component.md](adding-a-component.md) and
[specialized-renderers.md](renderers/specialized-renderers.md).

## The developer workflow this system expects

```text
Plugin requirement
    v
Choose renderer family           -> renderer-selection.md
    v
Choose allowlisted shared components  -> fields/README.md, results/README.md
    v
Define declarative descriptor    -> descriptor-spec.md
    v
Implement authoritative Django backend  -> security-model.md
    v
Validate descriptor/backend contract  -> the real frontend validator rejects anything else
    v
Add frontend/backend contract tests  -> testing.md
    v
Native React UI (no plugin-specific JSX)
```

See [creating-plugin-ui.md](creating-plugin-ui.md) for the step-by-step guide
and [quickstart.md](quickstart.md) for the short version.

## The two live registries

Two frozen, explicit registries are the only places a descriptor identifier
can resolve to a React component:

- `WORKBENCH_COMPONENT_REGISTRY` (`src/ui/components/workbench/componentRegistry.jsx`) —
  17 entries. See [fields/README.md](fields/README.md) and
  [results/README.md](results/README.md).
- `RENDERER_REGISTRY` (`src/ui/components/workbench/rendererRegistry.jsx`) —
  3 entries plus 1 compatibility alias. See [renderers/README.md](renderers/README.md).

Both use `Object.prototype.hasOwnProperty.call(...)` lookups against a
frozen object and return `null`/fail closed for anything else — there is no
`eval`, no global lookup, and no dynamic module path by identifier string.

The component registry count partitions exactly into 8 field IDs and 9
result/presentation IDs. That is a registry inventory, not a promise that all
17 strings are accepted in every descriptor location. For example,
`QueryRenderer` resolves `table`, `pagination`, `filters`, and `detail` from
validated descriptor slots, while `PluginResults` directly composes
`artifact_list`, `artifact_download`, and `image_gallery`. See the
[field table](fields/README.md) and [result table](results/README.md) for the
per-entry contract and runtime-selection path.

## Related

- [descriptor-spec.md](descriptor-spec.md) — the full schema reference.
- [security-model.md](security-model.md) — the safety boundary in detail.
- [renderer-selection.md](renderer-selection.md) — which renderer to pick.
- [testing.md](testing.md) — how this is all kept correct.
