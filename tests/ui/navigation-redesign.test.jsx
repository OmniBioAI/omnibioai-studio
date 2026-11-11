import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/lib/tesApi", () => ({ tesApiFetch: vi.fn().mockResolvedValue([]) }));

vi.mock("../../src/ui/pages/Settings", () => ({ default: () => <div>General settings content</div> }));
vi.mock("../../src/ui/pages/Mode", () => ({ default: () => <div>Mode settings content</div> }));
vi.mock("../../src/ui/pages/LLM", () => ({ default: () => <div>LLM settings content</div> }));
vi.mock("../../src/ui/pages/Cloud", () => ({ default: () => <div>Cloud settings content</div> }));
vi.mock("../../src/ui/pages/HPC", () => ({ default: () => <div>HPC settings content</div> }));

import { buildNav } from "../../src/ui/App";
import { ALL_SERVICES } from "../../src/ui/pages/AllServices";
import SettingsHub from "../../src/ui/pages/SettingsHub";
import { categoriesForDiscoveryView } from "../../src/ui/pages/Workbench";
import Tools, { toolPresentation, toolRunsTemporarilyUnavailable } from "../../src/ui/pages/Tools";
import { pluginsIntegrationsView } from "../../src/ui/pages/PluginsIntegrations";
import { ADMIN_ROUTE_DEFINITIONS, canAccessAdminRoute } from "../../src/ui/lib/adminRoutes";
import { LEGACY_STUDIO_REDIRECTS, resolveStudioLocation } from "../../src/ui/lib/studioRouter";

afterEach(() => {
  cleanup();
  delete window.__OMNIBIOAI_CONFIG__;
});

describe("redesigned Studio navigation", () => {
  it("gates every canonical and legacy Admin route for a non-admin", () => {
    const expectedPaths = [
      "/studio/admin/runtime/launch", "/studio/admin/runtime/services", "/studio/admin/runtime/logs",
      "/studio/admin/runtime/admin-console", "/studio/admin/runtime/control-center", "/studio/admin/runtime/platform-health",
      "/studio/admin/runtime/llm", "/studio/admin/runtime/metrics", "/studio/admin/runtime/tool-images", "/studio/admin/runtime/neo4j",
      "/studio/admin/security/roles", "/studio/admin/security/api-gateway", "/studio/admin/security/auth-service",
      "/studio/admin/security/policy-engine", "/studio/admin/security/hpc-policy", "/studio/admin/security/security-audit",
      "/studio/admin/security/service-accounts", "/studio/admin/security/compliance", "/studio/admin/security/posture",
      "/studio/admin/security/tool-executor", "/studio/admin/security/audit-explorer", "/studio/admin/security/audit-logs",
      "/studio/admin/organization/connections", "/studio/admin/organization/settings",
    ];
    expect(ADMIN_ROUTE_DEFINITIONS.map(route => route.path)).toEqual(expectedPaths);
    expect(new Set(expectedPaths).size).toBe(expectedPaths.length);
    for (const route of ADMIN_ROUTE_DEFINITIONS) {
      expect(route.permissions.length, route.path).toBeGreaterThan(0);
      expect(canAccessAdminRoute({ permissions: [] }, route), route.path).toBe(false);
      expect(resolveStudioLocation({ pathname: route.path })).toMatchObject({ page: route.idx, adminRoute: route });
      if (route.oldUrl) expect(route.boundary, route.oldUrl).toMatch(/^(p0|p1|control-center|standalone-admin|frontend)$/);
    }
    expect(LEGACY_STUDIO_REDIRECTS["/studio/admin"]).toBe("/studio/admin/runtime/admin-console");
    expect(LEGACY_STUDIO_REDIRECTS["/studio/admin-console"]).toBe("/studio/admin/runtime/admin-console");
  });

  it("hides Admin for users without an admin capability", () => {
    expect(buildNav({ permissions: [] }).some(section => section.section === "ADMIN")).toBe(false);
  });

  it("shows Admin and filters every child by permission", () => {
    const sections = buildNav({ permissions: ["manage_roles"] });
    const admin = sections.find(section => section.section === "ADMIN");
    expect(admin).toBeTruthy();
    expect(admin.collapsed).toBe(true);
    expect(admin.items.filter(item => !item.group).map(item => item.name)).toEqual(["Roles"]);
    expect(admin.items.map(item => item.name)).not.toContain("Tool images");
  });

  it("never exposes OPA in Admin or All services", () => {
    const adminNames = buildNav({ permissions: ["platform.manage_infra", "manage_config"] })
      .flatMap(section => section.items.map(item => item.name));
    expect(adminNames).not.toContain("OPA");
    expect(ALL_SERVICES.map(item => item.name)).not.toContain("OPA");
  });

  it("reuses the five existing settings pages as tabs", () => {
    render(<SettingsHub config={{}} setConfig={vi.fn()} currentUser={{}} />);
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["General", "Mode", "LLM", "Cloud", "HPC"]);
    expect(screen.getByText("General settings content")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Cloud" }));
    expect(screen.getByText("Cloud settings content")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cloud" })).toHaveAttribute("aria-selected", "true");
  });

  it("pre-filters Discover categories without hard-coding sidebar children", () => {
    const categories = [{ key: "mixed", title: "Mixed", plugins: [
      { slug: "github", category: "integration" }, { slug: "rna", category: "analysis" }, { slug: "agent", category: "ai" },
    ] }];
    expect(categoriesForDiscoveryView(categories, "integrations")[0].plugins.map(item => item.slug)).toEqual(["github"]);
    expect(categoriesForDiscoveryView(categories, "omics")[0].plugins.map(item => item.slug)).toEqual(["rna"]);
    expect(categoriesForDiscoveryView(categories, "agentic")[0].plugins.map(item => item.slug)).toEqual(["agent"]);
  });

  it("sends the legacy Integrations route to the provider integrations view", () => {
    expect(pluginsIntegrationsView("?view=integrations")).toBe("integrations");
    expect(pluginsIntegrationsView("")).toBe("plugins");
  });

  it("derives the approved tool category and plain-text runtime labels from TES metadata", () => {
    expect(toolPresentation({ tool_id: "fastqc", description: "Read quality control", tags: ["qc"], backends: ["slurm", "aws"] }))
      .toMatchObject({ category: "QC", backends: ["Slurm", "AWS Batch"] });
  });

  it("shows and dismisses the runtime-configured tool availability notice", () => {
    window.__OMNIBIOAI_CONFIG__ = { toolRunsTemporarilyUnavailable: true };
    expect(toolRunsTemporarilyUnavailable()).toBe(true);
    render(<Tools />);
    expect(screen.getByText("Tool runs are temporarily unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss tool availability notice" }));
    expect(screen.queryByText("Tool runs are temporarily unavailable")).not.toBeInTheDocument();
  });

  it("keeps the availability notice hidden when the runtime flag is off", () => {
    window.__OMNIBIOAI_CONFIG__ = { toolRunsTemporarilyUnavailable: false };
    render(<Tools />);
    expect(screen.queryByText("Tool runs are temporarily unavailable")).not.toBeInTheDocument();
  });
});
