import React from "react";
import { Panel, PanelBody, PanelHeader } from "./UI";
import { pluginEndpoint } from "../lib/pluginApi";
import StaticPngResult from "./StaticPngResult";

export default function PluginResults({ outputs, downloadEndpoint, renderEndpoint, render }) {
  return (
    <Panel>
      <PanelHeader title="Artifacts" />
      <PanelBody>
        {renderEndpoint && render ? <StaticPngResult renderEndpoint={renderEndpoint} render={render} /> : null}
        {!outputs.length ? <p className="plugin-muted">The run completed without published artifacts.</p> : (
          <ul className="plugin-artifact-list">
            {outputs.map((output, index) => {
              const path = typeof output?.path === "string" ? output.path : "";
              const params = new URLSearchParams({ path });
              const href = path ? `${pluginEndpoint(downloadEndpoint, {})}?${params.toString()}` : null;
              return (
                <li key={`${path}-${index}`}>
                  <span><strong>{output.label || "Output"}</strong> <small>{output.type || output.mime || "file"}</small></span>
                  {href && <a href={href}>Download</a>}
                </li>
              );
            })}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
