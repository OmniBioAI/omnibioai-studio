import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: repoRoot,
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["tests/ui/setup.js"],
    include: ["tests/ui/**/*.test.{js,jsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage/ui-app",
      include: ["src/ui/**/*.{js,jsx}"],
      exclude: ["src/ui/main.jsx"],
      thresholds: { statements: 95, lines: 95, functions: 95, branches: 95 },
    },
  },
});
