import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelOrchestratorRun,
  loadOrchestratorRuns,
  loadOrchestratorStatus,
  submitOrchestratorRun,
} from "../../src/ui/lib/orchestratorApi";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(payload) };
}

describe("orchestrator API", () => {
  it("uses the plugin-local authenticated JSON endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, result: { run_id: "r1" } }))
      .mockResolvedValueOnce(response({ state: "RUNNING" }))
      .mockResolvedValueOnce(response({ runs: [] }))
      .mockResolvedValueOnce(response({ result: { state: "CANCELLED" } }));
    vi.stubGlobal("fetch", fetchMock);

    await submitOrchestratorRun({ dag: { steps: [{}] }, modelName: "model" });
    await loadOrchestratorStatus("r1");
    await loadOrchestratorRuns();
    await cancelOrchestratorRun("r1");

    expect(fetchMock.mock.calls[0][0]).toContain("/plugins/multi_agent_bio_orchestrator/api/run/");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(fetchMock.mock.calls[1][0]).toContain("/api/status/r1/");
    expect(fetchMock.mock.calls[2][0]).toContain("/api/runs/");
    expect(fetchMock.mock.calls[3][0]).toContain("/api/cancel/r1/");
  });

  it("rejects unsafe run identifiers before issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(() => loadOrchestratorStatus("../../outside")).toThrow("Invalid orchestrator run identifier");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
