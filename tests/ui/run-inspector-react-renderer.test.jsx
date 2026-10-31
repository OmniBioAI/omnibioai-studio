import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { nativePluginRequest } = vi.hoisted(() => ({ nativePluginRequest: vi.fn() }));
vi.mock("../../src/ui/lib/nativePluginApi", () => ({ nativePluginRequest }));

import RunInspectorReactRenderer from "../../src/ui/components/workbench/RunInspectorReactRenderer";

afterEach(cleanup);

describe("Run Inspector historical UI React equivalent", () => {
  beforeEach(() => {
    nativePluginRequest.mockReset();
    nativePluginRequest.mockImplementation(async path => {
      if (path.startsWith("/plugins/run_inspector/api/runs/?")) return { items: [
        { run_id: "run-a", plugin_slug: "rnaseq", mtime: 1793400000 },
        { run_id: "run-b", plugin_slug: "rnaseq", mtime: 1793401000 },
      ] };
      if (path.endsWith("/lineage/")) return { inputs: ["input-object"], outputs: ["output-object"] };
      if (path.endsWith("/diff/?a=run-a&b=run-b")) return {
        run_a: "run-a", run_b: "run-b",
        metadata_diff: { changed: { seed: { a: 1, b: 2 } } },
        file_diff: { added: ["result.tsv"], removed: [], size_changed: [] },
      };
      if (path.endsWith("/diff/explain/")) return { explanation: "The seed changed between runs." };
      if (path.includes("/objects/")) return { object_id: "input-object", status: "available" };
      return { run_id: path.includes("run-b") ? "run-b" : "run-a", plugin_slug: "rnaseq", metadata: { seed: 42 }, files: [
        { relpath: "result.tsv", size_h: "2 KB" },
      ] };
    });
  });

  it("loads a selected run, its files and OmniObject lineage", async () => {
    render(<RunInspectorReactRenderer />);
    expect(await screen.findByText("Run Inspector")).toBeInTheDocument();
    expect(await screen.findByText("OmniObject Lineage")).toBeInTheDocument();
    expect(await screen.findByText("input-object")).toBeInTheDocument();
    expect(await screen.findByText("result.tsv")).toBeInTheDocument();
    expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/run_inspector/api/runs/?limit=250");
  });

  it("compares two runs and requests an AI explanation", async () => {
    render(<RunInspectorReactRenderer />);
    fireEvent.click(await screen.findByRole("button", { name: "Compare Runs" }));
    fireEvent.click(await screen.findByRole("button", { name: "Compare", exact: true }));
    expect(await screen.findByText(/compared with/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI Explain Differences" }));
    expect(await screen.findByText("The seed changed between runs.")).toBeInTheDocument();
    expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/run_inspector/api/runs/diff/?a=run-a&b=run-b");
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/run_inspector/api/runs/diff/explain/", {
      method: "POST", body: { a: "run-a", b: "run-b" },
    }));
  });
});
