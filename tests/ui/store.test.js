import { describe, expect, it } from "vitest";
import useStore from "../../src/ui/store";

describe("global wizard store", () => {
  it("maintains bounded wizard navigation and nested configuration patches", () => {
    const s = useStore.getState();
    s.reset(); s.prevStep(); expect(useStore.getState().step).toBe(0);
    s.nextStep(); s.setStep(3); expect(useStore.getState().step).toBe(3);
    s.updateLLM({ ollama: true }); s.updateCloud({ provider: "azure" }); s.updateHPC({ enabled: true }); s.setMode("hybrid");
    expect(useStore.getState().config).toMatchObject({ mode: "hybrid", llm: { ollama: true }, cloud: { provider: "azure" }, hpc: { enabled: true } });
  });

  it("launches through the Electron API and records running status", async () => {
    window.api = { saveConfig: async () => {}, startDocker: async () => {} };
    await useStore.getState().launchSystem();
    expect(useStore.getState().systemStatus.docker).toBe("running");
    expect(useStore.getState().isLaunching).toBe(false);
  });
});
