import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LicenseGate from "../../src/ui/components/LicenseGate";

beforeEach(() => { delete window.electronAPI; });
afterEach(() => { cleanup(); delete window.electronAPI; });

describe("LicenseGate", () => {
  it("bypasses the gate entirely outside Electron (dev mode)", async () => {
    render(<LicenseGate><div>protected content</div></LicenseGate>);
    await waitFor(() => expect(screen.getByText("protected content")).toBeInTheDocument());
    expect(screen.getByText(/dev · expires/)).toBeInTheDocument();
  });

  it("reuses a cached, unexpired license", async () => {
    window.electronAPI = { getLicense: vi.fn().mockResolvedValue({ valid: true, tier: "pro", expiry: "2099-01-01", days_remaining: 10 }) };
    render(<LicenseGate><div>protected content</div></LicenseGate>);
    await waitFor(() => expect(screen.getByText("protected content")).toBeInTheDocument());
    expect(screen.getByText(/pro · expires 2099-01-01 · 10d left/)).toBeInTheDocument();
  });

  it("falls through to the entry form for an expired or invalid cached license, or a lookup error", async () => {
    window.electronAPI = { getLicense: vi.fn().mockResolvedValue({ valid: true, expiry: "2000-01-01" }) };
    render(<LicenseGate><div>protected content</div></LicenseGate>);
    await waitFor(() => expect(screen.getByText("OmniBioAI Studio")).toBeInTheDocument());
    cleanup();

    window.electronAPI = { getLicense: vi.fn().mockResolvedValue({ valid: false }) };
    render(<LicenseGate><div>protected content</div></LicenseGate>);
    await waitFor(() => expect(screen.getByText("OmniBioAI Studio")).toBeInTheDocument());
    cleanup();

    window.electronAPI = { getLicense: vi.fn().mockRejectedValue(new Error("ipc down")) };
    render(<LicenseGate><div>protected content</div></LicenseGate>);
    await waitFor(() => expect(screen.getByText("OmniBioAI Studio")).toBeInTheDocument());
  });

  it("validates a license key: empty input, invalid with and without a reason, a thrown error, and success", async () => {
    window.electronAPI = {
      getLicense: vi.fn().mockResolvedValue(null),
      validateLicense: vi.fn(),
    };
    render(<LicenseGate><div>protected content</div></LicenseGate>);
    await waitFor(() => expect(screen.getByText("OmniBioAI Studio")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Activate License"));
    expect(await screen.findByText("Please enter a license key")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("OMNI-XXXX-XXXX-XXXX-XXXX");
    fireEvent.change(input, { target: { value: "BAD-KEY" } });
    window.electronAPI.validateLicense.mockResolvedValueOnce({ valid: false, reason: "This key was revoked" });
    fireEvent.click(screen.getByText("Activate License"));
    expect(await screen.findByText("This key was revoked")).toBeInTheDocument();

    window.electronAPI.validateLicense.mockResolvedValueOnce({ valid: false });
    fireEvent.click(screen.getByText("Activate License"));
    expect(await screen.findByText("Invalid license key")).toBeInTheDocument();

    window.electronAPI.validateLicense.mockRejectedValueOnce(new Error("network down"));
    fireEvent.click(screen.getByText("Activate License"));
    expect(await screen.findByText("Validation failed: network down")).toBeInTheDocument();

    window.electronAPI.validateLicense.mockResolvedValueOnce({ valid: true, tier: "beta", expiry: "2099-06-01", days_remaining: 30 });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("protected content")).toBeInTheDocument());
  });
});
