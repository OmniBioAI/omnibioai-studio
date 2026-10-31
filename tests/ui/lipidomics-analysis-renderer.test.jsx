import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LipidomicsAnalysisRenderer from "../../src/ui/components/workbench/LipidomicsAnalysisRenderer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LipidomicsAnalysisRenderer", () => {
  it("renders the supported matrix contract and makes the read-only workflow limitation clear", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plugin: "lipidomics_analysis", read_only: true, operations: ["analyze_lipids"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LipidomicsAnalysisRenderer />);

    expect(await screen.findByText("analyze_lipids")).toBeInTheDocument();
    expect(screen.getAllByText("feature_matrix")).toHaveLength(2);
    expect(screen.getByText(/does not provide a direct upload\/run endpoint/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run|analyze/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/_svc/workbench/plugins/lipidomics_analysis/", expect.objectContaining({
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }));
  });

  it("shows a retry action if the plugin contract is unavailable", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ plugin: "lipidomics_analysis", read_only: true, operations: ["analyze_lipids"] }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<LipidomicsAnalysisRenderer />);

    expect(await screen.findByRole("alert")).toHaveTextContent("offline");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("analyze_lipids")).toBeInTheDocument();
  });
});
