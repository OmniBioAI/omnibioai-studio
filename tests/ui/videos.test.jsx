import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Videos from "../../src/ui/pages/Videos";

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Videos page", () => {
  it("shows a loading spinner before the fetch resolves", async () => {
    let resolveFetch;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((res) => { resolveFetch = res; })));
    render(<Videos onBack={vi.fn()} />);
    expect(screen.getByText("Loading videos...")).toBeInTheDocument();
    resolveFetch(jsonRes([]));
    await waitFor(() => expect(screen.getByText("No tutorials available yet")).toBeInTheDocument());
  });

  it("renders an error banner with the HTTP status when videos.json 404s", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    render(<Videos onBack={vi.fn()} />);
    expect(await screen.findByText("No videos.json found (HTTP 404)")).toBeInTheDocument();
  });

  it("renders an error banner when the fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<Videos onBack={vi.fn()} />);
    expect(await screen.findByText("offline")).toBeInTheDocument();
  });

  it("accepts a bare array, a {videos:[...]} wrapper, and an empty object", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes([{ filename: "a.mp4", title: "A" }])));
    render(<Videos onBack={vi.fn()} />);
    expect(await screen.findByText("1 video")).toBeInTheDocument();
    cleanup();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes({ videos: [{ filename: "a.mp4", title: "A" }, { filename: "b.mp4", title: "B" }] })));
    render(<Videos onBack={vi.fn()} />);
    expect(await screen.findByText("2 videos")).toBeInTheDocument();
    cleanup();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes({})));
    render(<Videos onBack={vi.fn()} />);
    expect(await screen.findByText("No tutorials available yet")).toBeInTheDocument();
  });

  it("renders a card's description and tags, hovers it, opens the player, and closes on Escape", async () => {
    const video = { filename: "a.mp4", title: "Intro", description: "Getting started", tags: ["setup", "basics"] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes([video])));
    const onBack = vi.fn();
    render(<Videos onBack={onBack} />);
    const card = await screen.findByRole("button", { name: "Play Intro" });
    expect(screen.getByText("Getting started")).toBeInTheDocument();
    expect(screen.getByText("setup")).toBeInTheDocument();

    fireEvent.mouseEnter(card);
    fireEvent.mouseLeave(card);
    fireEvent.click(card);
    expect(await screen.findByText("✕ Close")).toBeInTheDocument();
    expect(screen.getAllByText("Getting started").length).toBeGreaterThan(0); // also shown in modal footer

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("✕ Close")).not.toBeInTheDocument());

    fireEvent.click(screen.getByText("← Back to Workbench"));
    expect(onBack).toHaveBeenCalled();
  });

  it("opens the player via Enter key, closes via the Close button, and ignores clicks inside the modal", async () => {
    const video = { filename: "b.mp4", title: "No Extras" }; // no description/tags
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes([video])));
    render(<Videos onBack={vi.fn()} />);
    const card = await screen.findByRole("button", { name: "Play No Extras" });
    fireEvent.keyDown(card, { key: "A" }); // non-Enter key is a no-op
    expect(screen.queryByText("✕ Close")).not.toBeInTheDocument();
    fireEvent.keyDown(card, { key: "Enter" });
    const closeBtn = await screen.findByText("✕ Close");

    const modalInner = closeBtn.closest("div").parentElement;
    fireEvent.click(modalInner); // stopPropagation — should not close
    expect(screen.getByText("✕ Close")).toBeInTheDocument();

    fireEvent.click(closeBtn);
    await waitFor(() => expect(screen.queryByText("✕ Close")).not.toBeInTheDocument());
  });
});
