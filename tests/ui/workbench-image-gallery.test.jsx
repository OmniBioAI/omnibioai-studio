import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ImageGallery, { imageArtifacts } from "../../src/ui/components/workbench/results/ImageGallery";
import PluginResults from "../../src/ui/components/PluginResults";

const plot = (overrides = {}) => ({
  artifact_id: `art_${"A".repeat(43)}`,
  display_name: "qc_violin.png",
  label: "QC Violin Plot",
  media_type: "image/png",
  size_bytes: 2048,
  kind: "plot",
  ...overrides,
});

const table = {
  artifact_id: `art_${"B".repeat(43)}`,
  display_name: "results.tsv",
  label: "Results table",
  media_type: "text/tab-separated-values",
  size_bytes: 512,
  kind: "table",
};

describe("ImageGallery", () => {
  it("renders only server-authorized plot/image artifacts, each with a caption and a download link", () => {
    const second = plot({ artifact_id: `art_${"C".repeat(43)}`, display_name: "qc_scatter.png", label: "QC Scatter Plot" });
    render(<ImageGallery artifacts={[plot(), second, table]} pluginSlug="scanpy_qc_metrics" runId="run-1" />);
    expect(screen.getByRole("list", { name: "Result images" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.getByAltText("QC Violin Plot")).toHaveAttribute(
      "src", "/_svc/workbench/plugins/scanpy_qc_metrics/api/ui-artifacts/run-1/art_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/download/",
    );
    expect(screen.getByAltText("QC Violin Plot")).toHaveAttribute("loading", "lazy");
    expect(screen.getAllByRole("link", { name: /Download/ })).toHaveLength(2);
    // The non-image table artifact is never pulled into the gallery.
    expect(screen.queryByAltText("Results table")).not.toBeInTheDocument();
  });

  it("renders nothing while loading, on error, or when there are no image artifacts", () => {
    const { rerender } = render(<ImageGallery artifacts={[plot()]} pluginSlug="p" runId="r" loading />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    rerender(<ImageGallery artifacts={[plot()]} pluginSlug="p" runId="r" error="Unable to load artifacts." />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    rerender(<ImageGallery artifacts={[table]} pluginSlug="p" runId="r" />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    rerender(<ImageGallery artifacts={[]} pluginSlug="p" runId="r" />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("rejects a plot-kind artifact whose media type is not an image", () => {
    const fakePlot = plot({ media_type: "application/pdf" });
    render(<ImageGallery artifacts={[fakePlot]} pluginSlug="p" runId="r" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("falls back to an inert unavailable state for a malformed artifact identity instead of constructing a broken src", () => {
    render(<ImageGallery artifacts={[plot({ artifact_id: "https://evil.example" })]} pluginSlug="p" runId="r" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Image unavailable")).toHaveAttribute("aria-disabled", "true");
  });

  it("renders long scientific captions in full, without truncation", () => {
    const longLabel = "QC Violin Plot — sample_cohort_2026_batch_014_resequenced_lane_09_mt_pct_counts";
    render(<ImageGallery artifacts={[plot({ label: longLabel })]} pluginSlug="p" runId="r" />);
    expect(screen.getByText(longLabel)).toBeInTheDocument();
    expect(screen.getByAltText(longLabel)).toBeInTheDocument();
  });

  it("keeps the download link keyboard reachable", async () => {
    render(<ImageGallery artifacts={[plot()]} pluginSlug="p" runId="r" />);
    await userEvent.setup().tab();
    expect(screen.getByRole("link", { name: /Download/ })).toHaveFocus();
  });

  it("filters a mixed artifact list with the exported pure helper", () => {
    expect(imageArtifacts([plot(), table, null, undefined])).toEqual([plot()]);
    expect(imageArtifacts(undefined)).toEqual([]);
  });
});

describe("PluginResults composition", () => {
  it("shows the gallery above the full downloadable artifact list, never replacing it", () => {
    render(<PluginResults artifacts={[plot(), table]} pluginSlug="scanpy_qc_metrics" runId="run-1" />);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    // The plot artifact still appears in the regular list too (by its filename).
    expect(screen.getByText("qc_violin.png")).toBeInTheDocument();
    expect(screen.getByText("results.tsv")).toBeInTheDocument();
  });
});
