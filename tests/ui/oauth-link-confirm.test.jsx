import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { confirmOAuthLink } = vi.hoisted(() => ({ confirmOAuthLink: vi.fn() }));
vi.mock("../../src/ui/lib/session", () => ({ confirmOAuthLink }));

import OAuthLinkConfirm from "../../src/ui/components/OAuthLinkConfirm";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("OAuthLinkConfirm", () => {
  it("links the account on submit and reports an unknown provider by name", async () => {
    confirmOAuthLink.mockResolvedValueOnce({});
    const onDone = vi.fn();
    render(<OAuthLinkConfirm linkToken="lt" provider="okta" email="a@b.test" onDone={onDone} onCancel={vi.fn()} />);
    expect(screen.getByText(/link your okta sign-in/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "secret" } });
    fireEvent.click(screen.getByText("Link account"));
    await waitFor(() => expect(confirmOAuthLink).toHaveBeenCalledWith("lt", "secret"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("maps known provider labels", () => {
    render(<OAuthLinkConfirm linkToken="lt" provider="github" email="a@b.test" onDone={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/link your GitHub sign-in/)).toBeInTheDocument();
  });

  it("shows an error message on failure, falling back to a generic one with no message", async () => {
    confirmOAuthLink.mockRejectedValueOnce(new Error("wrong password"));
    render(<OAuthLinkConfirm linkToken="lt" provider="google" email="a@b.test" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("Link account"));
    expect(await screen.findByText("wrong password")).toBeInTheDocument();

    confirmOAuthLink.mockRejectedValueOnce(new Error());
    fireEvent.click(screen.getByText("Link account"));
    expect(await screen.findByText("Could not confirm the link")).toBeInTheDocument();
  });

  it("calls onCancel", () => {
    const onCancel = vi.fn();
    render(<OAuthLinkConfirm linkToken="lt" provider="google" email="a@b.test" onDone={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });
});
