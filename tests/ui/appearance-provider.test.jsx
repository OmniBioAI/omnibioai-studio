import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppearanceProvider, { useAppearance } from "../../src/ui/components/AppearanceProvider";
import { saveAppearance } from "../../src/ui/lib/appearanceApi";

afterEach(() => { cleanup(); delete window.matchMedia; document.documentElement.removeAttribute("data-theme"); document.documentElement.removeAttribute("data-accent"); document.documentElement.removeAttribute("data-density"); document.documentElement.removeAttribute("data-motion"); });

// A minimal MediaQueryList double. `style` picks which listener API it
// exposes — Electron's bundled Chromium on some builds only has the legacy
// addListener/removeListener pair, which the provider must also support.
function fakeMediaQueryList(initialMatches, style = "modern") {
  let matches = initialMatches;
  const listeners = new Set();
  const mql = {
    get matches() { return matches; },
    set: value => { matches = value; listeners.forEach(fn => fn({ matches: value })); },
  };
  if (style === "modern") {
    mql.addEventListener = (_, fn) => listeners.add(fn);
    mql.removeEventListener = (_, fn) => listeners.delete(fn);
  } else if (style === "legacy") {
    mql.addListener = fn => listeners.add(fn);
    mql.removeListener = fn => listeners.delete(fn);
  }
  return mql;
}

function installMatchMedia(map) {
  window.matchMedia = query => map[query];
}

function Probe() {
  const appearance = useAppearance();
  return (
    <div>
      <div data-testid="mode">{appearance.mode}</div>
      <div data-testid="resolved-theme">{appearance.resolvedTheme}</div>
      <div data-testid="resolved-motion">{appearance.resolvedMotion}</div>
      <div data-testid="accent">{appearance.accent}</div>
      <div data-testid="density">{appearance.density}</div>
      <button onClick={() => appearance.setMode("light")}>set-light</button>
      <button onClick={() => appearance.setMode("dark")}>set-dark</button>
      <button onClick={() => appearance.setAccent("purple")}>set-purple</button>
      <button onClick={() => appearance.setDensity("compact")}>set-compact</button>
      <button onClick={() => appearance.setReducedMotion("reduce")}>set-reduce</button>
      <button onClick={() => appearance.setReducedMotion("system")}>set-motion-system</button>
    </div>
  );
}

describe("AppearanceProvider", () => {
  it("defaults to dark when matchMedia is unavailable (this app's test environment)", () => {
    render(<AppearanceProvider userId={1}><Probe /></AppearanceProvider>);
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.accent).toBe("teal");
    expect(document.documentElement.dataset.density).toBe("comfortable");
  });

  it("resolves System against the OS color-scheme query and updates live on change", () => {
    const colorQuery = fakeMediaQueryList(false, "modern"); // OS reports light
    installMatchMedia({ "(prefers-color-scheme: dark)": colorQuery, "(prefers-reduced-motion: reduce)": fakeMediaQueryList(false) });
    render(<AppearanceProvider userId={1}><Probe /></AppearanceProvider>);
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    act(() => colorQuery.set(true));
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
  });

  it("supports the legacy addListener/removeListener MediaQueryList API", () => {
    const colorQuery = fakeMediaQueryList(false, "legacy");
    installMatchMedia({ "(prefers-color-scheme: dark)": colorQuery, "(prefers-reduced-motion: reduce)": fakeMediaQueryList(false, "legacy") });
    render(<AppearanceProvider userId={1}><Probe /></AppearanceProvider>);
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    act(() => colorQuery.set(true));
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
  });

  it("an explicit Light/Dark choice is not overridden by the OS query", () => {
    installMatchMedia({ "(prefers-color-scheme: dark)": fakeMediaQueryList(true), "(prefers-reduced-motion: reduce)": fakeMediaQueryList(false) });
    render(<AppearanceProvider userId={1}><Probe /></AppearanceProvider>);
    act(() => screen.getByText("set-light").click());
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("reduces motion when the OS prefers it, even without an explicit choice", () => {
    installMatchMedia({ "(prefers-color-scheme: dark)": fakeMediaQueryList(true), "(prefers-reduced-motion: reduce)": fakeMediaQueryList(true) });
    render(<AppearanceProvider userId={1}><Probe /></AppearanceProvider>);
    expect(screen.getByTestId("resolved-motion")).toHaveTextContent("reduce");
  });

  it("forces reduced motion from an explicit choice regardless of the OS query", () => {
    installMatchMedia({ "(prefers-color-scheme: dark)": fakeMediaQueryList(true), "(prefers-reduced-motion: reduce)": fakeMediaQueryList(false) });
    render(<AppearanceProvider userId={1}><Probe /></AppearanceProvider>);
    act(() => screen.getByText("set-reduce").click());
    expect(screen.getByTestId("resolved-motion")).toHaveTextContent("reduce");
    expect(document.documentElement.dataset.motion).toBe("reduce");
    act(() => screen.getByText("set-motion-system").click());
    expect(screen.getByTestId("resolved-motion")).toHaveTextContent("system");
  });

  it("updates accent and density and reflects them on the document element", () => {
    render(<AppearanceProvider userId={1}><Probe /></AppearanceProvider>);
    act(() => screen.getByText("set-purple").click());
    expect(screen.getByTestId("accent")).toHaveTextContent("purple");
    expect(document.documentElement.dataset.accent).toBe("purple");
    act(() => screen.getByText("set-compact").click());
    expect(screen.getByTestId("density")).toHaveTextContent("compact");
    expect(document.documentElement.dataset.density).toBe("compact");
  });

  it("persists every change and reloads it on remount", () => {
    const { unmount } = render(<AppearanceProvider userId={42}><Probe /></AppearanceProvider>);
    act(() => screen.getByText("set-purple").click());
    unmount();
    render(<AppearanceProvider userId={42}><Probe /></AppearanceProvider>);
    expect(screen.getByTestId("accent")).toHaveTextContent("purple");
  });

  it("loads a different user's stored appearance when userId changes, without cross-user leakage", () => {
    saveAppearance("userA", { accent: "blue" });
    saveAppearance("userB", { accent: "orange" });
    const { rerender } = render(<AppearanceProvider userId="userA"><Probe /></AppearanceProvider>);
    expect(screen.getByTestId("accent")).toHaveTextContent("blue");
    rerender(<AppearanceProvider userId="userB"><Probe /></AppearanceProvider>);
    expect(screen.getByTestId("accent")).toHaveTextContent("orange");
  });

  it("tolerates a MediaQueryList with neither the modern nor legacy listener API", () => {
    installMatchMedia({ "(prefers-color-scheme: dark)": { matches: false }, "(prefers-reduced-motion: reduce)": { matches: false } });
    render(<AppearanceProvider userId={1}><Probe /></AppearanceProvider>);
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
  });

  it("exposes safe no-op defaults when used without a provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("mode")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
  });
});
