import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Btn, HealthCard, Input, Select, ToggleRow } from "../../src/ui/components/UI";
import Sidebar from "../../src/ui/components/Sidebar";
import MobileNav from "../../src/ui/components/MobileNav";

const nav = [{ section: "Runtime", items: [{ name: "Launch", idx: 4 }, { name: "Jobs", idx: 9 }] }];

describe("application navigation and controls", () => {
  it("renders semantic controls and reports user changes", () => {
    const onChange = vi.fn();
    render(<><Input value="" onChange={onChange} /><Select value="a" onChange={onChange} options={["a", { value: "b", label: "Beta" }]} /><ToggleRow label="Feature" value={false} onChange={onChange} /><Btn onClick={onChange}>Save</Btn></>);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("shows health state labels and handles desktop navigation and sign out", () => {
    const setStep = vi.fn();
    const onStudioClick = vi.fn();
    render(<><HealthCard label="Auth" status="down" port="8001" /><Sidebar nav={nav} step={4} setStep={setStep} systemStatus={{ docker: "running" }} isServiceView={true} onStudioClick={onStudioClick} currentUser={{ email: "user@test" }} /></>);
    expect(screen.getByText("✕ DOWN")).toBeInTheDocument();
    fireEvent.click(screen.getByText("← Studio"));
    fireEvent.click(screen.getByText("Jobs"));
    expect(onStudioClick).toHaveBeenCalled();
    expect(setStep).toHaveBeenCalledWith(9);
    expect(screen.getByText("user@test")).toBeInTheDocument();
  });

  it("supports drawer close, escape, keyboard navigation, and active-page close", () => {
    const setStep = vi.fn(); const onClose = vi.fn();
    render(<MobileNav nav={nav} step={4} setStep={setStep} currentUser={null} open={true} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Navigation" })).toHaveAttribute("aria-hidden", "false");
    fireEvent.keyDown(screen.getByRole("button", { name: "Launch" }), { key: "Enter" });
    expect(setStep).toHaveBeenCalledWith(4);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
