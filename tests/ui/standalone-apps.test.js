import { describe, expect, it } from "vitest";
import { getStandaloneOnlyApp, standaloneAppUrl } from "../../src/ui/lib/standaloneApps";

describe("standalone-only app routing", () => {
  it("matches only the exact Admin Console origin, including its deep paths", () => {
    expect(getStandaloneOnlyApp("https://admin.omnibioai.org/iam/service-accounts")?.label).toBe("Admin Console");
    expect(getStandaloneOnlyApp("https://admin.omnibioai.org.evil.test/")).toBeNull();
    expect(getStandaloneOnlyApp("https://evil.test/?next=https://admin.omnibioai.org/")).toBeNull();
    expect(getStandaloneOnlyApp("/_svc/control/")).toBeNull();
  });

  it("keeps the admin path but strips query data before adding the appearance preference", () => {
    expect(standaloneAppUrl("https://admin.omnibioai.org/iam?token=secret", "light"))
      .toBe("https://admin.omnibioai.org/iam?obai_theme=light");
    expect(new URL(standaloneAppUrl("https://admin.omnibioai.org/", "unknown")).searchParams.get("obai_theme"))
      .toBe("dark");
  });
});
