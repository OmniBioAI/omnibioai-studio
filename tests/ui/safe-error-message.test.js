import { describe, expect, it } from "vitest";
import { safeErrorMessage } from "../../src/ui/lib/safeErrorMessage";

describe("safeErrorMessage", () => {
  it("maps known status codes to safe messages without exposing server details", () => {
    expect(safeErrorMessage({ status: 401, message: "private auth detail" })).toMatch(/session has expired/i);
    expect(safeErrorMessage({ status: 403, message: "private policy detail" })).toMatch(/permission/i);
    expect(safeErrorMessage({ status: 503, message: "db password leaked" })).toMatch(/temporarily unavailable/i);
    expect(safeErrorMessage({ status: 503, message: "db password leaked" })).not.toContain("db password");
  });

  it("uses a caller-provided safe fallback for unknown failures", () => {
    expect(safeErrorMessage(new Error("backend traceback"), "Could not load jobs."))
      .toBe("Could not load jobs.");
  });
});
