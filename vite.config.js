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
    strictPort: true,
    // Proxy /api/ to the workbench so health checks are same-origin (no CORS).
    // Target host comes from VITE_HOST shell env (set when starting Vite remotely).
    proxy: {
      "/_health": {
        target: `http://${process.env.VITE_HOST || "192.168.86.234"}:8000`,
        changeOrigin: true,
        rewrite: () => "/health/",
      }
    }
  }
});