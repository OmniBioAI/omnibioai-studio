import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { nativePluginRequest } = vi.hoisted(() => ({ nativePluginRequest: vi.fn() }));
vi.mock("../../src/ui/lib/nativePluginApi", () => ({ nativePluginRequest }));

import HistopathologyCVRenderer from "../../src/ui/components/workbench/HistopathologyCVRenderer";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => {
  nativePluginRequest.mockImplementation(path => path.includes("ui-query")
    ? Promise.resolve({ results: [
      { object_id: "image-object-1", object_type: "histology_image", status: "ready", bytes: 2048 },
    ], total_hits: 1 })
    : Promise.resolve({ status: "ok", outputs: {
      input_object_id: "image-object-1", mask_object_id: "mask-1", overlay_object_id: "overlay-1",
      summary_object_id: "summary-1", mask_path: "/private/mask.png", overlay_path: "/private/overlay.png",
      summary: { mask_positive_fraction: 0.25 },
    } }));
});

describe("Histopathology CV React workspace", () => {
  it("loads image objects, runs segmentation, and presents safe object results", async () => {
    render(<HistopathologyCVRenderer />);
    expect(await screen.findByRole("option", { name: /histology_image/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Threshold/), { target: { value: "120" } });
    fireEvent.click(screen.getByLabelText("Invert segmentation mask"));
    fireEvent.click(screen.getByRole("button", { name: "Run segmentation" }));

    expect(await screen.findByText("mask-1")).toBeInTheDocument();
    expect(screen.getByText("25.00%")).toBeInTheDocument();
    expect(screen.queryByText("/private/mask.png")).not.toBeInTheDocument();
    expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/histopathology_cv/api/segment/", {
      method: "POST", body: { input_object_id: "image-object-1", threshold: 120, invert: true },
    });
  });

  it("validates threshold bounds before submitting", async () => {
    render(<HistopathologyCVRenderer />);
    await screen.findByRole("option", { name: /histology_image/ });
    fireEvent.change(screen.getByLabelText(/Threshold/), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Run segmentation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Threshold must be between 0 and 255");
    expect(nativePluginRequest).toHaveBeenCalledTimes(1);
  });

  it("communicates the empty image catalog", async () => {
    nativePluginRequest.mockResolvedValueOnce({ results: [], total_hits: 0 });
    render(<HistopathologyCVRenderer />);
    await waitFor(() => expect(screen.getByText(/No image OmniObjects found/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Run segmentation" })).toBeDisabled();
  });
});
