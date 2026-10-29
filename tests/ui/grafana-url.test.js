import { describe, expect, it } from "vitest";
import { buildGrafanaUrl } from "../../src/ui/lib/grafanaUrl";

const BASE = "https://studio.example/studio";

describe("buildGrafanaUrl", () => {
  it.each(["light", "dark"])("sets the %s theme and preserves every other dashboard parameter", (theme) => {
    const source = "/_svc/monitor/d/services/services?kiosk=tv&refresh=30s&from=now-1h&to=now&var-service=rag&var-service=lims";
    const result = new URL(buildGrafanaUrl(source, theme, BASE), BASE);

    expect(result.pathname).toBe("/_svc/monitor/d/services/services");
    expect(result.searchParams.get("theme")).toBe(theme);
    expect(result.searchParams.get("kiosk")).toBe("tv");
    expect(result.searchParams.get("refresh")).toBe("30s");
    expect(result.searchParams.get("from")).toBe("now-1h");
    expect(result.searchParams.get("to")).toBe("now");
    expect(result.searchParams.getAll("var-service")).toEqual(["rag", "lims"]);
  });

  it("replaces duplicate existing theme parameters without touching other parameters", () => {
    const result = new URL(buildGrafanaUrl(
      "/_svc/monitor/d/lims/lims?kiosk=tv&theme=light&var-lab=one&theme=dark&x=1",
      "light",
      BASE,
    ), BASE);

    expect(result.searchParams.getAll("theme")).toEqual(["light"]);
    expect([...result.searchParams.entries()].filter(([key]) => key !== "theme")).toEqual([
      ["kiosk", "tv"], ["var-lab", "one"], ["x", "1"],
    ]);
  });

  it("ignores an invalid theme", () => {
    const result = new URL(buildGrafanaUrl(
      "/_svc/monitor/d/rag/rag?kiosk=tv&theme=light&var-source=pubmed",
      "sepia",
      BASE,
    ), BASE);

    expect(result.searchParams.getAll("theme")).toEqual(["light"]);
    expect(result.searchParams.get("kiosk")).toBe("tv");
    expect(result.searchParams.get("var-source")).toBe("pubmed");
  });
});
