import React, { useEffect, useState } from "react";
import { Button, Spinner } from "@omnibioai/ui";
import ServiceViewer from "./ServiceViewer";
import GenericPluginRunner from "../components/GenericPluginRunner";
import { loadPluginDescriptor } from "../lib/pluginApi";
import WorkbenchBase from "../components/WorkbenchBase";
import OmniPage from "../components/OmniPage";

export default function PluginPage({ slug, url, label, onBack }) {
  const [descriptor, setDescriptor] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setDescriptor(null); setError(null);
    loadPluginDescriptor(slug, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setDescriptor(data); })
      .catch(nextError => { if (!controller.signal.aborted) setError(nextError); });
    return () => controller.abort();
  }, [slug, attempt]);

  if (error?.status === 404 || (descriptor && (descriptor.native_supported === false || descriptor.renderer !== "generic_runner"))) {
    return <ServiceViewer url={url} label={label} onBack={onBack} backLabel="Back to Workbench" />;
  }
  if (error) {
    return <WorkbenchBase className="native-plugin-error">
      <OmniPage title={label} error={error.message || "Unable to load plugin UI."}>
        <Button onClick={() => setAttempt(value => value + 1)}>Retry</Button>
      </OmniPage>
    </WorkbenchBase>;
  }
  if (!descriptor) return <WorkbenchBase className="native-plugin-loading"><div role="status"><Spinner /> Loading plugin…</div></WorkbenchBase>;
  return (
    <WorkbenchBase className="native-plugin-shell">
      <OmniPage title={descriptor.plugin.name} subtitle={descriptor.plugin.description}
        meta={<><span className="plugin-meta">v{descriptor.plugin.version}</span><span className="plugin-meta">{descriptor.plugin.category}</span></>}
        actions={<Button onClick={onBack}>Back to Workbench</Button>}>
        <GenericPluginRunner descriptor={descriptor} />
      </OmniPage>
    </WorkbenchBase>
  );
}
