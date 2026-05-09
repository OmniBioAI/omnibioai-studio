import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({

  plugins: [react()],

  // ─────────────────────────────
  // BUILD CONFIG (IMPORTANT)
  // ─────────────────────────────

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false
  },

  // ─────────────────────────────
  // BASE PATH (Electron COMPAT)
  // ─────────────────────────────

  base: "./",

  // ─────────────────────────────
  // DEV SERVER
  // ─────────────────────────────

  server: {
    port: 5174,
    strictPort: true
  }
});