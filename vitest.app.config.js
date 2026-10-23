import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));
// The approved app test runner belongs to the local UI package, not the
// application dependency manifest. Resolve its test-only dependencies there.
const testRequire = createRequire(new URL("./packages/omnibioai-ui/package.json", import.meta.url));

export default defineConfig({
  root: repoRoot,
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      ...["react", "react-dom"].map(name => ({
        find: new RegExp(`^${name}(?=/|$)`),
        replacement: testRequire.resolve(`${name}/package.json`).replace(/\/package\.json$/, ""),
      })),
      { find: /^vitest$/, replacement: testRequire.resolve("vitest/package.json").replace(/package\.json$/, "dist/index.js") },
      { find: "axe-core", replacement: testRequire.resolve("axe-core") },
      { find: /^@omnibioai\/ui$/, replacement: fileURLToPath(new URL("./packages/omnibioai-ui/src/index.ts", import.meta.url)) },
      { find: "@testing-library/jest-dom/vitest", replacement: testRequire.resolve("@testing-library/jest-dom/vitest").replace(/\.js$/, ".mjs") },
      ...["@testing-library/react", "@testing-library/user-event"].map(name => ({ find: name, replacement: testRequire.resolve(name) })),
    ],
  },
  test: {
    globals: true,
    server: { deps: { inline: [/@testing-library\//] } },
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
