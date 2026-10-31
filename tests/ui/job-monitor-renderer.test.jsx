import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import JobMonitorRenderer from "../../src/ui/components/workbench/JobMonitorRenderer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(payload) {
  return { ok: true, json: async () => payload };
}

describe("Job Monitor React renderer", () => {
  it("lists runs, opens details, and polls list and detail endpoints", async () => {
    const fetch = vi.fn(async url => {
      if (url.endsWith("/api/runs/")) {
        return jsonResponse({ runs: [{ run_id: "run-1", plugin: "fastq_qc", state: "RUNNING", created_at: "now" }] });
      }
      if (url.includes("/detail/")) {
        return jsonResponse({
          status: { run_id: "run-1", plugin: "fastq_qc", state: "RUNNING", steps: [] },
          run: { parameters: { threads: 4 } },
          artifacts: { outputs: [{ label: "report.json" }] },
        });
      }
      if (url.includes("/logs/")) return jsonResponse({ logs: ["started"] });
      if (url.includes("/artifacts/")) return jsonResponse({ outputs: [{ label: "report.json" }] });
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();

    render(<JobMonitorRenderer />);
    await screen.findByText("run-1");
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByText(/Run details · run-1/);
    await waitFor(() => expect(screen.getByText("started")).toBeInTheDocument());
    expect(screen.getByText(/report\.json/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/_svc/workbench/plugins/job_monitor/api/runs/"),
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(fetch.mock.calls.some(([url]) => String(url).includes("api/run/run-1/detail/"))).toBe(true);
    expect(screen.getByText(/threads/)).toBeInTheDocument();
  });
});
