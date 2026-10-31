import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/pages/ServiceViewer", () => ({
  default: ({ url, label }) => <iframe title={label} src={url} />,
}));
vi.mock("../../src/ui/pages/PluginPage", () => ({
  default: ({ slug, label, backLabel, onBack }) => <div data-testid="agent-react-ui" data-plugin={slug}>
    <span>{label}</span><textarea aria-label="Agent chat" /><select aria-label="Agent model" />
    <button type="button" onClick={onBack}>{backLabel}</button>
  </div>,
}));

import AIChatHub from "../../src/ui/pages/AIChatHub";

afterEach(cleanup);

describe("unified AI chat hub", () => {
  it("opens on documentation Ask and lazy-loads Agent only when selected", () => {
    render(<AIChatHub onBack={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Ask · Documentation" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTitle("Ask OmniBioAI")).toHaveAttribute("src", "/_svc/devhub?view=chat");
    expect(screen.queryByTitle("OmniBioAI Agent")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Agent · Tools & workflows" }));
    expect(screen.getByRole("tab", { name: "Agent · Tools & workflows" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("agent-react-ui")).toHaveAttribute("data-plugin", "bio_agent");
    expect(screen.getByRole("textbox", { name: "Agent chat" })).toBeInTheDocument();
    expect(document.getElementById("ai-chat-panel-ask")).not.toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Ask · Documentation" }));
    expect(document.getElementById("ai-chat-panel-ask")).toBeVisible();
    expect(document.getElementById("ai-chat-panel-agent")).not.toBeVisible();
    expect(screen.getByTestId("agent-react-ui")).toBeInTheDocument();
  });

  it("opens directly on Agent for legacy OmniBioAgent links and exposes back navigation", () => {
    const onBack = vi.fn();
    render(<AIChatHub initialMode="agent" onBack={onBack} />);
    expect(screen.getByRole("tab", { name: "Agent · Tools & workflows" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("agent-react-ui")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to Ask OmniBioAI" }));
    expect(screen.getByRole("tab", { name: "Ask · Documentation" })).toHaveAttribute("aria-selected", "true");
    expect(onBack).not.toHaveBeenCalled();
  });
});
