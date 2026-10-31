import React, { useEffect, useRef, useState } from "react";
import { Card, Input, Badge, Spinner, Button } from "@omnibioai/ui";
import { Panel, PanelHeader, PanelBody } from "../components/UI";
import { applicationUrl, legacyWorkbenchUrl, loadWorkbenchCatalog } from "../lib/workbenchApi";
import { safeErrorMessage } from "../lib/safeErrorMessage";
import WorkbenchBase from "../components/WorkbenchBase";
import OmniPage from "../components/OmniPage";

const INTEGRATION_CATEGORIES = new Set(["integration", "reference_db"]);

export function categoriesForDiscoveryView(categories, view = "all") {
  if (view === "all") return categories;
  return categories
    .map(category => ({
      ...category,
      plugins: category.plugins.filter(plugin => {
        if (view === "integrations") return INTEGRATION_CATEGORIES.has(plugin.category);
        if (view === "agentic") return plugin.category === "ai";
        return !INTEGRATION_CATEGORIES.has(plugin.category) && plugin.category !== "ai";
      }),
    }))
    .filter(category => category.plugins.length > 0);
}

// State lives in App so a ServiceViewer round trip preserves the user's place.
export default function Workbench({ state, onStateChange, onOpen, view = "all" }) {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const cards = useRef({});

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    loadWorkbenchCatalog({ signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setCatalog(data); })
      .catch(err => { if (!controller.signal.aborted) setError(safeErrorMessage(err, "Could not load the Workbench catalog. Please try again.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!loading && !error && state.focusSlug) cards.current[state.focusSlug]?.focus();
  }, [loading, error]);

  const query = state.query.trim().toLowerCase();
  const categories = categoriesForDiscoveryView(catalog?.categories || [], view);
  const available = categories.reduce((sum, category) => sum + category.plugins.length, 0);
  const title = view === "agentic" ? "Agentic" : view === "plugins" ? "Plugins" : "Workbench";
  const panelTitle = view === "all" ? "Plugins" : title;
  // Preserve legacy search fields and its temporary all-category search mode.
  // Filtering never grants permission; launch destinations come from Django.
  const searched = categories.map(category => ({ ...category, plugins: category.plugins.filter(plugin =>
    !query || `${plugin.title} ${plugin.slug} ${plugin.category}`.toLowerCase().includes(query)
  ) }));
  const active = query ? "__all__" : state.category;
  const visible = searched.filter(category => active === "__all__" || category.key === active);
  const matched = searched.reduce((sum, category) => sum + category.plugins.length, 0);
  const shown = visible.reduce((sum, category) => sum + category.plugins.length, 0);
  const selectCategory = category => onStateChange({ ...state, category, query: "", focusSlug: null });

  function openPlugin(plugin) {
    onStateChange({ ...state, focusSlug: plugin.slug });
    onOpen(applicationUrl(plugin.launch_path), plugin.title, plugin);
  }

  return (
    <WorkbenchBase className="native-workbench">
      <OmniPage
        title={title}
        subtitle={catalog ? (view === "all" ? `${catalog.total_count} bioinformatics applications` : `${available} bioinformatics plugins`) : "Loading applications…"}
        className="native-workbench-page"
      >

      {loading ? <div role="status" className="native-workbench-message"><Spinner /> Loading applications…</div>
        : error ? <Panel><PanelBody>
          <p role="alert">{error}</p>
          <Button onClick={() => setAttempt(value => value + 1)}>Retry</Button>
          <Button variant="ghost" onClick={() => onOpen(legacyWorkbenchUrl(), "Workbench Dashboard")}>Use legacy Workbench catalog</Button>
        </PanelBody></Panel>
        : <>
          <Panel>
            <PanelHeader title={panelTitle} />
            <PanelBody>
              <label className="native-workbench-search" onKeyDown={event => {
                if (event.key === "Escape") onStateChange({ ...state, query: "", focusSlug: null });
              }}>
                {view === "all" ? "Search applications" : `Search ${view === "agentic" ? "agentic plugins" : "plugins"}`}
                <Input id="workbench-search" value={state.query} placeholder={view === "all" ? "Search applications…" : `Search ${view === "agentic" ? "agentic plugins" : "plugins"}…`}
                  onChange={event => onStateChange({ ...state, query: event.target.value, focusSlug: null })} />
              </label>
              <div role="group" aria-label="Plugin categories" className="native-workbench-filters">
                <button type="button" aria-pressed={active === "__all__"} onClick={() => selectCategory("__all__")}>
                  All <Badge>{matched}</Badge>
                </button>
                {searched.map(category => (
                  <button key={category.key} type="button" aria-pressed={active === category.key}
                    onClick={() => selectCategory(category.key)}>
                    {category.title} <Badge>{category.plugins.length}</Badge>
                  </button>
                ))}
              </div>
              <p role="status" className="native-workbench-summary">Showing {shown} of {view === "all" ? catalog.total_count : available} {view === "all" ? "applications" : "plugins"}</p>
            </PanelBody>
          </Panel>
          {shown === 0 ? <p className="native-workbench-message">
            {available === 0
              ? (view === "all" ? "No applications are available." : "No plugins are available in this category.")
              : (view === "all" ? "No applications match your search or category." : "No plugins match your search or category.")}
          </p> : visible.filter(category => category.plugins.length).map(category => (
            <section key={category.key} aria-label={category.title}>
              <h2 className="native-workbench-category">{category.title} <Badge>{category.plugins.length}</Badge></h2>
              <div className="native-workbench-grid">
                {category.plugins.map(plugin => (
                  <Card key={plugin.slug} className="native-workbench-card">
                    <h3><button type="button" className="native-workbench-launch" aria-label={`Open ${plugin.title}`}
                      ref={element => { cards.current[plugin.slug] = element; }}
                      onClick={() => openPlugin(plugin)}>{plugin.title}</button></h3>
                    <p>{plugin.description}</p>
                    <div className="native-workbench-meta"><Badge>v{plugin.version}</Badge><span>{plugin.category}</span></div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </>}
      </OmniPage>
    </WorkbenchBase>
  );
}
