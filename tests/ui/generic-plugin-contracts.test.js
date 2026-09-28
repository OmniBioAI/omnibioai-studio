import { describe, expect, it } from "vitest";
import { ALL_GENERIC_PLUGIN_SLUGS, CURRENT_NATIVE_PILOTS, GENERIC_PLUGIN_CONTRACTS, NORMALIZATION_REQUIRED } from "./generic-plugin-contracts";

describe("validated GenericPluginRunner contract fixtures", () => {
  it("represents all 35 plugin_runner entries through async_analysis", () => {
    expect(ALL_GENERIC_PLUGIN_SLUGS).toHaveLength(35);
    expect(new Set(ALL_GENERIC_PLUGIN_SLUGS).size).toBe(35);
    expect(GENERIC_PLUGIN_CONTRACTS).toHaveLength(35);
    for (const contract of GENERIC_PLUGIN_CONTRACTS) {
      expect(contract.renderer).toBe("async_analysis");
      expect(contract.capabilities).toEqual({ submit: true, status: true, logs: true, artifacts: true, downloads: true });
      expect(contract.inputs.map(input => input.component)).toEqual(["file"]);
      expect(contract.normalization_required).toBe(NORMALIZATION_REQUIRED.has(contract.slug));
    }
  });

  it("keeps schema compatibility separate from native enablement", () => {
    expect(CURRENT_NATIVE_PILOTS.size).toBe(35);
    expect(NORMALIZATION_REQUIRED.size).toBe(18);
    expect(GENERIC_PLUGIN_CONTRACTS.filter(contract => contract.native_supported)).toHaveLength(35);
    expect(GENERIC_PLUGIN_CONTRACTS.filter(contract => contract.normalization_complete)).toHaveLength(35);
    expect(GENERIC_PLUGIN_CONTRACTS.filter(contract => contract.normalization_required && contract.normalization_complete)).toHaveLength(18);
  });
});
