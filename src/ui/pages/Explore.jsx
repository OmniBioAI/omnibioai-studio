import React, { useEffect, useMemo, useState } from "react";
import { Badge, Spinner } from "@omnibioai/ui";
import { Panel, PanelBody } from "../components/UI";
import { loadExploreResources } from "../lib/exploreApi";

const FILTERS = [["all", "All"], ["tool", "Tools"], ["workflow", "Workflows"], ["service", "Services"], ["capability", "Capabilities"]];
const MAX_RESULTS = 200;
const searchableText = resource => [resource.name, resource.description, ...(resource.tags || [])].join(" ").toLowerCase();

export default function Explore({ onOpen }) {
  const [resources, setResources] = useState([]);
  const [failures, setFailures] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    loadExploreResources({ signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) { setResources(result.resources); setFailures(result.failures); setError(""); }
    }).catch(() => { if (!controller.signal.aborted) setError("Discovery sources are temporarily unavailable.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return resources.filter(resource => (filter === "all" || resource.type === filter) && (!term || searchableText(resource).includes(term))).slice(0, MAX_RESULTS);
  }, [filter, query, resources]);

  return <div className="explore-page">
    <header className="explore-header"><h1>Explore</h1><p>Discover tools, workflows, services and scientific capabilities across OmniBioAI.</p></header>
    <Panel><PanelBody>
      <label className="explore-search">Search OmniBioAI
        <input type="search" value={query} placeholder="Search OmniBioAI..." aria-label="Search OmniBioAI" onChange={event => setQuery(event.target.value)} />
      </label>
      <div className="explore-filters" role="group" aria-label="Explore resource filters">
        {FILTERS.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}{!loading && <Badge>{resources.filter(item => value === "all" || item.type === value).length}</Badge>}</button>)}
      </div>
    </PanelBody></Panel>
    {loading ? <div className="explore-message" role="status"><Spinner /> Loading discovery sources…</div>
      : error ? <Panel><PanelBody><p className="explore-message" role="alert">{error}</p></PanelBody></Panel>
      : <>
        {failures.length > 0 && <p className="explore-partial" role="status">Some discovery sources could not be loaded: {failures.join(" and ")}.</p>}
        <p className="explore-summary" role="status">Showing {visible.length} of {resources.length} resources</p>
        {visible.length === 0 ? <Panel><PanelBody><p className="explore-message">{resources.length === 0 ? "No resources are available from the current discovery sources." : `No results found for "${query.trim()}".`}{resources.length > 0 && <span> Try another search term or category.</span>}</p></PanelBody></Panel>
          : <div className="explore-grid">{visible.map(resource => <Panel key={resource.id}><PanelBody>
            <div className="explore-card-type">{resource.type}</div><h2>{resource.name}</h2>
            {resource.description && <p className="explore-description">{resource.description}</p>}
            {resource.tags?.length > 0 && <div className="explore-tags">{resource.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
            <button type="button" className="explore-action" onClick={() => onOpen?.(resource.destination, resource)} aria-label={`Open ${resource.name}`}>{resource.destination?.label || "View"} <span aria-hidden="true">→</span></button>
          </PanelBody></Panel>)}</div>}
      </>}
  </div>;
}
