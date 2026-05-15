import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const HOST = process.env.VITE_HOST || "192.168.86.234";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false
  },
  base: "./",
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/_svc/gateway":   { target: `http://${HOST}:8080`, changeOrigin: true, rewrite: () => "/health" },
      "/_svc/auth":      { target: `http://${HOST}:8001`, changeOrigin: true, rewrite: () => "/health" },
      "/_svc/policy":    { target: `http://${HOST}:8002`, changeOrigin: true, rewrite: () => "/docs" },
      "/_svc/hpc":       { target: `http://${HOST}:8003`, changeOrigin: true, rewrite: () => "/docs" },
      "/_svc/audit":     { target: `http://${HOST}:8004`, changeOrigin: true, rewrite: () => "/health" },
      "/_svc/workbench": { target: `http://${HOST}:8000`, changeOrigin: true, rewrite: () => "/" },
      "/_svc/tes":       { target: `http://${HOST}:8081`, changeOrigin: true, rewrite: () => "/health" },
      "/_svc/toolserver":{ target: `http://${HOST}:9090`, changeOrigin: true, rewrite: () => "/health" },
      "/_svc/rag":       { target: `http://${HOST}:8090`, changeOrigin: true, rewrite: () => "/health" },
      "/_svc/devhub":    { target: `http://${HOST}:8082`, changeOrigin: true, rewrite: () => "/health" },
      "/_svc/control":   { target: `http://${HOST}:7070`, changeOrigin: true, rewrite: () => "/health" },
      "/_svc/ollama":    { target: `http://${HOST}:11434`, changeOrigin: true, rewrite: () => "/" },
      "/_svc/lims":      { target: `http://${HOST}:7000`, changeOrigin: true, rewrite: () => "/" },
      "/_svc/opa":       { target: `http://${HOST}:8181`, changeOrigin: true, rewrite: () => "/health" },
      "/_svc/mysql":     { target: `http://${HOST}:8000`, changeOrigin: true, rewrite: () => "/" },
      "/_svc/redis":     { target: `http://${HOST}:8000`, changeOrigin: true, rewrite: () => "/" },
    }
  }
});
