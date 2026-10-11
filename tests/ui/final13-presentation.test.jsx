import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InformationalRenderer from "../../src/ui/components/workbench/InformationalRenderer";
import { validatePluginDescriptor } from "../../src/ui/lib/pluginApi";
import descriptors from "./fixtures/final13-descriptors.json";

afterEach(cleanup);
describe("Final13 native gate-state presentation", () => {
  it.each(descriptors)("renders $plugin.slug without granting actions", descriptor => {
    expect(validatePluginDescriptor(descriptor, descriptor.plugin.slug).renderer).toBe("informational");
    render(<InformationalRenderer descriptor={descriptor} />);
    expect(screen.getByRole("heading", { name: descriptor.content.sections[0].heading })).toBeInTheDocument();
    expect(screen.getByText(/does not enable execution/)).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Execute unavailable"})).toBeDisabled();
    expect(screen.getAllByRole("button").length).toBeGreaterThan(3);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(descriptor.endpoints).toBeUndefined();
    expect(descriptor.workspace.fields.length).toBeGreaterThan(0);
    const field = descriptor.workspace.fields.find(x => x.required);
    fireEvent.click(screen.getByRole("button", {name: "Validate local draft"}));
    if (field && !field.default) expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    for (const item of descriptor.workspace.fields) {
      fireEvent.change(screen.getByLabelText(item.label + (item.required ? " (required)" : "")), {target: {value: descriptor.plugin.slug === 'decipher' ? 'metadata' : descriptor.plugin.slug === 'metacyc' ? ({action: 'search', query: 'glycolysis', resource_type: 'pathway', orgid: 'META', limit: '5'})[item.id] : item.id === "workflow_spec" ? '{"nodes":[]}' : item.id === "enabled" ? '1' : 'draft'}});
    }
    fireEvent.click(screen.getByRole("button", {name: "Validate local draft"}));
    expect(screen.getByRole("status")).toHaveTextContent("No backend request");
    fireEvent.click(screen.getByRole("button", {name: "Draft"}));
    expect(screen.getByLabelText("Draft preview")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Inputs"}));
    fireEvent.click(screen.getByRole("button", {name: "Reset draft"}));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Outputs"}));
    expect(screen.getByText("No results are available because execution is restricted.")).toBeInTheDocument();
  });
});

it("rejects executable workspace extensions", () => {
  const descriptor = descriptors[0];
  expect(() => validatePluginDescriptor({...descriptor, workspace: {...descriptor.workspace, execution_enabled: true}}, descriptor.plugin.slug)).toThrow();
  expect(() => validatePluginDescriptor({...descriptor, workspace: {...descriptor.workspace, endpoint: "/execute"}}, descriptor.plugin.slug)).toThrow();
});


describe("Final two documented local drafts", () => {
  it.each(["decipher", "metacyc"])("edits, validates and resets %s without network access", slug => {
    const descriptor = descriptors.find(d => d.plugin.slug === slug);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network request"));
    try {
      render(<InformationalRenderer descriptor={descriptor} />);
      expect(screen.queryByText(/Registry administration/)).not.toBeInTheDocument();
      const field = screen.getByLabelText(slug === "decipher" ? "Action (required)" : "Query (required)");
      fireEvent.change(field, {target: {value: ""}});
      fireEvent.click(screen.getByRole("button", {name: "Validate local draft"}));
      expect(screen.getByRole("alert")).toHaveTextContent("required");
      fireEvent.change(field, {target: {value: slug === "decipher" ? "patient_lookup" : "x".repeat(201)}});
      fireEvent.click(screen.getByRole("button", {name: "Validate local draft"}));
      expect(screen.getByRole("alert")).toHaveTextContent(slug === "decipher" ? "unsupported" : "200");
      fireEvent.change(field, {target: {value: slug === "decipher" ? "metadata" : "glycolysis"}});
      fireEvent.change(field, {target: {value: slug === "decipher" ? "health" : "citrate"}});
      fireEvent.click(screen.getByRole("button", {name: "Validate local draft"}));
      expect(screen.getByRole("status")).toHaveTextContent("No backend request");
      fireEvent.click(screen.getByRole("button", {name: "Draft"}));
      expect(screen.getByLabelText("Draft preview")).toHaveTextContent(slug === "decipher" ? '"action": "health"' : '"query": "citrate"');
      fireEvent.click(screen.getByRole("button", {name: "Inputs"}));
      expect(screen.getByRole("button", {name: "Execute unavailable"})).toBeDisabled();
      fireEvent.click(screen.getByRole("button", {name: "Reset draft"}));
      expect(screen.getByLabelText(slug === "decipher" ? "Action (required)" : "Query (required)")).toHaveValue(descriptor.workspace.fields.find(x => x.id === (slug === "decipher" ? "action" : "query")).default);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", {name: "Draft"}));
      expect(screen.getByLabelText("Draft preview")).toHaveTextContent("not an execution result");
      fireEvent.click(screen.getByRole("button", {name: "Outputs"}));
      expect(screen.getByText("result: unavailable")).toBeInTheDocument();
      expect(screen.getByText("provenance: unavailable")).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });
  it.each([
    ["action", "get_pathway", "search drafts only"],
    ["orgid", "META/../../", "database identifier"],
    ["resource_type", "clinical", "resource type"],
    ["limit", "101", "integer from 1 to 100"],
    ["limit", "1.5", "integer from 1 to 100"],
  ])("rejects invalid MetaCyc %s=%s", (id, value, error) => {
    const descriptor = descriptors.find(d => d.plugin.slug === "metacyc");
    render(<InformationalRenderer descriptor={descriptor} />);
    fireEvent.change(screen.getByLabelText("Query (required)"), {target: {value: "glycolysis"}});
    const field = descriptor.workspace.fields.find(x => x.id === id);
    fireEvent.change(screen.getByLabelText(field.label + (field.required ? " (required)" : "")), {target: {value}});
    fireEvent.click(screen.getByRole("button", {name: "Validate local draft"}));
    expect(screen.getByRole("alert")).toHaveTextContent(error);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
