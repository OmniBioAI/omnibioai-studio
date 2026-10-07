import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validatePluginDescriptor } from "../../src/ui/lib/pluginApi";
import { resolveWorkbenchRenderer } from "../../src/ui/components/workbench/rendererRegistry";
import { resolveWorkbenchComponent } from "../../src/ui/components/workbench/componentRegistry";

// Cross-repository check: generate from actual Django registry state, never a
// hand-maintained copy of 501 manifests. Opt in where the backend is available.
const source = process.env.WORKBENCH_SOURCE;
const enabled = Boolean(source);
describe.skipIf(!enabled)("generated Workbench catalog compatibility", () => {
  it("validates all 129 original native descriptors, two proofs, and legacy fallbacks", () => {
    const exporter = path.join(source, "scripts/export_workbench_ui_compatibility.py");
    expect(existsSync(exporter)).toBe(true);
    const catalog = JSON.parse(execFileSync(process.env.PYTHON || "python3", ["-B", exporter], {
      cwd: source, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", DJANGO_DEBUG: "true", DJANGO_SETTINGS_MODULE: "omnibioai.settings_test" },
    }));
    expect(catalog.counts).toEqual({ enabled: 501, native: 131, legacy: 370 });
    expect(catalog.plugins).toHaveLength(501);
    const native = catalog.plugins.filter(plugin => plugin.descriptor.native_supported);
    expect(native.filter(plugin => plugin.schema_version === 1)).toHaveLength(129);
    expect(native.filter(plugin => plugin.schema_version === 2).map(plugin => plugin.slug).sort()).toEqual(["ensembl", "rcsb_pdb"]);
    expect(native.filter(plugin => plugin.schema_version === 1 && plugin.renderer === "query")).toHaveLength(9);
    for (const entry of catalog.plugins) {
      const descriptor = validatePluginDescriptor(entry.descriptor, entry.slug);
      if (!descriptor.native_supported) {
        expect(descriptor.renderer).toBe("legacy");
        continue;
      }
      expect(resolveWorkbenchRenderer(descriptor.renderer), entry.slug).toBeTruthy();
      for (const input of descriptor.inputs) {
        expect(resolveWorkbenchComponent(input.component ?? input.widget), `${entry.slug}:${input.id}`).toBeTruthy();
        if (input.id === "hyperparams") expect(input.component ?? input.widget).toBe("textarea");
      }
    }
    for (const held of ["intact", "dbsnp"]) expect(catalog.plugins.find(entry => entry.slug === held).descriptor.native_supported).toBe(false);
  }, 60000);
});
