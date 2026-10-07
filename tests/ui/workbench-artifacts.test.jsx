import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ArtifactDownload from "../../src/ui/components/workbench/results/ArtifactDownload";
import ArtifactList, { formatSize } from "../../src/ui/components/workbench/results/ArtifactList";
import { pluginArtifactDownloadUrl } from "../../src/ui/lib/pluginApi";
import { validateArtifactPayload } from "../../src/ui/lib/pluginUiContracts";

const artifactId = `art_${"A".repeat(43)}`;
const artifact = {
  artifact_id: artifactId,
  display_name: "single_cell_cluster_markers_condition_2_vs_21.tsv",
  label: "Cluster markers",
  media_type: "text/tab-separated-values",
  size_bytes: 1536,
  kind: "table",
};

describe("finite artifact runtime contract", () => {
  it("accepts exact safe metadata and rejects paths, URLs, callbacks, HTML metadata, and duplicate IDs", () => {
    expect(validateArtifactPayload({ artifacts: [artifact] })).toEqual([artifact]);
    expect(validateArtifactPayload({ artifacts: [artifact], render: { kind: "static_png" } })).toEqual([artifact]);
    for (const extra of [
      { path: "/srv/private.tsv" },
      { download_url: "https://storage.example/private" },
      { signed_url: "https://storage.example/?token=secret" },
      { object_key: "tenant/run/private.tsv" },
      { callback: "javascript:alert(1)" },
      { html: "<script>alert(1)</script>" },
    ]) {
      expect(() => validateArtifactPayload({ artifacts: [{ ...artifact, ...extra }] })).toThrow("Invalid artifact response");
    }
    expect(() => validateArtifactPayload({ artifacts: [artifact, artifact] })).toThrow("Invalid artifact response");
  });

  it.each([
    [{ ...artifact, artifact_id: "../secret" }],
    [{ ...artifact, display_name: "../secret.tsv" }],
    [{ ...artifact, display_name: "bad\\name.tsv" }],
    [{ ...artifact, media_type: "text/html; script=x" }],
    [{ ...artifact, size_bytes: -1 }],
    [{ ...artifact, size_bytes: Number.POSITIVE_INFINITY }],
    [{ ...artifact, kind: "html" }],
  ])("rejects malformed artifact metadata %#", invalid => {
    expect(() => validateArtifactPayload({ artifacts: invalid })).toThrow("Invalid artifact response");
  });

  it("enforces the descriptor bound", () => {
    expect(() => validateArtifactPayload({ artifacts: [artifact] }, 0)).toThrow();
    expect(() => validateArtifactPayload({ artifacts: [artifact, { ...artifact, artifact_id: `art_${"B".repeat(43)}` }] }, 1)).toThrow();
  });
});

describe("ArtifactList and ArtifactDownload", () => {
  it("renders long scientific metadata without raw HTML and uses only the fixed same-origin operation", async () => {
    const user = userEvent.setup();
    render(<ArtifactList artifacts={[{ ...artifact, label: "<img src=x onerror=alert(1)>" }]} pluginSlug="deseq2_analysis" runId="run-1" />);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(artifact.display_name)).toBeInTheDocument();
    expect(screen.getByText("1.5 KiB")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: `Download ${artifact.display_name}` });
    expect(link).toHaveAttribute("download");
    expect(link).toHaveAttribute("href", `/_svc/workbench/plugins/deseq2_analysis/api/ui-artifacts/run-1/${artifactId}/download/`);
    await user.tab();
    expect(link).toHaveFocus();
  });

  it("provides meaningful loading, empty, and error states", () => {
    const { rerender } = render(<ArtifactList loading pluginSlug="pilot" runId="run-1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading artifacts");
    rerender(<ArtifactList artifacts={[]} pluginSlug="pilot" runId="run-1" />);
    expect(screen.getByRole("status")).toHaveTextContent("without published artifacts");
    rerender(<ArtifactList error="Unable to read artifacts." pluginSlug="pilot" runId="run-1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to read artifacts");
  });

  it("renders malformed identity as unavailable instead of constructing an href", () => {
    render(<ArtifactDownload pluginSlug="pilot" runId="run-1" artifact={{ ...artifact, artifact_id: "https://evil.example" }} />);
    expect(screen.getByText("Download unavailable")).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("rejects attacker-controlled plugin, run, and artifact path material", () => {
    for (const values of [
      ["../plugin", "run-1", artifactId],
      ["pilot", "../run", artifactId],
      ["pilot", "run-1", "../../secret"],
      ["pilot", "run-1", "https://evil.example"],
    ]) expect(() => pluginArtifactDownloadUrl(...values)).toThrow("Invalid artifact identity");
  });

  it("formats finite byte sizes without a dependency", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(1024)).toBe("1.0 KiB");
    expect(formatSize(10 * 1024 * 1024)).toBe("10 MiB");
  });
});
