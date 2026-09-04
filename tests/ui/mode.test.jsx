import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Mode from "../../src/ui/pages/Mode";

afterEach(() => cleanup());

const admin = { permissions: ["manage_config"] };

describe("Mode page", () => {
  it("selects the active (enabled) mode and shows its selected styling", () => {
    const setConfig = vi.fn();
    render(<Mode config={{ mode: "beta" }} setConfig={setConfig} currentUser={admin} />);
    expect(screen.getByText("Beta Cloud")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Beta Cloud")); // click bubbles up to the card's onClick
    expect(setConfig).toHaveBeenCalled();
    const [updater] = setConfig.mock.calls[0];
    expect(updater({ mode: "x" })).toMatchObject({ mode: "beta" });
  });

  it("does not select a disabled mode, and shows its tooltip and coming-soon label", () => {
    const setConfig = vi.fn();
    render(<Mode config={{ mode: "beta" }} setConfig={setConfig} currentUser={admin} />);
    expect(screen.getAllByText("(coming soon)").length).toBe(4); // Local, HPC, Cloud, Hybrid
    const disabledCards = screen.getAllByTitle("Available in future release");
    expect(disabledCards).toHaveLength(4);
    fireEvent.click(disabledCards[0]);
    expect(setConfig).not.toHaveBeenCalled();
  });
});
