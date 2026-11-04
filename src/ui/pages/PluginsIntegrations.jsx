import React, { useState } from "react";
import Integrations from "./Integrations";
import Workbench from "./Workbench";
import "./NavigationRedesign.css";

export function pluginsIntegrationsView(search = window.location.search) {
  return new URLSearchParams(search).get("view") === "integrations" ? "integrations" : "plugins";
}

export default function PluginsIntegrations({
  state,
  onStateChange,
  onOpen,
  onOrganizationConnections,
  onProviderCountChange,
}) {
  const [view, setView] = useState(() => pluginsIntegrationsView());

  function select(next) {
    const url = next === "integrations" ? "/studio/plugins?view=integrations" : "/studio/plugins";
    window.history.replaceState(window.history.state, "", url);
    setView(next);
  }

  return <section className="plugins-integrations">
    <div className="plugins-integrations__tabs" role="tablist" aria-label="Plugins and integrations views">
      <button type="button" role="tab" aria-selected={view === "plugins"} onClick={() => select("plugins")}>Plugins</button>
      <button type="button" role="tab" aria-selected={view === "integrations"} onClick={() => select("integrations")}>Integrations</button>
    </div>
    {view === "plugins"
      ? <Workbench view="plugins" state={state} onStateChange={onStateChange} onOpen={onOpen} />
      : <Integrations onOrganizationConnections={onOrganizationConnections} onProviderCountChange={onProviderCountChange} />}
  </section>;
}
