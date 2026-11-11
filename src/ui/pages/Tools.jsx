import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { safeErrorMessage } from "../lib/safeErrorMessage";
import { tesApiFetch } from "../lib/tesApi";
import { listenForStudioNavigation, studioToolPath, toolIdFromStudioPath, writeStudioLocation } from "../lib/studioRouter";
import ToolsList from "./tools/ToolsList";
import ToolDetail from "./tools/ToolDetail";
import { hasVerificationData, toolPresentation, toolRunsTemporarilyUnavailable } from "./tools/toolModel";
import "./NavigationRedesign.css";
import "./Tools.css";

export { TOOL_CATEGORIES, TOOL_BACKENDS, VERIFICATION, hasVerificationData, toolVerification, toolPresentation, toolRunsTemporarilyUnavailable } from "./tools/toolModel";

// Tools catalog (/studio/tools) and tool detail (/studio/tools/:toolId). The list
// loads the catalog once; the detail page asks TES for the single tool.
export default function Tools({ initialQuery = "", onOpenJobs }) {
  const [tools, setTools] = useState([]);
  const [servers, setServers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [toolId, setToolId] = useState(() => toolIdFromStudioPath(globalThis.window?.location?.pathname));
  const showUnavailableNotice = toolRunsTemporarilyUnavailable() && !noticeDismissed;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      tesApiFetch("/api/tools", { signal: controller.signal }),
      tesApiFetch("/api/servers", { signal: controller.signal }).catch(() => []),
    ])
      .then(([toolList, serverList]) => { setTools(Array.isArray(toolList) ? toolList : []); setServers(Array.isArray(serverList) ? serverList : []); })
      .catch(failure => { if (!controller.signal.aborted) setError(safeErrorMessage(failure, "Could not load tools.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => listenForStudioNavigation(route => setToolId(route.toolId || null)), []);

  const verified = useMemo(() => hasVerificationData(tools), [tools]);
  const cards = useMemo(() => tools.map(tool => toolPresentation(tool, servers)), [tools, servers]);

  const openTool = id => { writeStudioLocation(studioToolPath(id), { preserveSearch: false }); setToolId(id); window.scrollTo?.(0, 0); };
  const backToList = () => { writeStudioLocation("/studio/tools", { preserveSearch: false }); setToolId(null); };
  const runSubmitted = runId => {
    // Land on Jobs with the new run selected; handleNavClick keeps the query string.
    window.history.pushState(window.history.state, "", `/studio/jobs?run=${encodeURIComponent(runId)}`);
    onOpenJobs?.(runId);
  };

  return <section className="tools-page">
    <PageHeader title={toolId ? "Tools" : "Tools"} description={toolId ? undefined : "Browse tools and run them on the available backends"} />
    {showUnavailableNotice && <div className="tools-availability-notice" role="status">
      <span>Tool runs are temporarily unavailable</span>
      <button type="button" onClick={() => setNoticeDismissed(true)} aria-label="Dismiss tool availability notice">Dismiss</button>
    </div>}
    {toolId
      ? <ToolDetail toolId={toolId} fallbackTool={tools.find(t => t.tool_id === toolId) || null} servers={servers} onBack={backToList} onRunSubmitted={runSubmitted} />
      : loading ? <p role="status">Loading tools…</p>
        : error ? <p role="alert">{error}</p>
          : <ToolsList cards={cards} verified={verified} servers={servers} initialQuery={initialQuery} onOpen={openTool} />}
  </section>;
}
