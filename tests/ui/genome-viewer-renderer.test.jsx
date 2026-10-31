import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GenomeViewerRenderer from "../../src/ui/components/workbench/GenomeViewerRenderer";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("GenomeViewerRenderer", () => {
  it("loads reference choices and switches among the legacy input modes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ organisms: [{ name: "Human", versions: ["hg38", "hg19"] }] }),
    }));
    const user = userEvent.setup();
    render(<GenomeViewerRenderer />);

    await waitFor(() => expect(screen.getByLabelText("Organism")).toHaveValue("Human"));
    expect(screen.getByLabelText("Reference version")).toHaveValue("hg38");
    expect(screen.getByPlaceholderText("https://…/track.bed.gz")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Paste"));
    expect(screen.getByPlaceholderText(/BED example/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("https://…/track.bed.gz")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Upload"));
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
  });
});
