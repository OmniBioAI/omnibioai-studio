import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountState from "../../src/ui/components/AccountState";

afterEach(cleanup);

describe("AccountState", () => {
  it("explains who can set up a missing capability and links to setup", () => {
    render(<AccountState variant="setup" href="/setup">An organization owner can configure payments.</AccountState>);
    expect(screen.getByRole("status")).toHaveTextContent("Not set up yet");
    expect(screen.getByRole("link", { name: "Set up" })).toHaveAttribute("href", "/setup");
  });

  it("names the plan that includes a capability and offers Compare", () => {
    render(<AccountState variant="plan" includedIn="Pro" href="/plans" />);
    expect(screen.getByRole("status")).toHaveTextContent("Pro includes this");
    expect(screen.getByRole("link", { name: "Compare" })).toHaveAttribute("href", "/plans");
  });

  it("explains a failed request and retries", () => {
    const retry = vi.fn();
    render(<AccountState variant="error" failed="Invoice list" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("renders no field for hidden state", () => {
    const { container } = render(<AccountState variant="hidden" title="Secret metadata" />);
    expect(container).toBeEmptyDOMElement();
  });
});
