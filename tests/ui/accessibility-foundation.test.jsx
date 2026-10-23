import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import Cloud from "../../src/ui/pages/Cloud";
import HPC from "../../src/ui/pages/HPC";
import LLM from "../../src/ui/pages/LLM";
import Logs from "../../src/ui/pages/Logs";
import Mode from "../../src/ui/pages/Mode";
import Settings from "../../src/ui/pages/Settings";
import Workbench from "../../src/ui/pages/Workbench";
import Sidebar from "../../src/ui/components/Sidebar";
import { screen } from "@testing-library/react";

const admin = { permissions: ["manage_config"] };
const pages = [
  ["LLM", <LLM config={{}} setConfig={vi.fn()} currentUser={admin} />],
  ["Cloud", <Cloud config={{}} setConfig={vi.fn()} currentUser={admin} />],
  ["HPC", <HPC config={{}} setConfig={vi.fn()} currentUser={admin} />],
  ["System Settings", <Settings config={{}} setConfig={vi.fn()} currentUser={admin} />],
  ["Logs", <Logs />],
  ["Mode", <Mode config={{ mode: "beta" }} setConfig={vi.fn()} currentUser={admin} />],
];

afterEach(() => { cleanup(); delete window.api; vi.unstubAllGlobals(); });

describe("accessibility foundation", () => {
  it.each(pages)("has no axe WCAG A/AA violations on %s", async (_name, page) => {
    window.api = {};
    const { container } = render(page);
    const results = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
    expect(results.violations.map(({ id, help, nodes }) => ({ id, help, count: nodes.length }))).toEqual([]);
  });

  it("has no axe WCAG A/AA violations on Workbench and its desktop navigation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schema_version: 1, total_count: 1, categories: [{
        key: "analysis", title: "Analysis", count: 1,
        plugins: [{ slug: "rna", title: "RNA Analysis", description: "Expression analysis", version: "1", category: "analysis", launch_path: "/plugins/rna/" }],
      }] }),
    }));
    const nav = [{ section: null, items: [{ name: "Studio", idx: 7 }] }, { section: "Work", items: [{ name: "Workbench", idx: 13 }] }];
    const { container } = render(<><Sidebar nav={nav} step={7} setStep={vi.fn()} systemStatus="idle" currentUser={null} />
      <Workbench state={{ query: "", category: "__all__", focusSlug: null }} onStateChange={vi.fn()} onOpen={vi.fn()} /></>);
    await screen.findByRole("button", { name: "Open RNA Analysis" });
    const results = await axe.run(container, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    expect(results.violations.map(({ id, help, nodes }) => ({ id, help, count: nodes.length }))).toEqual([]);
  });

  it("uses muted text values that clear 4.5:1 across the shared theme surfaces", () => {
    const cssPath = ["src/index.css", "../../src/index.css"].map(path => resolve(process.cwd(), path)).find(existsSync);
    const css = readFileSync(cssPath, "utf8");
    const darkBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    const lightBlock = css.match(/html\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    const darkToken = darkBlock.match(/--muted:\s*(#[\da-f]{6})/i)?.[1];
    const lightToken = lightBlock.match(/--color-text-muted:\s*(#[\da-f]{6})/i)?.[1];
    const luminance = hex => {
      const values = hex.slice(1).match(/.{2}/g).map(pair => parseInt(pair, 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const ratio = (foreground, background) => {
      const a = luminance(foreground), b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    // Before: dark #6b7280 and light #64748b. After: dark #a1aab8 and light #53657d.
    expect(darkToken).toBe("#a1aab8");
    expect(lightToken).toBe("#53657d");
    const themeTokens = [
      [darkToken, ["#0a0c10", "#0f1217", "#161b24"]],
      [lightToken, ["#ffffff", "#eef0f4", "#e4e7ee"]],
    ];
    for (const [foreground, surfaces] of themeTokens) {
      for (const background of surfaces) expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
