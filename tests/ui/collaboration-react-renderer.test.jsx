import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { nativePluginRequest } = vi.hoisted(() => ({ nativePluginRequest: vi.fn() }));
vi.mock("../../src/ui/lib/nativePluginApi", () => ({ nativePluginRequest }));

import CollaborationReactRenderer from "../../src/ui/components/workbench/CollaborationReactRenderer";

afterEach(() => { cleanup(); nativePluginRequest.mockReset(); vi.unstubAllGlobals(); });

describe("collaboration legacy React workflow", () => {
  it("loads the workspace selector, timeline, chat, and comments from their APIs", async () => {
    class FakeWebSocket {
      static OPEN = 1;
      readyState = 0;
      close() {}
    }
    vi.stubGlobal("WebSocket", FakeWebSocket);
    nativePluginRequest.mockImplementation(async path => {
      if (path.endsWith("/workspaces/")) return [{ id: 7, name: "Genome project", description: "Shared analysis" }];
      if (path.includes("/events/")) return [{ id: 1, event_type: "comment.created", actor_name: "Ava" }];
      if (path.includes("/chat/")) return [{ id: 2, sender_name: "Sam", content: "Ready for review" }];
      if (path.includes("/comments/")) return [{ id: 3, author_name: "Ava", content: "Looks good" }];
      return [];
    });
    render(<CollaborationReactRenderer />);
    expect(await screen.findByRole("option", { name: "Genome project" })).toBeTruthy();
    await waitFor(() => expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/collaboration/api/events/?workspace=7"));
    expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/collaboration/api/chat/?workspace=7");
    expect(nativePluginRequest).toHaveBeenCalledWith("/plugins/collaboration/api/comments/?workspace=7");
  });
});
