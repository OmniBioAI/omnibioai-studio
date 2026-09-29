import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import StaticPngResult from "../../src/ui/components/StaticPngResult";

const result = { kind: "static_png", label: "Volcano Plot", alt: "Volcano plot result" };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:result"), revokeObjectURL: vi.fn() });
});

afterEach(() => vi.unstubAllGlobals());

describe("StaticPngResult", () => {
  it("loads an authorized PNG and exposes an accessible figure", async () => {
    fetch.mockResolvedValue({ ok: true, blob: async () => new Blob(["png"], { type: "image/png" }) });
    render(<StaticPngResult renderEndpoint="/_svc/workbench/plugins/volcano_plot/api/render/run-1/" render={result} />);
    expect(await screen.findByRole("img", { name: "Volcano plot result" })).toHaveAttribute("src", "blob:result");
    expect(screen.getByText("Volcano Plot")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/_svc/workbench/plugins/volcano_plot/api/render/run-1/", {
      credentials: "same-origin", headers: { Accept: "image/png" },
    });
  });

  it("reports a failed render without rendering arbitrary content", async () => {
    fetch.mockResolvedValue({ ok: false, status: 403 });
    render(<StaticPngResult renderEndpoint="/render/" render={result} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load the result image.");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("does not fetch when no backend result is present", async () => {
    render(<StaticPngResult renderEndpoint="/render/" render={null} />);
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
  });
});
