import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StudioFooter from "../../src/ui/components/StudioFooter";

afterEach(cleanup);

describe("StudioFooter", () => {
  it("provides product, documentation, help, privacy and source links", () => {
    render(<StudioFooter onHelpClick={vi.fn()} onPrivacyClick={vi.fn()} />);

    expect(screen.getByText("OmniBioAI Studio")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Documentation/ })).toHaveAttribute("href", "https://docs.omnibioai.org");
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/OmniBioAI/omnibioai-studio");
  });

  it("routes help and privacy links through the Studio shell", () => {
    const onHelpClick = vi.fn();
    const onPrivacyClick = vi.fn();
    render(<StudioFooter onHelpClick={onHelpClick} onPrivacyClick={onPrivacyClick} />);

    fireEvent.click(screen.getByRole("link", { name: "Help & support" }));
    fireEvent.click(screen.getByRole("link", { name: "Privacy" }));
    expect(onHelpClick).toHaveBeenCalledOnce();
    expect(onPrivacyClick).toHaveBeenCalledOnce();
  });
});
