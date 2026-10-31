import { describe, expect, it } from "vitest";
import { resolveWorkbenchPluginDeepLink } from "../../src/ui/lib/pluginDeepLink";

describe("Workbench plugin deep links", () => {
  it("opens a validated plugin in Studio's React workbench page", () => {
    expect(resolveWorkbenchPluginDeepLink("?plugin=clinical_data_quality_validator")).toEqual({
      url: "/_svc/workbench/plugins/clinical_data_quality_validator/",
      label: "Clinical Data Quality Validator",
      source: "workbench",
      pluginSlug: "clinical_data_quality_validator",
      backLabel: "Back to Studio",
    });
  });

  it.each([
    "",
    "?plugin=",
    "?plugin=../admin",
    "?plugin=Plugin-With-Caps",
    "?plugin=plugin&plugin=other",
  ])("rejects malformed or ambiguous plugin deep link %s", search => {
    expect(resolveWorkbenchPluginDeepLink(search)).toBeNull();
  });
});
