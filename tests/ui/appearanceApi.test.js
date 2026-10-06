import { describe, expect, it } from "vitest";
import { ACCENTS, DEFAULT_APPEARANCE, DENSITIES, loadAppearance, MODES, MOTION_PREFS, saveAppearance } from "../../src/ui/lib/appearanceApi";

describe("appearanceApi", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadAppearance(1)).toEqual(DEFAULT_APPEARANCE);
  });

  it("round-trips a valid record through save/load", () => {
    saveAppearance(7, { mode: "dark", accent: "blue", density: "compact", reducedMotion: "reduce" });
    expect(loadAppearance(7)).toEqual({ version: 1, mode: "dark", accent: "blue", density: "compact", reducedMotion: "reduce" });
  });

  it("scopes storage per user — no cross-user leakage in a shared browser context", () => {
    saveAppearance("alice", { mode: "light" });
    saveAppearance("bob", { mode: "dark" });
    expect(loadAppearance("alice").mode).toBe("light");
    expect(loadAppearance("bob").mode).toBe("dark");
  });

  it("falls back to the anonymous key when no userId is given", () => {
    saveAppearance(undefined, { mode: "dark" });
    expect(loadAppearance(undefined).mode).toBe("dark");
    expect(loadAppearance(null).mode).toBe("dark");
  });

  it("falls back to defaults, field by field, for an invalid stored value", () => {
    localStorage.setItem("omnibioai_appearance:3", JSON.stringify({ mode: "neon", accent: "blue", density: "roomy", reducedMotion: "always" }));
    expect(loadAppearance(3)).toEqual({ version: 1, mode: DEFAULT_APPEARANCE.mode, accent: "blue", density: DEFAULT_APPEARANCE.density, reducedMotion: DEFAULT_APPEARANCE.reducedMotion });
  });

  it("falls back to defaults for malformed JSON", () => {
    localStorage.setItem("omnibioai_appearance:4", "{not json");
    expect(loadAppearance(4)).toEqual(DEFAULT_APPEARANCE);
  });

  it("falls back to defaults for a non-object JSON value", () => {
    localStorage.setItem("omnibioai_appearance:5", JSON.stringify("just a string"));
    expect(loadAppearance(5)).toEqual(DEFAULT_APPEARANCE);
    localStorage.setItem("omnibioai_appearance:6", JSON.stringify(null));
    expect(loadAppearance(6)).toEqual(DEFAULT_APPEARANCE);
  });

  it("tolerates a storage read failure and degrades to defaults", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("storage unavailable"); };
    expect(loadAppearance(9)).toEqual(DEFAULT_APPEARANCE);
    Storage.prototype.getItem = original;
  });

  it("tolerates a storage write failure without throwing", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("quota exceeded"); };
    expect(() => saveAppearance(10, { mode: "dark" })).not.toThrow();
    Storage.prototype.setItem = original;
  });

  it("exposes the exact allowed value sets", () => {
    expect(MODES).toEqual(["system", "light", "dark"]);
    expect(ACCENTS).toEqual(["teal", "blue", "purple", "orange"]);
    expect(DENSITIES).toEqual(["comfortable", "compact"]);
    expect(MOTION_PREFS).toEqual(["system", "reduce"]);
  });
});
