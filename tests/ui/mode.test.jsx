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

  it("exposes a named radio group and supports arrow-key selection", () => {
    const setConfig = vi.fn();
    render(<Mode config={{ mode: "beta" }} setConfig={setConfig} currentUser={admin} />);
    const group = screen.getByRole("radiogroup", { name: "Runtime mode" });
    const selected = screen.getByRole("radio", { name: /Beta Cloud/ });
    expect(selected).toHaveAttribute("aria-checked", "true");
    selected.focus();
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(selected).toHaveFocus();
    expect(setConfig).toHaveBeenCalled();
    expect(setConfig.mock.calls.at(-1)[0]({ mode: "beta" })).toEqual({ mode: "beta" });
  });

  it("hides runtime modes that are not implemented", () => {
    const setConfig = vi.fn();
    render(<Mode config={{ mode: "beta" }} setConfig={setConfig} currentUser={admin} />);
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    for (const name of ["Local", "HPC", "Cloud", "Hybrid"]) {
      expect(screen.queryByText(name, { exact: true })).not.toBeInTheDocument();
    }
  });

  it("renders canonical health states with reasons instead of static claims", () => {
    render(<Mode config={{ mode: "beta" }} setConfig={vi.fn()} currentUser={admin} />);
    expect(screen.getAllByText("— UNKNOWN")).toHaveLength(5);
    expect(screen.getAllByText(/has not been checked yet|No health check is configured/).length).toBeGreaterThan(0);
  });
});
