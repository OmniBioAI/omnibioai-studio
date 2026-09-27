import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import WorkbenchBase from "../../src/ui/components/WorkbenchBase";

afterEach(cleanup);

describe("WorkbenchBase", () => {
  it("provides a full-width accessible content boundary without a duplicate shell", () => {
    const { container } = render(<WorkbenchBase><h1>Native plugin</h1></WorkbenchBase>);
    expect(container.querySelector("main.workbench-base")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Native plugin" })).toBeInTheDocument();
    expect(container.querySelector("header")).toBeNull();
    expect(container.querySelector(".omni-page")).toBeNull();
  });
});
