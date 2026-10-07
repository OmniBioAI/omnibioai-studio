# Renderers

`RENDERER_REGISTRY` (`src/ui/components/workbench/rendererRegistry.jsx`) has
exactly 3 entries, plus 1 compatibility alias:

| Renderer | Component | Interaction model | Schema |
| --- | --- | --- | --- |
| `async_analysis` | [AsyncAnalysisRenderer](async-analysis.md) | Submit once, poll until terminal, show results | v1 |
| `informational` | [InformationalRenderer](informational.md) | No execution — static read-only content | v1 |
| `query` | [QueryRenderer](query.md) | Repeated search-and-inspect, with its own pagination/detail lifecycle | v1 and v2 |
| `generic_runner` | *(alias of `async_analysis`)* | — | v1 |

```js
export const RENDERER_REGISTRY = Object.freeze({
  async_analysis: AsyncAnalysisRenderer,
  informational: InformationalRenderer,
  query: QueryRenderer,
});
const LEGACY_RENDERER_ALIASES = Object.freeze({ generic_runner: "async_analysis" });
```

`generic_runner` is **not** a fourth renderer or a separate implementation.
It is a descriptor-name compatibility alias resolved by `normalizeRendererName()`
to `"async_analysis"` before the real registry lookup ever happens. Both the
frontend validator's `NATIVE_RENDERERS` set and the registry's alias map
treat it identically to writing `"async_analysis"` directly.

`resolveWorkbenchRenderer()` fails closed to `null` for any other string —
`tests/ui/renderer-registry.test.js` exercises injection-shaped inputs
(`"../../module"`, `"https://evil.example"`, `"javascript:alert(1)"`,
`"constructor"`, `"prototype"`, `"__proto__"`) and confirms all are
rejected, falling back to `ServiceViewer`.

## Which one to pick

See [renderer-selection.md](../renderer-selection.md) for the decision
guide, and [specialized-renderers.md](specialized-renderers.md) for what
this system intentionally does **not** try to represent.

## Related

- [architecture.md](../architecture.md)
- [descriptor-spec.md](../descriptor-spec.md)
