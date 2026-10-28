import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/components/AppearanceProvider", () => ({
  useAppearance: () => ({ resolvedTheme: "light" }),
}));

import StandaloneAppLaunch from "../../src/ui/pages/StandaloneAppLaunch";

describe("standalone app deep-link page", () => {
  it("offers Admin Console as an explicit new-tab link", () => {
    render(<StandaloneAppLaunch />);
    expect(screen.getByText("Admin Console runs as a standalone app and cannot be displayed inside Studio.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open Admin Console in a new tab" });
    expect(link).toHaveAttribute("href", "https://admin.omnibioai.org/?obai_theme=light");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.rel.split(" ")).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
  });
});
