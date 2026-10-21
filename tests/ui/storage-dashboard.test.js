import { describe, expect, it } from "vitest";
import { formatStorageBytes, storageSegments } from "../../src/ui/lib/storageDashboard";

describe("decimal storage presentation", () => {
  it.each([[null, "Unavailable"], [0, "0 B"], [999, "999 B"], [1000, "1.0 KB"], [1024, "1.0 KB"], [1_000_000, "1.0 MB"], [1_000_000_000, "1.0 GB"], [20_000_000_000, "20.0 GB"], [100_000_000_000, "100.0 GB"], [1_000_000_000_000, "1.0 TB"], [Number.MAX_SAFE_INTEGER, "9.0 PB"]])("formats %s as %s", (bytes, text) => {
    expect(formatStorageBytes(bytes)).toBe(text);
  });
  it.each([
    [200, 300, 500, 1000, 50, [20, 30, 50]],
    [0, 0, 1000, 1000, 0, [0, 0, 100]],
    [0, 1000, 0, 1000, 100, [0, 100, 0]],
    [1200, 300, 0, 1000, 150, [80, 20, 0]],
    [0, 0, 0, 0, null, [0, 0, 0]],
    [0, 100, 0, 0, null, [0, 100, 0]],
    [200, 300, null, null, null, [40, 60, 0]],
  ])("keeps segments bounded for used=%s reserved=%s available=%s quota=%s", (usedBytes, reservedBytes, availableBytes, quotaBytes, percent, parts) => {
    const result = storageSegments({ usedBytes, reservedBytes, availableBytes, quotaBytes });
    expect(result.percent).toBe(percent);
    expect(result.parts.map(part => part.percent)).toEqual(parts);
    expect(result.parts.reduce((total, part) => total + part.percent, 0)).toBeLessThanOrEqual(100);
  });
});
