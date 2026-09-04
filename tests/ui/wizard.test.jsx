import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Wizard from "../../src/ui/pages/Wizard";

afterEach(() => cleanup());

const steps = ["One", "Two", "Three"];

describe("Wizard", () => {
  it("disables Back on the first step and advances on Next", () => {
    const setStep = vi.fn();
    render(<Wizard step={0} steps={steps} setStep={setStep}>content</Wizard>);
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Back")).toBeDisabled();
    expect(screen.getByText("Next")).not.toBeDisabled();
    fireEvent.click(screen.getByText("Next"));
    expect(setStep).toHaveBeenCalledWith(1);
  });

  it("enables both controls on a middle step, coloring completed steps", () => {
    const setStep = vi.fn();
    render(<Wizard step={1} steps={steps} setStep={setStep}>content</Wizard>);
    expect(screen.getByText("Back")).not.toBeDisabled();
    expect(screen.getByText("Next")).not.toBeDisabled();
    fireEvent.click(screen.getByText("Back"));
    expect(setStep).toHaveBeenCalledWith(0);
    expect(screen.getByText("One")).toHaveStyle({ background: "rgb(22, 163, 74)" }); // completed
    expect(screen.getByText("Three")).toHaveStyle({ color: "rgb(0, 0, 0)" }); // upcoming
  });

  it("disables Next on the last step", () => {
    render(<Wizard step={2} steps={steps} setStep={vi.fn()}>content</Wizard>);
    expect(screen.getByText("Next")).toBeDisabled();
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
  });
});
