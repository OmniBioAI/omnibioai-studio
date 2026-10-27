import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AccountPrivacy from "../../src/ui/pages/AccountPrivacy";

afterEach(cleanup);

describe("AccountPrivacy", () => {
  it("renders honest, disabled rows for capabilities with no canonical backend", () => {
    render(<AccountPrivacy />);
    expect(screen.getByRole("heading", { name: "Privacy & data" })).toBeInTheDocument();
    expect(screen.getByText("Export your data")).toBeInTheDocument();
    expect(screen.getAllByText("Not set up yet")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Help & support" })).toHaveLength(2);
  });

  it("never renders a functional Delete account action", () => {
    render(<AccountPrivacy />);
    expect(screen.getByText("Delete account")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not expose export/delete/consent controls as functional", () => {
    render(<AccountPrivacy />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    screen.getAllByRole("link", { name: "Help & support" }).forEach(link =>
      expect(link).toHaveAttribute("href", "/studio/account/help"));
  });
});
