import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Services from "../../src/ui/pages/Services";

const user = { email: "owner@example.test", permissions: ["manage_config"] };
const tools = ["jupyter", "rstudio", "vscode"];
const tokenKey = "omnibioai_access_token";

function installFetch() {
  const fetchMock = vi.fn((url, options) => {
    const polling = String(url).includes("/api/launcher/status/");
    const authenticated = !!options?.headers?.Authorization;
    return Promise.resolve(new Response(JSON.stringify(
      polling && !authenticated ? { error: "authentication required" } : { status: "running" }
    ), { status: polling && !authenticated ? 401 : 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function pollingCalls(fetchMock) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/launcher/status/"));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each([["Services", Services]])("%s polling authentication", (_name, Page) => {
  it("authenticates all three tools using the existing session and never logs the credential", async () => {
    const credential = "test-only-session-credential";
    localStorage.setItem(tokenKey, credential);
    const logs = ["log", "info", "warn", "error", "debug"].map(method =>
      vi.spyOn(console, method).mockImplementation(() => {})
    );
    const fetchMock = installFetch();
    render(<Page currentUser={user} />);
    await waitFor(() => expect(pollingCalls(fetchMock)).toHaveLength(3));
    for (const tool of tools) {
      expect(fetchMock).toHaveBeenCalledWith(`/_svc/sdk/api/launcher/status/${tool}/`, expect.objectContaining({
        headers: { Authorization: `Bearer ${credential}` },
        signal: expect.any(AbortSignal),
      }));
    }
    expect(pollingCalls(fetchMock).every(([url]) => !String(url).includes(credential))).toBe(true);
    for (const log of logs) expect(JSON.stringify(log.mock.calls)).not.toContain(credential);
  });

  it("reads the current session again after the access token changes", async () => {
    localStorage.setItem(tokenKey, "test-only-before-refresh");
    const fetchMock = installFetch();
    render(<Page currentUser={user} />);
    await waitFor(() => expect(pollingCalls(fetchMock)).toHaveLength(3));
    localStorage.setItem(tokenKey, "test-only-after-refresh");
    fireEvent.click(screen.getByText("↻ Refresh"));
    await waitFor(() => expect(pollingCalls(fetchMock)).toHaveLength(6));
    for (const [, options] of pollingCalls(fetchMock).slice(3)) {
      expect(options.headers.Authorization).toBe("Bearer test-only-after-refresh");
    }
  });

  it("sends no fabricated bearer credential when the session token is missing and treats 401 as stopped", async () => {
    const fetchMock = installFetch();
    render(<Page currentUser={user} />);
    await waitFor(() => expect(pollingCalls(fetchMock)).toHaveLength(3));
    for (const [, options] of pollingCalls(fetchMock)) expect(options.headers).toEqual({});
    await waitFor(() => expect(screen.queryByText(/Open [↗→]/)).not.toBeInTheDocument());
    expect(localStorage.getItem(tokenKey)).toBeNull();
  });
});
