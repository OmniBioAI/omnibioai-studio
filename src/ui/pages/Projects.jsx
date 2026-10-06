import React from "react";
import { Panel, PanelBody, Btn } from "../components/UI";

export default function Projects() {
  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: "var(--font-size-md)", fontWeight: 600, color: "var(--text)", margin: "0 0 4px" }}>
          Projects
        </h1>
        <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", margin: 0 }}>
          Organize scientific analyses, workflows, jobs and results into project workspaces.
        </p>
      </header>

      <Panel>
        <PanelBody style={{ textAlign: "center", padding: "40px 16px" }}>
          <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", margin: "0 0 16px" }}>
            Project workspace integration is not yet available.
          </p>
          <Btn variant="primary" disabled>Create project</Btn>
        </PanelBody>
      </Panel>
    </div>
  );
}
