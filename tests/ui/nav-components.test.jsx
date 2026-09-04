import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("../../src/ui/lib/session", () => ({ logout }));

import Sidebar from "../../src/ui/components/Sidebar";
import MobileNav from "../../src/ui/components/MobileNav";
import UpdateBanner from "../../src/ui/components/UpdateBanner";

const nav = [{ section: "Runtime", items: [{ name: "Launch", idx: 4 }] }];
const user = { email: "u@test" };

afterEach(() => { cleanup(); vi.clearAllMocks(); delete window.api; });

describe("Sidebar", () => {
  it("shows the signed-in user and signs out on click", () => {
    render(<Sidebar nav={nav} step={4} setStep={vi.fn()} systemStatus="idle" currentUser={user} />);
    expect(screen.getByText("u@test")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Sign out"));
    expect(logout).toHaveBeenCalled();
  });

  it("hides the signed-in block when signed out, and falls back to IDLE for an unknown status", () => {
    render(<Sidebar nav={nav} step={4} setStep={vi.fn()} systemStatus="bogus" currentUser={null} />);
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
    expect(screen.getByText("IDLE")).toBeInTheDocument();
  });
});

describe("MobileNav", () => {
  it("closes on backdrop click, and signs out and closes on Sign out click", () => {
    const onClose = vi.fn();
    const { container } = render(<MobileNav nav={nav} step={4} setStep={vi.fn()} currentUser={user} open onClose={onClose} />);
    fireEvent.click(container.querySelector('[aria-hidden="true"]'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Sign out"));
    expect(logout).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("navigates via the Space key", () => {
    const setStep = vi.fn();
    const onClose = vi.fn();
    render(<MobileNav nav={nav} step={0} setStep={setStep} currentUser={null} open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Launch" }), { key: " " });
    expect(setStep).toHaveBeenCalledWith(4);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes itself when the active step changes elsewhere while open", () => {
    const onClose = vi.fn();
    const { rerender } = render(<MobileNav nav={nav} step={0} setStep={vi.fn()} currentUser={null} open onClose={onClose} />);
    rerender(<MobileNav nav={nav} step={4} setStep={vi.fn()} currentUser={null} open onClose={onClose} />);
    expect(onClose).toHaveBeenCalled();
  });

  it("ignores other keys and renders closed with no drawer effects", () => {
    const { container } = render(<MobileNav nav={nav} step={0} setStep={vi.fn()} currentUser={null} open={false} onClose={vi.fn()} />);
    expect(container.querySelector('[role="dialog"]')).toHaveAttribute("aria-hidden", "true");
  });
});

describe("UpdateBanner", () => {
  it("renders nothing without window.api.onUpdateAvailable", () => {
    const { container } = render(<UpdateBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("shows an update-available message and an error with a dismiss button", async () => {
    const listeners = {};
    window.api = {
      onUpdateAvailable: (cb) => { listeners.available = cb; },
      onUpdateError: (cb) => { listeners.error = cb; },
    };
    render(<UpdateBanner />);
    listeners.available({ version: "9.0.0" });
    expect(await screen.findByText(/v9\.0\.0 is available/)).toBeInTheDocument();

    listeners.error({ message: "checksum mismatch" });
    expect(await screen.findByText("Update failed: checksum mismatch")).toBeInTheDocument();
    fireEvent.click(screen.getByText("dismiss"));
    expect(screen.queryByText(/Update failed/)).not.toBeInTheDocument();
  });
});
