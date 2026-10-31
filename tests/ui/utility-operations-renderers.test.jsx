import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { nativePluginRequest } = vi.hoisted(() => ({ nativePluginRequest: vi.fn() }));
vi.mock("../../src/ui/lib/nativePluginApi", () => ({ nativePluginRequest }));

import {
  ChecksumIntegrityReactRenderer,
  FileTransferReactRenderer,
  JobQueueReactRenderer,
  MultiQcReactRenderer,
  PdfReportBuilderReactRenderer,
  StorageQuotaReactRenderer,
} from "../../src/ui/components/workbench/UtilityOperationsRenderers";

afterEach(() => { cleanup(); nativePluginRequest.mockReset(); });

describe("storage quota React workflow", () => {
  it("switches among live storage reports", async () => {
    nativePluginRequest.mockImplementation(async path => path.endsWith("/summary/")
      ? { total_bytes: 2048 } : { records: [{ name: "research-data" }] });
    render(<StorageQuotaReactRenderer />);
    expect(await screen.findByText(/total_bytes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Largest datasets" }));
    expect(await screen.findByText("research-data")).toBeTruthy();
    expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/storage_quota_manager/api/usage/largest-datasets/");
  });
});

describe("job queue React workflow", () => {
  it("loads jobs and sends an authorized cancel request", async () => {
    nativePluginRequest.mockImplementation(async (path, options) => {
      if (path.endsWith("/jobs?limit=100")) return { jobs: [{ job_id: "job-123", state: "queued" }] };
      if (path.endsWith("/queues")) return { queues: [] };
      if (path.endsWith("/health")) return { status: "ok" };
      return { job: { job_id: "job-123", state: "cancelled" } };
    });
    render(<JobQueueReactRenderer />);
    expect(await screen.findByText("job-123")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel job job-123" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/job_queue_manager/api/jobs/job-123/cancel", { method: "POST", body: {} }));
  });
});

describe("file transfer React workflow", () => {
  it("filters the transfer list and calls the selected lifecycle action", async () => {
    nativePluginRequest.mockImplementation(async (path, options) => path.includes("/pause/")
      ? { transfer_id: "transfer-1", state: "paused" }
      : { transfers: [{ transfer_id: "transfer-1", state: "running" }] });
    render(<FileTransferReactRenderer />);
    expect(await screen.findByText("transfer-1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "pause transfer-1" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/file_transfer_manager/transfers/transfer-1/pause/", { method: "POST", body: {} }));
  });
});

describe("checksum integrity React workflow", () => {
  it("matches the old calculate/verify form and posts the expected path fields", async () => {
    nativePluginRequest.mockResolvedValue({ checksum: "abc123" });
    render(<ChecksumIntegrityReactRenderer />);
    fireEvent.change(screen.getByLabelText("Path (relative to local root)"), { target: { value: "reference/ref.fa" } });
    fireEvent.change(screen.getByLabelText("Expected checksum (optional)"), { target: { value: "abc123" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify checksum" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/checksum_integrity_manager/api/verify/", {
      method: "POST", body: { path: "reference/ref.fa", algorithm: "sha256", expected_checksum: "abc123" },
    }));
  });
});

describe("PDF report builder React workflow", () => {
  it("preserves the legacy report creation fields and refreshes the report list", async () => {
    nativePluginRequest.mockImplementation(async (path, options) => path.endsWith("/api/reports") && options?.method === "POST"
      ? { report: { id: 5 } } : { reports: [{ id: 5, title: "Cohort report" }] });
    render(<PdfReportBuilderReactRenderer />);
    expect(await screen.findByText("Cohort report")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Cohort report" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "QC summary" } });
    fireEvent.change(screen.getByLabelText("Source run plugin (optional)"), { target: { value: "workflow_runner" } });
    fireEvent.change(screen.getByLabelText("Source run ID (optional)"), { target: { value: "run-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/pdf_report_builder/api/reports", {
      method: "POST", body: { title: "Cohort report", description: "QC summary", template: "default_scientific", source_run_plugin: "workflow_runner", source_run_id: "run-1" },
    }));
  });
});

describe("MultiQC reports React workflow", () => {
  it("lists, filters, and opens report details using the plugin API", async () => {
    nativePluginRequest.mockImplementation(async path => path.includes("/reports/report-1/")
      ? { report: { report_id: "report-1", samples: 20 } }
      : { reports: [{ report_id: "report-1", status: "completed" }] });
    render(<MultiQcReactRenderer />);
    expect(await screen.findByText("report-1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open report report-1" }));
    expect(await screen.findByText(/samples/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Status filter"), { target: { value: "failed" } });
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/multiqc_wrapper/reports/?status=failed"));
  });
});
