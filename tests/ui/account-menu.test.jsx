import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountMenu from "../../src/ui/components/AccountMenu";

afterEach(cleanup);

describe("Account button", () => {
  it("opens Account directly from the real keyboard reachable button", () => {
    const onProfileClick = vi.fn();
    render(<AccountMenu currentUser={{ userId: 1, email: "alex@example.org" }} onProfileClick={onProfileClick} />);
    const trigger = screen.getByRole("button", { name: "Open Account" });
    fireEvent.click(trigger);
    expect(onProfileClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not render when signed out", () => {
    render(<AccountMenu currentUser={null} onProfileClick={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Open Account" })).not.toBeInTheDocument();
  });
});
