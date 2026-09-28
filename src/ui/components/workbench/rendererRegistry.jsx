import AsyncAnalysisRenderer from "./AsyncAnalysisRenderer";

// Only a browser lifecycle with evidence in the current generic family is
// registered. generic_runner is retained as a descriptor compatibility alias;
// it is not a second implementation or renderer family.
export const RENDERER_REGISTRY = Object.freeze({
  async_analysis: AsyncAnalysisRenderer,
});

const LEGACY_RENDERER_ALIASES = Object.freeze({ generic_runner: "async_analysis" });

export function normalizeRendererName(renderer) {
  if (renderer === "async_analysis") return renderer;
  return typeof renderer === "string" && Object.prototype.hasOwnProperty.call(LEGACY_RENDERER_ALIASES, renderer)
    ? LEGACY_RENDERER_ALIASES[renderer]
    : null;
}

export function resolveWorkbenchRenderer(renderer) {
  const normalized = normalizeRendererName(renderer);
  return normalized && Object.prototype.hasOwnProperty.call(RENDERER_REGISTRY, normalized)
    ? RENDERER_REGISTRY[normalized]
    : null;
}
