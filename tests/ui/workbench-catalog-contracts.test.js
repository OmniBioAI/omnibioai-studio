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
  it("validates 232 v1 native descriptors, seven v2 queries, and legacy fallbacks", () => {
    const exporter = path.join(source, "scripts/export_workbench_ui_compatibility.py");
    expect(existsSync(exporter)).toBe(true);
    const catalog = JSON.parse(execFileSync(process.env.PYTHON || "python3", ["-B", exporter], {
      cwd: source, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", DJANGO_DEBUG: "true", DJANGO_SETTINGS_MODULE: "omnibioai.settings_test" },
    }));
    expect(catalog.counts).toEqual({ enabled: 501, native: 239, legacy: 262 });
    expect(catalog.plugins).toHaveLength(501);
    const native = catalog.plugins.filter(plugin => plugin.descriptor.native_supported);
    expect(native.filter(plugin => plugin.schema_version === 1)).toHaveLength(232);
    expect(native.filter(plugin => plugin.schema_version === 2).map(plugin => plugin.slug).sort()).toEqual([
      "clinicaltrials_gov", "disease_ontology", "ensembl", "hgnc", "medgen", "mondo", "rcsb_pdb",
    ]);
    expect(native.filter(plugin => plugin.schema_version === 1 && plugin.renderer === "query")).toHaveLength(9);
    expect(native.filter(plugin => plugin.schema_version === 1 && plugin.renderer === "async_analysis").map(plugin => plugin.slug).sort()).toEqual([
      "atlassian", "aws_healthomics", "benchling", "chembl_search", "cloud_integration",
      "dnanexus", "dvc", "elabftw", "figshare", "ga4gh_interoperability", "jupyterhub",
      "knime", "labkey", "pubmed_search",
    ]);
    for (const entry of catalog.plugins) {
      const descriptor = validatePluginDescriptor(entry.descriptor, entry.slug);
      if (!descriptor.native_supported) {
        expect(descriptor.renderer).toBe("legacy");
        continue;
      }
      expect(resolveWorkbenchRenderer(descriptor.renderer), entry.slug).toBeTruthy();
      const inputs = descriptor.operations?.flatMap(operation => operation.inputs) ?? descriptor.inputs;
      for (const input of inputs) {
        expect(resolveWorkbenchComponent(input.component ?? input.widget), `${entry.slug}:${input.id}`).toBeTruthy();
        if (input.id === "hyperparams") expect(input.component ?? input.widget).toBe("textarea");
      }
    }
    expect(native.filter(plugin => plugin.renderer === "informational")).toHaveLength(138);
    for (const held of ["bindingdb", "intact", "dbsnp", "format_converter"]) {
      expect(catalog.plugins.find(entry => entry.slug === held).descriptor.native_supported).toBe(false);
    }
  }, 60000);
});
