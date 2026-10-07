import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AccountPrivacy from "../../src/ui/pages/AccountPrivacy";

afterEach(cleanup);

describe("AccountPrivacy", () => {
  it("renders honest, disabled rows for capabilities with no canonical backend", () => {
    render(<AccountPrivacy />);
    expect(screen.getByRole("heading", { name: "Privacy & Data" })).toBeInTheDocument();
    expect(screen.getByText("Export your data")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Not available yet" })).toHaveLength(2);
  });

  it("never renders a functional Delete account action", () => {
    render(<AccountPrivacy />);
    expect(screen.getByText("Delete account")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "Not available yet" });
    buttons.forEach(button => expect(button).toBeDisabled());
    expect(screen.queryByRole("button", { name: /^Delete$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not expose export/delete/consent controls as functional", () => {
    render(<AccountPrivacy />);
    // Every interactive control on this page must be disabled — there is no
    // canonical backend for any of these capabilities yet.
    screen.getAllByRole("button").forEach(button => expect(button).toBeDisabled());
  });
});
