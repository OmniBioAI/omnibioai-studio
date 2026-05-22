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
      "/_svc/workbench": { target: `http://${HOST}:8000`, changeOrigin: true, rewrite: (p) => p.replace(/^\/_svc\/workbench/, "") || "/" },
      "/plugins":            { target: `http://${HOST}:8000`, changeOrigin: true, secure: false },
      "/pipeline-dashboard": { target: `http://${HOST}:8000`, changeOrigin: true, secure: false },
      "/dashboard":          { target: `http://${HOST}:8000`, changeOrigin: true, secure: false },
      "/ops":                { target: `http://${HOST}:8000`, changeOrigin: true, secure: false },
      "/tools":              { target: `http://${HOST}:8000`, changeOrigin: true, secure: false },
      "/home":               { target: `http://${HOST}:8000`, changeOrigin: true, secure: false },
      "/health":             { target: `http://${HOST}:8000`, changeOrigin: true, secure: false },
      "/admin":              { target: `http://${HOST}:8000`, changeOrigin: true, secure: false },
      "/api":                { target: `http://${HOST}:8000`, changeOrigin: true, secure: false },
      "/static":             { target: `http://${HOST}:8000`, changeOrigin: true, secure: false },
      "/media":              { target: `http://${HOST}:8000`, changeOrigin: true, secure: false },
      "/ws":                 { target: `ws://${HOST}:8000`,   changeOrigin: true, ws: true, secure: false },
      "/_svc/tes":       { target: `http://${HOST}:5177`, changeOrigin: true, rewrite: (p) => p.replace(/^\/_svc\/tes/, "") || "/" },
      "/_tes":           { target: `http://${HOST}:8081`, changeOrigin: true, rewrite: (p) => p.replace(/^\/_tes/, "") },
      "/_svc/toolserver":{ target: `http://${HOST}:9090`, changeOrigin: true, rewrite: () => "/health" },
      "/_svc/rag":       { target: `http://${HOST}:5175`, changeOrigin: true, rewrite: (p) => p.replace(/^\/_svc\/rag/, "") || "/" },
      "/_svc/modelregistry": { target: `http://${HOST}:5176`, changeOrigin: true, rewrite: (p) => p.replace(/^\/_svc\/modelregistry/, "") || "/" },
      "/_svc/devhub":    { target: `http://${HOST}:5173`, changeOrigin: true, rewrite: (p) => p.replace(/^\/_svc\/devhub/, "") || "/" },
      "/_svc/control":   { target: `http://${HOST}:7070`, changeOrigin: true, rewrite: (p) => p.replace(/^\/_svc\/control/, "") || "/" },
      "/_svc/ollama":    { target: `http://${HOST}:11434`, changeOrigin: true, rewrite: (p) => p.replace(/^\/_svc\/ollama/, "") || "/" },
      "/_svc/lims":      { target: `http://${HOST}:7000`, changeOrigin: true, rewrite: (p) => p.replace(/^\/_svc\/lims/, "") || "/" },
      
      "/_svc/toolimages": { target: `http://${HOST}:5179`, changeOrigin: true, rewrite: (p) => p.replace(/^\/_svc\/toolimages/, "") || "/" },
      "/_svc/workflows":  { target: `http://${HOST}:5178`, changeOrigin: true, rewrite: (p) => p.replace(/^\/_svc\/workflows/, "") || "/" },
      "/_svc/sdk":        { target: `http://${HOST}:5190`, changeOrigin: true, rewrite: (p) => p.replace(/^\/_svc\/sdk/, "") || "/" },
      "/_svc/opa":        { target: `http://${HOST}:8181`, changeOrigin: true },
      "/_svc/videos":    { target: `http://${HOST}:8086`, changeOrigin: true },
    }
  }
});
