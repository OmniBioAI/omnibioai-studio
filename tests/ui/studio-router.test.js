import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LEGACY_STUDIO_REDIRECTS,
  STUDIO_ROUTES,
  canonicalizeStudioLocation,
  isKnownStudioPath,
  listenForStudioNavigation,
  pathForStudioPage,
  pluginSlugFromStudioPath,
  resolveStudioLocation,
  studioPluginPath,
  writeStudioLocation,
} from "../../src/ui/lib/studioRouter";

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("Studio router", () => {
  it("keeps /studio as Home", () => {
    window.history.replaceState({}, "", "/studio");
    expect(resolveStudioLocation()).toMatchObject({ page: 7, pathname: "/studio", redirectTo: null });
    expect(pathForStudioPage(7)).toBe("/studio");
  });

  it.each(Object.entries(LEGACY_STUDIO_REDIRECTS))("redirects %s to %s", (legacyPath, expected) => {
    window.history.replaceState({}, "", `${legacyPath}?keep=1#section`);
    const route = canonicalizeStudioLocation();
    expect(route.redirectTo).toBe(expected);
    expect(window.location.pathname).toBe(expected);
    expect(window.location.search).toBe("?keep=1");
    expect(window.location.hash).toBe("#section");
  });

  it.each(STUDIO_ROUTES)("resolves %s to page %s", (path, page) => {
    expect(resolveStudioLocation({ pathname: path })).toMatchObject({ page, pathname: path });
    expect(pathForStudioPage(page)).toBe(path);
    expect(isKnownStudioPath(path)).toBe(true);
  });

  it("recognizes validated plugin routes", () => {
    expect(pluginSlugFromStudioPath("/studio/plugins/rna_seq")).toBe("rna_seq");
    expect(studioPluginPath("rna_seq")).toBe("/studio/plugins/rna_seq");
    expect(() => studioPluginPath("../bad")).toThrow("Invalid plugin slug");
    expect(resolveStudioLocation({ pathname: "/studio/plugins/rna_seq" })).toMatchObject({ page: 13, pluginSlug: "rna_seq" });
  });

  it("writes navigations and follows browser history", () => {
    window.history.replaceState({}, "", "/studio");
    writeStudioLocation("/studio/projects");
    expect(window.location.pathname).toBe("/studio/projects");

    const listener = vi.fn();
    const unsubscribe = listenForStudioNavigation(listener);
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ page: 20, pathname: "/studio/projects" }));
    unsubscribe();
  });
});
