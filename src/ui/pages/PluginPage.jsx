import React, { useEffect, useState } from "react";
import { Button, Spinner } from "@omnibioai/ui";
import { resolveWorkbenchRenderer } from "../components/workbench/rendererRegistry";
import { loadPluginDescriptor } from "../lib/pluginApi";
import WorkbenchBase from "../components/WorkbenchBase";
import OmniPage from "../components/OmniPage";
import { safeErrorMessage } from "../lib/safeErrorMessage";

export default function PluginPage({ slug, label, onBack, backLabel = "Back to Workbench" }) {
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

  const Renderer = descriptor ? resolveWorkbenchRenderer(descriptor.renderer, descriptor.plugin?.slug || slug) : null;
  const renderError = error || (descriptor && !Renderer
    ? new Error("This plugin does not expose a supported React interface.")
    : null);
  if (renderError) {
    return <WorkbenchBase className="native-plugin-error">
      <OmniPage title={label} error={safeErrorMessage(renderError, "Unable to load plugin UI. Please try again.")}>
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
