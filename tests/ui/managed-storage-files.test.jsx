import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  listManagedObjects: vi.fn(), uploadManagedFile: vi.fn(),
  downloadManagedObject: vi.fn(), deleteManagedObject: vi.fn(),
}));
vi.mock("../../src/ui/lib/managedStorageApi", () => api);
vi.mock("../../src/ui/lib/session", () => ({
  getSessionVersion: () => 1,
  onSessionChange: () => () => {},
}));

import ManagedStorageFiles from "../../src/ui/components/ManagedStorageFiles";

const stored = [{ objectId: "receipt-1", filename: "sample.vcf", sizeBytes: 20,
  sha256: "a".repeat(64), downloadable: true }];

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("managed storage files", () => {
  it("uploads a selected file through the API and refreshes the receipt list", async () => {
    api.listManagedObjects.mockResolvedValueOnce([]).mockResolvedValueOnce(stored);
    api.uploadManagedFile.mockResolvedValue({ objectId: "receipt-1", status: "available" });
    render(<ManagedStorageFiles />);
    fireEvent.click(screen.getByRole("button", { name: "Manage files" }));
    await screen.findByText("No managed files are available.");
    const file = new File(["test payload"], "sample.vcf", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload file" }));
    expect(await screen.findByText("Upload complete. Receipt receipt-1.")).toBeInTheDocument();
    expect(api.uploadManagedFile).toHaveBeenCalledWith(file, expect.objectContaining({
      idempotencyKey: expect.any(String), onProgress: expect.any(Function),
    }));
    await screen.findByText("sample.vcf");
    expect(api.listManagedObjects).toHaveBeenCalledTimes(2);
  });

  it("shows safe quota errors and preserves the same idempotency key for retry", async () => {
    api.listManagedObjects.mockResolvedValue([]);
    const quotaError = Object.assign(new Error("quota"), { code: "quota_exceeded" });
    api.uploadManagedFile.mockRejectedValueOnce(quotaError).mockResolvedValueOnce({ objectId: "receipt-1", status: "available" });
    render(<ManagedStorageFiles />);
    fireEvent.click(screen.getByRole("button", { name: "Manage files" }));
    await screen.findByText("No managed files are available.");
    const file = new File(["data"], "large.fastq");
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload file" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("exceeds the available storage allowance");
    fireEvent.click(screen.getByRole("button", { name: "Retry upload" }));
    await waitFor(() => expect(api.uploadManagedFile).toHaveBeenCalledTimes(2));
    expect(api.uploadManagedFile.mock.calls[0][1].idempotencyKey)
      .toBe(api.uploadManagedFile.mock.calls[1][1].idempotencyKey);
  });

  it("lists server metadata and requires confirmation before deletion", async () => {
    api.listManagedObjects.mockResolvedValue(stored);
    api.deleteManagedObject.mockResolvedValue({ status: "deleted" });
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<ManagedStorageFiles />);
    fireEvent.click(screen.getByRole("button", { name: "Manage files" }));
    expect(await screen.findByText("sample.vcf")).toBeInTheDocument();
    expect(screen.getByText(new RegExp("SHA-256"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(window.confirm).toHaveBeenCalledWith("Delete sample.vcf? This cannot be undone.");
    expect(api.deleteManagedObject).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
