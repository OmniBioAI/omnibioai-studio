import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { nativePluginRequest } = vi.hoisted(() => ({ nativePluginRequest: vi.fn() }));
vi.mock("../../src/ui/lib/nativePluginApi", () => ({ nativePluginRequest }));
import OpenBabelReactRenderer from "../../src/ui/components/workbench/OpenBabelReactRenderer";

afterEach(() => { cleanup(); nativePluginRequest.mockReset(); });

describe("Open Babel React workbench", () => {
  it("checks engine health and submits explicit conversion parameters", async () => {
    nativePluginRequest.mockImplementation(async (path, options) => {
      if (path.endsWith("/health/")) return { available: true, version: "3.1.1", engine: "Open Babel CLI", supported_formats: ["smi", "sdf"] };
      if (path.endsWith("/convert_structure/")) return { success: true, output: "CCO", output_format: "smiles", engine: "openbabel", warnings: [] };
      return {};
    });
    render(<OpenBabelReactRenderer />);
    expect(await screen.findByText("Engine ready · 3.1.1")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Output format"), { target: { value: "smiles" } });
    fireEvent.click(screen.getByRole("button", { name: /Run Convert/ }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/openbabel/api/actions/convert_structure/", {
      method: "POST", body: { structure: "CCO", input_format: "smiles", output_format: "smiles" },
    }));
    expect(await screen.findByText("CCO", { selector: "pre" })).toBeTruthy();
  });

  it("sends file conversion as multipart data rather than JSON", async () => {
    nativePluginRequest.mockImplementation(async (path) => path.endsWith("/health/") ? { available: true } : { output: "CCO", engine: "openbabel" });
    render(<OpenBabelReactRenderer />);
    const file = new File(["CCO ethanol"], "ethanol.smi", { type: "text/plain" });
    fireEvent.click(screen.getByRole("button", { name: "File conversion" }));
    fireEvent.change(screen.getByLabelText("Structure file"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /Run conversion/ }));
    await waitFor(() => {
      const call = nativePluginRequest.mock.calls.find(([path]) => path.endsWith("/convert-file/"));
      expect(call).toBeTruthy();
      expect(call[1].body).toBeInstanceOf(FormData);
      expect(call[1].body.get("file")).toBe(file);
      expect(call[1].body.get("input_format")).toBe("smiles");
      expect(call[1].body.get("output_format")).toBe("sdf");
    });
  });
});
