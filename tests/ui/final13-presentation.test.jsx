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
    const field = descriptor.workspace.fields.find(x => x.required);
    fireEvent.click(screen.getByRole("button", {name: "Validate local draft"}));
    if (field && !field.default) expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    for (const item of descriptor.workspace.fields) {
      fireEvent.change(screen.getByLabelText(item.label + (item.required ? " (required)" : "")), {target: {value: item.id === "workflow_spec" ? '{"nodes":[]}' : item.id === "enabled" ? '1' : 'draft'}});
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
