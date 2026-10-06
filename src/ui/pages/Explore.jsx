import React from "react";
import { Panel, PanelBody } from "../components/UI";

export default function Explore() {
  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: "var(--font-size-md)", fontWeight: 600, color: "var(--text)", margin: "0 0 4px" }}>
          Explore
        </h1>
        <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", margin: 0 }}>
          Unified discovery across OmniBioAI tools, workflows and scientific capabilities.
        </p>
      </header>

      <Panel>
        <PanelBody style={{ textAlign: "center", padding: "40px 16px" }}>
          <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", margin: 0 }}>
            Unified discovery is being prepared. In the meantime, browse applications and tools from the Studio dashboard.
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}
