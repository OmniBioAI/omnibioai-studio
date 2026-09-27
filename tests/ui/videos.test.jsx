import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Videos, { VIDEO_LIBRARY_URL } from "../../src/ui/pages/Videos";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Videos page", () => {

  it("embeds the Video Library through the same-origin Studio proxy route", () => {
    expect(VIDEO_LIBRARY_URL).toBe("/_svc/videos/");
    render(<Videos onBack={vi.fn()} />);
    const frame = screen.getByTitle("OmniBioAI Video Tutorials");
    expect(frame.tagName).toBe("IFRAME");
    // Trailing slash: the library's relative URLs must resolve under /_svc/videos/.
    expect(frame).toHaveAttribute("src", "/_svc/videos/");
    expect(new URL(frame.src).origin).toBe(window.location.origin);
    expect(frame).toHaveAttribute("allowfullscreen");
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("never points Studio at the public video host", () => {
    const { container } = render(<Videos onBack={vi.fn()} />);
    expect(container.innerHTML).not.toMatch(/videos\.omnibioai\.org|:8087|:8086/);
  });

  it("does not fetch or render catalog metadata itself", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { container } = render(<Videos onBack={vi.fn()} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.querySelector("video")).toBeNull();
    expect(container.textContent).not.toMatch(/videos\.json/);
  });

  it("keeps Studio's single Back to Studio control and returns to Studio", () => {
    const onBack = vi.fn();
    render(<Videos onBack={onBack} />);
    const back = screen.getAllByRole("button", { name: "← Back to Studio" });
    expect(back).toHaveLength(1);
    expect(screen.getByText("Video Tutorials")).toBeInTheDocument();
    fireEvent.click(back[0]);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
