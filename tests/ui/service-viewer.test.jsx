import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ServiceViewer from "../../src/ui/pages/ServiceViewer";
import { useAppearance } from "../../src/ui/components/AppearanceProvider";
import { buildEmbeddedUrl, createEmbedAppearance, createThemeSetMessage, EMBED_READY_EVENT, EMBED_THEME_EVENT } from "../../src/ui/lib/embedAppearance";

vi.mock("../../src/ui/components/AppearanceProvider", () => ({
  useAppearance: vi.fn(() => ({ resolvedTheme: "dark", accent: "teal", density: "comfortable", resolvedMotion: "system" })),
}));

beforeEach(() => {
  delete window.api;
  delete window.electronAPI;
  vi.mocked(useAppearance).mockReturnValue({ resolvedTheme: "dark", accent: "teal", density: "comfortable", resolvedMotion: "system" });
});
afterEach(() => { cleanup(); delete window.api; delete window.electronAPI; vi.restoreAllMocks(); });

it("snapshots only validated appearance values and removes hostile or private query parameters", () => {
  const src = buildEmbeddedUrl(
    "/_svc/rag/?view=chat&author=Ada&username=reader&obai_theme=evil&obai_accent=orange&token=x&access_token=x&password=x&api_key=x&session=x&user_id=private",
    { theme: "light", accent: "purple", density: "compact", motion: "reduce" },
    "https://studio.example/",
  );
  const parsed = new URL(src);
  expect(parsed.searchParams.get("view")).toBe("chat");
  expect(parsed.searchParams.get("author")).toBe("Ada");
  expect(parsed.searchParams.get("username")).toBe("reader");
  expect(parsed.searchParams.get("obai_theme")).toBe("light");
  expect(parsed.searchParams.get("obai_accent")).toBe("purple");
  expect(parsed.searchParams.get("obai_density")).toBe("compact");
  expect(parsed.searchParams.get("obai_motion")).toBe("reduce");
  for (const key of ["token", "access_token", "password", "api_key", "session", "user_id"]) {
    expect(parsed.searchParams.has(key)).toBe(false);
  }
  expect(createEmbedAppearance({ theme: "evil", accent: "javascript:alert(1)", density: "huge", motion: "secret" }))
    .toEqual({ theme: "dark", accent: "teal", density: "comfortable", motion: "system" });
  expect(createThemeSetMessage({ theme: "light", accent: "blue", density: "compact", motion: "reduce", userId: "private", token: "sentinel" }))
    .toEqual({ type: EMBED_THEME_EVENT, theme: "light", accent: "blue", density: "compact", motion: "reduce" });
});

