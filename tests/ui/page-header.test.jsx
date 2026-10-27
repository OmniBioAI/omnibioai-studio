import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import PageHeader from "../../src/ui/components/PageHeader";

afterEach(cleanup);

const testDirectory = dirname(fileURLToPath(import.meta.url));

describe("PageHeader", () => {
  it("provides exactly one page-level heading with optional description and actions", () => {
    render(<PageHeader title="Jobs" description="TES execution engine" actions={<button>Refresh</button>} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Jobs" })).toBeInTheDocument();
    expect(screen.getByText("TES execution engine")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it.each(["Mode", "LLM", "Cloud", "HPC", "Launch", "Services", "Logs", "Settings", "Jobs", "Projects", "Artifacts", "Explore"])(
    "is the single page heading primitive used by the legacy %s page",
    pageName => {
      const source = readFileSync(resolve(testDirectory, `../../src/ui/pages/${pageName}.jsx`), "utf8");
      expect(source.match(/<PageHeader\b/g)).toHaveLength(1);
      expect(source).not.toMatch(/<h1\b/);
    },
  );
});
