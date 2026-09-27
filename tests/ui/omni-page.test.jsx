import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import OmniPage from "../../src/ui/components/OmniPage";

afterEach(cleanup);

describe("OmniPage shared contract", () => {
  it("renders the hero, metadata, actions, messages, and body", () => {
    render(<OmniPage title="DESeq2" subtitle="Differential expression" meta={<span>v1</span>}
      actions={<button type="button">Run</button>} error="Bad input" errors={["One", "Two"]}
      warning="Review" warnings={["Careful"]} success="Ready" info="Details">
      <div>Plugin body</div>
    </OmniPage>);
    expect(screen.getByRole("heading", { name: "DESeq2" })).toBeInTheDocument();
    expect(screen.getByText("Differential expression")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(screen.getByText("Plugin body")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("Bad input");
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Careful")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
  });

  it("omits optional sections when they are empty", () => {
    const { container } = render(<OmniPage title="Empty"><p>Content</p></OmniPage>);
    expect(container.querySelector(".omni-page-messages")).toBeEmptyDOMElement();
    expect(container.querySelector(".omni-page-actions")).toBeNull();
  });
});
