import React from "react";
import { Panel, PanelBody, PanelHeader } from "./UI";
import StaticPngResult from "./StaticPngResult";
import ArtifactList from "./workbench/results/ArtifactList";
import ImageGallery from "./workbench/results/ImageGallery";

export default function PluginResults({ artifacts = [], pluginSlug, runId, renderEndpoint, render }) {
  return (
    <Panel>
      <PanelHeader title="Artifacts" />
      <PanelBody>
        {renderEndpoint && render ? <StaticPngResult renderEndpoint={renderEndpoint} render={render} /> : null}
        <ImageGallery artifacts={artifacts} pluginSlug={pluginSlug} runId={runId} />
        <ArtifactList artifacts={artifacts} pluginSlug={pluginSlug} runId={runId} />
      </PanelBody>
    </Panel>
  );
}
