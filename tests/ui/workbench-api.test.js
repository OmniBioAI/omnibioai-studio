import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { isElectron } = vi.hoisted(() => ({ isElectron: vi.fn(() => false) }));
vi.mock("../../src/ui/lib/session", () => ({ isElectron }));
import { applicationUrl, legacyWorkbenchUrl, loadWorkbenchCatalog, validateCatalog } from "../../src/ui/lib/workbenchApi";
import { catalog, catalogResponse } from "./workbench-fixture";

beforeEach(() => { isElectron.mockReturnValue(false); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(catalogResponse())); });
afterEach(() => vi.unstubAllGlobals());

describe("Workbench API boundary", () => {
  it("uses the existing same-origin proxy without forwarding credentials as bearer tokens", async () => {
    const signal = new AbortController().signal;
    expect(await loadWorkbenchCatalog({ signal })).toEqual(catalog);
    expect(fetch).toHaveBeenCalledWith("/_svc/workbench/home/catalog/", {
      headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store", signal,
    });
  });
  it("uses the existing Electron development proxy for loading", async () => {
    isElectron.mockReturnValue(true);
    await loadWorkbenchCatalog();
    expect(fetch.mock.calls[0][0]).toBe("http://localhost:5174/_svc/workbench/home/catalog/");
  });
  it.each([
    [false, false, "/_svc/workbench/plugins/rna/"],
    [false, true, "/_svc/workbench/plugins/rna/"],
    [true, false, "http://localhost/_svc/workbench/plugins/rna/"],
    [true, true, "http://localhost:5174/_svc/workbench/plugins/rna/"],
  ])("preserves application paths for electron=%s development=%s", (electron, development, expected) => {
    expect(applicationUrl("/plugins/rna/", { electron, development })).toBe(expected);
    expect(legacyWorkbenchUrl({ electron, development })).toBe(expected.replace("plugins/rna/", ""));
  });
  it("preserves the existing Provenance catalog launch target", () => {
    const provenance = {
      schema_version: 1,
      total_count: 1,
      categories: [{
        key: "dashboard",
        title: "Dashboard",
        count: 1,
        plugins: [{
          slug: "provenance",
          title: "Provenance",
          description: "Audit trail & lineage for OmniObjects (reproducible workflows)",
          version: "1.0.0",
          category: "dashboard",
          launch_path: "/plugins/provenance/",
        }],
      }],
    };
    expect(validateCatalog(provenance)).toBe(provenance);
    expect(applicationUrl(provenance.categories[0].plugins[0].launch_path)).toBe("/_svc/workbench/plugins/provenance/");
  });
  it.each(["//evil.test/", "https://evil.test/", "/plugins/../auth/", "/plugins/%2e%2e/", "/plugins/a/?x=1", "/plugins/a/#x", "/auth/logout/", "/plugins/a\\x/", "/plugins/a/\n", null])("rejects unsafe destinations %s", path => {
    expect(() => applicationUrl(path)).toThrow("Invalid application destination");
  });
  it("rejects mismatched counts, unsupported schema and invalid cards", () => {
    expect(validateCatalog(catalog)).toBe(catalog);
    for (const mutate of [
      d => { d.schema_version = 2; }, d => { d.total_count++; },
      d => { d.categories[0].count++; }, d => { d.categories[0].plugins[0].title = null; },
      d => { d.categories.push(d.categories[0]); },
    ]) {
      const data = structuredClone(catalog); mutate(data);
      expect(() => validateCatalog(data)).toThrow("invalid catalog");
    }
  });
  it("does not expose HTML error bodies or clear the Studio session", async () => {
    localStorage.setItem("omnibioai_access_token", "keep-session");
    fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ detail: "private" }) });
    await expect(loadWorkbenchCatalog()).rejects.toThrow("(401)");
    expect(localStorage.getItem("omnibioai_access_token")).toBe("keep-session");
    fetch.mockResolvedValue({ ok: true, json: async () => { throw new Error("private HTML"); } });
    await expect(loadWorkbenchCatalog()).rejects.toThrow("invalid catalog");
  });
});
