import React from "react";
import { Panel, PanelBody } from "../components/UI";

export default function Artifacts() {
  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: "var(--font-size-md)", fontWeight: 600, color: "var(--text)", margin: "0 0 4px" }}>
          Artifacts
        </h1>
        <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", margin: 0 }}>
          Durable scientific outputs from analyses and workflows — reports, tables, plots, notebooks and other results.
        </p>
      </header>

      <Panel>
        <PanelBody style={{ textAlign: "center", padding: "40px 16px" }}>
          <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", margin: 0 }}>
            Unified artifact tracking is not yet available.
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}