describe("ServiceViewer", () => {
  it("keeps the canonical Launcher iframe stable until an explicit reopen", () => {
    const onBack = vi.fn();
    const { rerender } = render(<ServiceViewer key={1} url="/_svc/sdk" label="Code" onBack={onBack} />);
    const first = screen.getByTitle("Code");
    expect(new URL(first.src).pathname).toBe("/_svc/sdk");
    expect(new URL(first.src).searchParams.get("obai_theme")).toBe("dark");
    rerender(<ServiceViewer key={1} url="/_svc/sdk" label="Code" onBack={onBack} backLabel="Studio" />);
    expect(screen.getByTitle("Code")).toBe(first);
    rerender(<ServiceViewer key={2} url="/_svc/sdk" label="Code" onBack={onBack} />);
    expect(screen.getByTitle("Code")).not.toBe(first);
    expect(new URL(screen.getByTitle("Code").src).pathname).toBe("/_svc/sdk");
    rerender(<ServiceViewer key={3} url="/_svc/workflows" label="Workflows" onBack={onBack} />);
    expect(screen.queryByTitle("Code")).toBeNull();
    expect(new URL(screen.getByTitle("Workflows").src).pathname).toBe("/_svc/workflows");
  });

  it("renders an iframe in the web build, titled by label or the URL as a fallback", () => {
    const { unmount } = render(<ServiceViewer url="/service" label="Service" onBack={vi.fn()} />);
    const iframe = document.querySelector("iframe");
    expect(iframe.title).toBe("Service");
    expect(document.querySelector("webview")).toBeNull();
    unmount();

    render(<ServiceViewer url="/service" onBack={vi.fn()} />);
    expect(document.querySelector("iframe").title).toBe("/service");
  });

  it("offers full-screen escape hatches only for embedded Lit AI and Workflows", () => {
    const { rerender } = render(<ServiceViewer url="/_svc/workflows" label="Workflows" onBack={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Open full screen" })).toHaveAttribute("href", "/_svc/workflows");
    rerender(<ServiceViewer url="/_svc/rag/" label="RAG / Lit AI" onBack={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Open full screen" })).toHaveAttribute("href", "/_svc/rag/");
    rerender(<ServiceViewer url="/_svc/sdk" label="Code" onBack={vi.fn()} />);
    expect(screen.queryByRole("link", { name: "Open full screen" })).not.toBeInTheDocument();
  });

  it("calls onBack", () => {
    const onBack = vi.fn();
    render(<ServiceViewer url="/service" label="Service" onBack={onBack} />);
    fireEvent.click(screen.getByText("← Back to Studio"));
    expect(onBack).toHaveBeenCalled();
  });

  it("waits for a same-origin ready message from the exact iframe, rejects hostile messages, and pushes live updates", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    const { rerender } = render(<ServiceViewer url="/_svc/rag/" label="RAG / Lit AI" onBack={vi.fn()} />);
    const iframe = document.querySelector("iframe");
    const postMessage = vi.spyOn(iframe.contentWindow, "postMessage").mockImplementation(() => {});
    const ready = { type: EMBED_READY_EVENT };

    act(() => window.dispatchEvent(new MessageEvent("message", { origin: "https://attacker.example", source: iframe.contentWindow, data: ready })));
    act(() => window.dispatchEvent(new MessageEvent("message", { origin: window.location.origin, source: window, data: ready })));
    act(() => window.dispatchEvent(new MessageEvent("message", { origin: window.location.origin, source: iframe.contentWindow, data: { ...ready, userId: "private" } })));
    act(() => window.dispatchEvent(new MessageEvent("message", { origin: window.location.origin, source: iframe.contentWindow, data: { type: "omnibioai.theme.set.v1", token: "sentinel" } })));
    expect(postMessage).not.toHaveBeenCalled();

    act(() => window.dispatchEvent(new MessageEvent("message", { origin: window.location.origin, source: iframe.contentWindow, data: ready })));
    expect(postMessage).toHaveBeenLastCalledWith(
      { type: EMBED_THEME_EVENT, theme: "dark", accent: "teal", density: "comfortable", motion: "system" },
      window.location.origin,
    );

    vi.mocked(useAppearance).mockReturnValue({ resolvedTheme: "light", accent: "orange", density: "compact", resolvedMotion: "reduce" });
    rerender(<ServiceViewer url="/_svc/rag/" label="RAG / Lit AI" onBack={vi.fn()} />);
    expect(iframe.src).toContain("obai_theme=dark");
    expect(postMessage).toHaveBeenLastCalledWith(
      { type: EMBED_THEME_EVENT, theme: "light", accent: "orange", density: "compact", motion: "reduce" },
      window.location.origin,
    );
  });

  it("renders a webview under Electron and forwards open-external IPC messages", () => {
    window.api = {};
    window.electronAPI = { openExternal: vi.fn() };
    render(<ServiceViewer url="/service" label="Service" onBack={vi.fn()} />);
    const webview = document.querySelector("webview");
    expect(webview).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();

    const handlerEvent = new Event("ipc-message");
    handlerEvent.channel = "open-external";
    handlerEvent.args = ["https://example.com"];
    webview.dispatchEvent(handlerEvent);
    expect(window.electronAPI.openExternal).toHaveBeenCalledWith("https://example.com");

    const ignoredEvent = new Event("ipc-message");
    ignoredEvent.channel = "something-else";
    webview.dispatchEvent(ignoredEvent);
    expect(window.electronAPI.openExternal).toHaveBeenCalledTimes(1);
  });
});

it("labels the native catalog return action without changing the embedded application URL", () => {
  const onBack = vi.fn();
  render(<ServiceViewer url="/_svc/workbench/plugins/rna/" label="RNA Analysis" backLabel="Back to Workbench" onBack={onBack} />);
  expect(new URL(screen.getByTitle("RNA Analysis").src).pathname).toBe("/_svc/workbench/plugins/rna/");
  fireEvent.click(screen.getByRole("button", { name: "← Back to Workbench" }));
  expect(onBack).toHaveBeenCalledOnce();
});
