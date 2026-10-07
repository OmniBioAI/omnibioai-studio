import React from "react";
import { Panel, PanelBody, PanelHeader } from "./UI";
import StaticPngResult from "./StaticPngResult";
import ArtifactList from "./workbench/results/ArtifactList";

export default function PluginResults({ artifacts = [], pluginSlug, runId, renderEndpoint, render }) {
  return (
    <Panel>
      <PanelHeader title="Artifacts" />
      <PanelBody>
        {renderEndpoint && render ? <StaticPngResult renderEndpoint={renderEndpoint} render={render} /> : null}
        <ArtifactList artifacts={artifacts} pluginSlug={pluginSlug} runId={runId} />
      </PanelBody>
    </Panel>
  );
}
