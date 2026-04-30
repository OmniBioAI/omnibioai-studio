import { create } from "zustand";

/**
 * OmniBioAI Studio Global Store
 * Central state for wizard + runtime config + execution mode
 */

const useStore = create((set, get) => ({

  // ─────────────────────────────
  // CORE WIZARD STATE
  // ─────────────────────────────

  step: 0,

  setStep: (step) => set({ step }),

  nextStep: () =>
    set((state) => ({ step: state.step + 1 })),

  prevStep: () =>
    set((state) => ({
      step: Math.max(0, state.step - 1)
    })),

  // ─────────────────────────────
  // GLOBAL CONFIG
  // ─────────────────────────────

  config: {
    mode: "local", // local | hpc | cloud | hybrid

    llm: {
      claudeKey: "",
      ollama: false,
      codexKey: ""
    },

    cloud: {
      provider: "aws",
      aws: {},
      azure: {},
      gcp: {}
    },

    hpc: {
      enabled: false,
      host: "",
      user: "",
      scheduler: "slurm"
    }
  },

  setConfig: (patch) =>
    set((state) => ({
      config: {
        ...state.config,
        ...patch
      }
    })),

  updateLLM: (llmPatch) =>
    set((state) => ({
      config: {
        ...state.config,
        llm: {
          ...state.config.llm,
          ...llmPatch
        }
      }
    })),

  updateCloud: (cloudPatch) =>
    set((state) => ({
      config: {
        ...state.config,
        cloud: {
          ...state.config.cloud,
          ...cloudPatch
        }
      }
    })),

  updateHPC: (hpcPatch) =>
    set((state) => ({
      config: {
        ...state.config,
        hpc: {
          ...state.config.hpc,
          ...hpcPatch
        }
      }
    })),

  setMode: (mode) =>
    set((state) => ({
      config: {
        ...state.config,
        mode
      }
    })),

  // ─────────────────────────────
  // SYSTEM STATUS
  // ─────────────────────────────

  systemStatus: {
    docker: "idle",
    tes: "unknown",
    toolserver: "unknown"
  },

  setSystemStatus: (status) =>
    set((state) => ({
      systemStatus: {
        ...state.systemStatus,
        ...status
      }
    })),

  // ─────────────────────────────
  // EXECUTION CONTROL
  // ─────────────────────────────

  isLaunching: false,

  setLaunching: (value) =>
    set({ isLaunching: value }),

  launchSystem: async () => {
    const { config } = get();

    set({ isLaunching: true });

    try {
      await window.api.saveConfig(config);
      await window.api.startDocker();

      set({
        systemStatus: {
          docker: "running"
        }
      });

    } finally {
      set({ isLaunching: false });
    }
  },

  // ─────────────────────────────
  // RESET
  // ─────────────────────────────

  reset: () =>
    set({
      step: 0,
      config: {
        mode: "local",
        llm: { claudeKey: "", ollama: false, codexKey: "" },
        cloud: { provider: "aws", aws: {}, azure: {}, gcp: {} },
        hpc: { enabled: false, host: "", user: "", scheduler: "slurm" }
      }
    })
}));

export default useStore;