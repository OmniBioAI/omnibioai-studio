import { afterEach, describe, expect, it, vi } from "vitest";
import { HEALTH_STATES, getServiceHealth, refreshServiceHealth, setServiceHealth } from "../../src/ui/lib/serviceHealth";

afterEach(() => { vi.unstubAllGlobals(); delete window.api; });

describe("service health source", () => {
  it("exposes exactly the canonical states and requires a reason", () => {
    expect(HEALTH_STATES).toEqual(["up", "down", "degraded", "unknown"]);
    expect(() => setServiceHealth("test", "up", "")).toThrow("reason");
    expect(() => setServiceHealth("test", "starting", "Starting")).toThrow("Invalid health state");
  });

  it("stores a typed state and its reason together", () => {
    setServiceHealth("test", "degraded", "A dependency is still starting.");
    expect(getServiceHealth("test")).toEqual({ state: "degraded", reason: "A dependency is still starting." });
  });

  it("records the endpoint result and reason, including an unreachable endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response("", { status: 503 })));
    await refreshServiceHealth(["auth-service", "api-gateway"]);
    expect(getServiceHealth("auth-service")).toEqual({ state: "down", reason: "Health endpoint responded with HTTP 503." });
    expect(getServiceHealth("api-gateway")).toEqual({ state: "unknown", reason: "The health endpoint could not be reached." });
  });

  it("keeps a missing desktop report unknown", async () => {
    window.api = { checkHealth: vi.fn().mockResolvedValue({ mysql: true }) };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await refreshServiceHealth(["mysql", "redis"]);
    expect(getServiceHealth("mysql").state).toBe("up");
    expect(getServiceHealth("redis")).toEqual({ state: "unknown", reason: "The desktop health check did not report this service." });
  });
});
