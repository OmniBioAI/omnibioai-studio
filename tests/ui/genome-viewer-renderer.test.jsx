import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GenomeViewerRenderer from "../../src/ui/components/workbench/GenomeViewerRenderer";

afterEach(() => {
  cleanup(); vi.unstubAllGlobals();
  document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  delete globalThis.igv;
});

function json(body, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 400, json: async () => body });
}

function stubWorkbench(tracksResponse) {
  const fetch = vi.fn((url, init = {}) => {
    if (String(url).endsWith("/reference/")) return json({ organisms: [{ name: "Human", versions: ["hg38"] }] });
    if (String(url).endsWith("/tracks/") && init.method === "POST") return json(tracksResponse);
    return json({ objects: [] });
  });
  vi.stubGlobal("fetch", fetch);
  const createBrowser = vi.fn(async () => ({ dispose: vi.fn(), loadTrack: vi.fn(), search: vi.fn() }));
  globalThis.igv = { createBrowser };
  return { fetch, createBrowser };
}

const STAGED = "/plugins/genome_viewer/api/staged/paste/0123456789abcdef0123456789abcdef.bed";

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

  it("sends the CSRF token on the paste POST and loads staged tracks through /_svc/workbench", async () => {
    document.cookie = "csrftoken=tok%2B123; path=/";
    const { fetch, createBrowser } = stubWorkbench({
      locus: "chr1:1-10", tracks: [{ name: "BED track", type: "annotation", format: "bed", url: STAGED }],
    });
    const user = userEvent.setup();
    render(<GenomeViewerRenderer />);
    await waitFor(() => expect(screen.getByLabelText("Reference version")).toHaveValue("hg38"));
    await user.click(screen.getByLabelText("Paste"));
    await user.type(screen.getByPlaceholderText(/BED example/), "chr1 1 10");
    await user.click(screen.getByRole("button", { name: /Visualize track/ }));

    await waitFor(() => expect(createBrowser).toHaveBeenCalled());
    const [, init] = fetch.mock.calls.find(([url, i]) => String(url).endsWith("/tracks/") && i?.method === "POST");
    expect(init.headers["X-CSRFToken"]).toBe("tok+123");
    expect(init.credentials).toBe("same-origin");
    const options = createBrowser.mock.calls[0][1];
    expect(options.tracks[0].url).toBe(`/_svc/workbench${STAGED}`);
  });

  it("sends the CSRF token on the upload POST", async () => {
    document.cookie = "csrftoken=up-tok; path=/";
    const { fetch } = stubWorkbench({ locus: "", tracks: [{ name: "BED track", url: STAGED.replace("paste", "uploads") }] });
    const user = userEvent.setup();
    render(<GenomeViewerRenderer />);
    await waitFor(() => expect(screen.getByLabelText("Reference version")).toHaveValue("hg38"));
    await user.click(screen.getByLabelText("Upload"));
    await user.upload(document.querySelector('input[type="file"]'), new File(["chr1\t1\t10\n"], "t.bed"));
    await user.click(screen.getByRole("button", { name: /Visualize track/ }));

    await waitFor(() => expect(fetch.mock.calls.some(([url, i]) => String(url).endsWith("/tracks/") && i?.method === "POST")).toBe(true));
    const [, init] = fetch.mock.calls.find(([url, i]) => String(url).endsWith("/tracks/") && i?.method === "POST");
    expect(init.headers["X-CSRFToken"]).toBe("up-tok");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers["Content-Type"]).toBeUndefined();
  });

  it("leaves https link-mode track URLs unchanged", async () => {
    const link = "https://example.org/genes.bed.gz";
    const { createBrowser } = stubWorkbench({ locus: "", tracks: [{ name: "BED track", url: link }] });
    const user = userEvent.setup();
    render(<GenomeViewerRenderer />);
    await waitFor(() => expect(screen.getByLabelText("Reference version")).toHaveValue("hg38"));
    await user.click(screen.getByRole("button", { name: /Visualize track/ }));
    await waitFor(() => expect(createBrowser).toHaveBeenCalled());
    expect(createBrowser.mock.calls[0][1].tracks[0].url).toBe(link);
  });
});

