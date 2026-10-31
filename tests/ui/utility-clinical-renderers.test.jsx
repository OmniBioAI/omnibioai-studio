import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { nativePluginRequest } = vi.hoisted(() => ({ nativePluginRequest: vi.fn() }));
vi.mock("../../src/ui/lib/nativePluginApi", () => ({ nativePluginRequest }));

import {
  ClinicalConsentManagerReactRenderer,
  ClinicalDataQualityReactRenderer,
  DatasetIngestReactRenderer,
  FairDataPackagerReactRenderer,
  PrivacyDeidentificationReactRenderer,
  ResourceCostEstimatorReactRenderer,
  SpatialImagingIoReactRenderer,
  VoiceCommandReactRenderer,
} from "../../src/ui/components/workbench/UtilityClinicalRenderers";

afterEach(() => { cleanup(); nativePluginRequest.mockReset(); });

describe("spatial imaging React workflow", () => {
  it("supports metadata-only operation and sends the legacy image JSON payload", async () => {
    nativePluginRequest.mockResolvedValue({ run_id: "run-1", outputs: { dimensions: [2048, 2048] } });
    render(<SpatialImagingIoReactRenderer />);
    fireEvent.click(screen.getByRole("button", { name: "Inspect image" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/spatial_imaging_io/api/run/", {
      method: "POST", body: { operation: "inspect", image: { name: "slide.ome.tif", width: 2048, height: 2048, channels: 4, z_slices: 1, timepoints: 1, pixel_size_um: 0.5 } },
    }));
  });
});

describe("FAIR package React workflow", () => {
  it("parses package metadata and submits the expected build operation", async () => {
    nativePluginRequest.mockResolvedValue({ run_id: "run-2", outputs: [] });
    render(<FairDataPackagerReactRenderer />);
    fireEvent.click(screen.getByRole("button", { name: "Build FAIR package" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/fair_data_packager/api/run/", {
      method: "POST", body: { operation: "build_package", package: { title: "RNA-seq study", description: "", authors: ["Research Team"], artifacts: [] } },
    }));
  });
});

describe("privacy de-identification React workflow", () => {
  it("requires a pseudonymization key and sends only the selected operation fields", async () => {
    nativePluginRequest.mockResolvedValue({ run_id: "run-3", outputs: [] });
    render(<PrivacyDeidentificationReactRenderer />);
    fireEvent.change(screen.getByLabelText("Operation"), { target: { value: "pseudonymize" } });
    fireEvent.change(screen.getByLabelText("Payload"), { target: { value: "email me at person@example.org" } });
    fireEvent.change(screen.getByLabelText("Pseudonymization key"), { target: { value: "local-test-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Process safely" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/privacy_deidentification/api/run/", {
      method: "POST", body: { operation: "pseudonymize", payload: "email me at person@example.org", key: "local-test-key" },
    }));
  });
});

describe("clinical consent React workflow", () => {
  it("submits a parsed consent record with the requested scope", async () => {
    nativePluginRequest.mockResolvedValue({ run_id: "run-4", outputs: [] });
    render(<ClinicalConsentManagerReactRenderer />);
    fireEvent.click(screen.getByRole("button", { name: "Evaluate access" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/clinical_consent_manager/api/run/", {
      method: "POST", body: { operation: "evaluate_access", consent: { consent_id: "C-2026-001", subject_id: "SUBJECT-REDACTED", version: "2.0", status: "active", scopes: ["research", "export"], granted_at: "2026-01-01", expires_at: "2027-01-01" }, requested_scope: "research" },
    }));
  });
});

describe("clinical data quality React workflow", () => {
  it("parses the dataset and rule JSON fields before posting validation", async () => {
    nativePluginRequest.mockResolvedValue({ run_id: "run-5", outputs: [] });
    render(<ClinicalDataQualityReactRenderer />);
    fireEvent.click(screen.getByRole("button", { name: "Validate dataset" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/clinical_data_quality_validator/api/run/", {
      method: "POST", body: { operation: "validate", dataset: [{ id: "S1", sex: "F", age: 42 }, { id: "S1", sex: "X", age: 200 }], required: ["id", "sex", "age"], terminology: { sex: ["F", "M"] }, ranges: { age: [0, 120] } },
    }));
  });
});

describe("resource cost estimator React workflow", () => {
  it("sends the legacy planning parameters as numeric values", async () => {
    nativePluginRequest.mockResolvedValue({ run_id: "run-6", outputs: [] });
    render(<ResourceCostEstimatorReactRenderer />);
    fireEvent.change(screen.getByLabelText("Tool or workload"), { target: { value: "star_align" } });
    fireEvent.click(screen.getByRole("button", { name: "Estimate resources" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/resource_cost_estimator/api/run/", {
      method: "POST", body: { operation: "estimate", parameters: { tool: "star_align", cpu: 4, memory_gb: 16, gpu: 0, runtime_minutes: 60, storage_gb: 10, backend: "local" } },
    }));
  });
});

describe("voice command React workflow", () => {
  it("supports a typed command and posts it through the original parser API", async () => {
    nativePluginRequest.mockResolvedValue({ run_id: "run-7" });
    render(<VoiceCommandReactRenderer />);
    fireEvent.change(screen.getByLabelText("Recognized command"), { target: { value: "list available plugins" } });
    fireEvent.click(screen.getByRole("button", { name: "Process command" }));
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/voice_command/api/run/", {
      method: "POST", body: { command_text: "list available plugins" },
    }));
  });
});

describe("dataset ingest legacy React workflow", () => {
  it("submits the historical multipart fields to the JSON ingest API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, object_id: "object-1", run_id: "run-1" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<DatasetIngestReactRenderer />);
    fireEvent.change(screen.getByLabelText("Dataset name"), { target: { value: "RNA cohort" } });
    fireEvent.change(screen.getByLabelText("Workflow trigger (optional)"), { target: { value: "qc_pipeline" } });
    const file = new File(["sample,value\nS1,2\n"], "samples.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Dataset file"), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: "Ingest dataset" }).closest("form"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain("/plugins/dataset_ingest/api/ingest/");
    const options = fetchMock.mock.calls[0][1];
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("dataset_name")).toBe("RNA cohort");
    expect(options.body.get("workflow")).toBe("qc_pipeline");
    expect(options.body.get("file").name).toBe("samples.csv");
  });
});
