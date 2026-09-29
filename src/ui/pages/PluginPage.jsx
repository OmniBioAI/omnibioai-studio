import React, { useEffect, useState } from "react";
import { Button, Spinner } from "@omnibioai/ui";
import ServiceViewer from "./ServiceViewer";
import { resolveWorkbenchRenderer } from "../components/workbench/rendererRegistry";
import { loadPluginDescriptor } from "../lib/pluginApi";
import WorkbenchBase from "../components/WorkbenchBase";
import OmniPage from "../components/OmniPage";

export default function PluginPage({ slug, url, label, onBack, backLabel = "Back to Workbench" }) {
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

  const Renderer = descriptor?.native_supported ? resolveWorkbenchRenderer(descriptor.renderer) : null;
  const invalidDescriptor = error?.name === "PluginDescriptorError" && error.status === 0;
  if (error?.status === 404 || invalidDescriptor || (descriptor && (descriptor.native_supported === false || !Renderer))) {
    return <ServiceViewer url={url} label={label} onBack={onBack} backLabel={backLabel} />;
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
        actions={<Button onClick={onBack}>{backLabel}</Button>}>
        <Renderer descriptor={descriptor} />
      </OmniPage>
    </WorkbenchBase>
  );
}
