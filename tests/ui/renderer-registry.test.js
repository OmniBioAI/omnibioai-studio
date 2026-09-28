import { describe, expect, it } from "vitest";
import { RENDERER_REGISTRY, normalizeRendererName, resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";

describe("allowlisted Workbench renderer registry", () => {
  it("contains only the proven async and query lifecycle renderers", () => {
    expect(Object.keys(RENDERER_REGISTRY)).toEqual(["async_analysis", "query"]);
    expect(resolveWorkbenchRenderer("async_analysis")).toBeTruthy();
    expect(normalizeRendererName("generic_runner")).toBe("async_analysis");
    expect(resolveWorkbenchRenderer("generic_runner")).toBeTruthy();
    expect(resolveWorkbenchRenderer("query")).toBeTruthy();
  });

  it.each(["search", "informational", "multi_step", "../../module", "https://evil.example", "javascript:alert(1)", "constructor", "prototype", "__proto__"])('rejects unsafe or unimplemented renderer "%s"', renderer => {
    expect(resolveWorkbenchRenderer(renderer)).toBeNull();
    expect(normalizeRendererName(renderer)).toBeNull();
  });
});
