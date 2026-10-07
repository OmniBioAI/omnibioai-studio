import { afterEach, describe, expect, it, vi } from "vitest";
import { isStripeHostedUrl, openStripeUrl } from "../../src/ui/lib/stripePortal";

afterEach(() => { delete window.api; delete window.electronAPI; vi.restoreAllMocks(); });

describe("isStripeHostedUrl", () => {
  it("accepts Stripe's two hosted origins", () => {
    expect(isStripeHostedUrl("https://checkout.stripe.com/pay/cs_123")).toBe(true);
    expect(isStripeHostedUrl("https://billing.stripe.com/session/abc")).toBe(true);
  });
  it("rejects lookalike, non-https and malformed URLs", () => {
    expect(isStripeHostedUrl("https://evil.example/checkout.stripe.com")).toBe(false);
    expect(isStripeHostedUrl("https://checkout.stripe.com.evil.example")).toBe(false);
    expect(isStripeHostedUrl("https://checkout.stripe.com@evil.example")).toBe(false);
    expect(isStripeHostedUrl("http://checkout.stripe.com/pay")).toBe(false);
    expect(isStripeHostedUrl("not a url")).toBe(false);
  });
});

describe("openStripeUrl", () => {
  it("refuses a non-Stripe-hosted URL before touching any navigation surface", () => {
    window.api = { openExternal: vi.fn() };
    expect(() => openStripeUrl("https://evil.example/steal")).toThrow("Refused to open a non-Stripe-hosted URL");
    expect(window.api.openExternal).not.toHaveBeenCalled();
  });

  it("navigates a reserved tab without leaking Studio's referrer", () => {
    const link = { click: vi.fn() };
    const stripeTab = { closed: false, document: { createElement: vi.fn(() => link), body: { appendChild: vi.fn() } } };
    openStripeUrl("https://checkout.stripe.com/pay/cs_1", stripeTab);
    expect(link.href).toBe("https://checkout.stripe.com/pay/cs_1");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.target).toBe("_self");
    expect(stripeTab.document.body.appendChild).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalledOnce();
  });

  it("refuses to navigate a reserved tab the user already closed", () => {
    const stripeTab = { closed: true };
    expect(() => openStripeUrl("https://checkout.stripe.com/pay/cs_1", stripeTab)).toThrow("The Stripe tab was closed");
  });

  it("prefers window.electronAPI.openExternal when present", () => {
    window.electronAPI = { openExternal: vi.fn() };
    window.api = { openExternal: vi.fn() };
    openStripeUrl("https://billing.stripe.com/session/abc");
    expect(window.electronAPI.openExternal).toHaveBeenCalledWith("https://billing.stripe.com/session/abc");
    expect(window.api.openExternal).not.toHaveBeenCalled();
  });

  it("falls back to window.api.openExternal when electronAPI is absent", () => {
    window.api = { openExternal: vi.fn() };
    openStripeUrl("https://billing.stripe.com/session/abc");
    expect(window.api.openExternal).toHaveBeenCalledWith("https://billing.stripe.com/session/abc");
  });

  it("falls back to a full-page navigation in a plain browser tab", () => {
    const originalLocation = window.location;
    const assign = vi.fn();
    // jsdom's real Location#assign isn't configurable enough for vi.spyOn
    // to replace directly — swap the whole object, same pattern billing.test.jsx
    // already uses for this exact call.
    Object.defineProperty(window, "location", { value: { ...originalLocation, assign }, writable: true, configurable: true });
    try {
      openStripeUrl("https://billing.stripe.com/session/abc");
      expect(assign).toHaveBeenCalledWith("https://billing.stripe.com/session/abc");
    } finally {
      Object.defineProperty(window, "location", { value: originalLocation, writable: true, configurable: true });
    }
  });
});
