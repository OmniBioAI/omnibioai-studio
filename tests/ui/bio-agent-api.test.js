import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getToken: vi.fn(), refresh: vi.fn() }));
vi.mock("../../src/ui/lib/session", () => session);
vi.mock("../../src/ui/lib/pluginApi", () => ({ csrfToken: () => "csrf-test" }));

import { loadBioAgentContext, sendBioAgentPrompt } from "../../src/ui/lib/bioAgentApi";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("BioAgent API session handling", () => {
  beforeEach(() => {
    session.getToken.mockReset().mockReturnValue("access-old");
    session.refresh.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends Studio's access token with the Agent API request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ messages: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await loadBioAgentContext();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/_svc/workbench/plugins/bio_agent/chat_context/");
    expect(fetchMock.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer access-old");
    expect(fetchMock.mock.calls[0][1].credentials).toBe("same-origin");
    expect(session.refresh).not.toHaveBeenCalled();
  });

  it("refreshes once and retries a chat submission after a 401", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ response: "Ready" }));
    vi.stubGlobal("fetch", fetchMock);
    session.refresh.mockImplementation(async () => {
      session.getToken.mockReturnValue("access-new");
      return "access-new";
    });

    const result = await sendBioAgentPrompt({ prompt: "hi", model_name: "test-model" });

    expect(result).toEqual({ response: "Ready" });
    expect(session.refresh).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer access-old");
    expect(fetchMock.mock.calls[1][1].headers.get("Authorization")).toBe("Bearer access-new");
    expect(fetchMock.mock.calls[1][1].body.get("prompt")).toBe("hi");
  });

  it("does not refresh on rate limiting and reports the API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Try again shortly" }, 429)));

    await expect(loadBioAgentContext()).rejects.toThrow("Try again shortly");
    expect(session.refresh).not.toHaveBeenCalled();
  });

  it("keeps a clear sign-in error when refresh cannot recover a 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "expired" }, 401)));
    session.refresh.mockResolvedValue(null);

    await expect(loadBioAgentContext()).rejects.toThrow("Your session expired. Sign in again to continue.");
    expect(session.refresh).toHaveBeenCalledOnce();
  });
});
