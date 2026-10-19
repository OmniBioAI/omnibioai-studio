import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: repoRoot,
  plugins: [react()],
  // The app and the local @omnibioai/ui package each have an installed
  // React copy.  Explicit aliases keep Testing Library and app components on
  // the same dispatcher; `dedupe` alone does not collapse pnpm/npm symlinks.
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      react: fileURLToPath(new URL("packages/omnibioai-ui/node_modules/react", import.meta.url)),
      "react-dom": fileURLToPath(new URL("packages/omnibioai-ui/node_modules/react-dom", import.meta.url)),
    },
  },
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
