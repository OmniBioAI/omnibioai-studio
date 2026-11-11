import React, { useMemo, useState } from "react";
import { BACKENDS, TOOL_CATEGORIES, backendCounts, emptyState } from "./toolModel";

// Catalog view: one compact filter row (search, category, "Runs on" chips with counts,
// Runnable-only toggle) and a grid of clickable cards.
export default function ToolsList({ cards, verified, servers = [], initialQuery = "", onOpen }) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("All");
  const [backend, setBackend] = useState("Any");
  const [showAll, setShowAll] = useState(false);

  const q = query.trim().toLowerCase();
  const matchesQuery = tool => !q || `${tool.name} ${tool.id} ${tool.description}`.toLowerCase().includes(q);
  const matchesStatus = tool => !verified || showAll || tool.verification.listedByDefault;
  const matchesBackend = tool => backend === "Any" || tool.backends.includes(backend);
  const matchesCategory = tool => category === "All" || tool.category === category;

  const afterStatus = useMemo(() => cards.filter(matchesStatus), [cards, verified, showAll]);
  const afterBackend = useMemo(() => afterStatus.filter(matchesBackend), [afterStatus, backend]);
  const afterCategory = useMemo(() => afterBackend.filter(matchesCategory), [afterBackend, category]);
  const visible = useMemo(() => afterCategory.filter(matchesQuery), [afterCategory, q]);
  // Chip counts reflect the status toggle and the search, not the backend chip itself.
  const counts = useMemo(() => backendCounts(afterStatus.filter(matchesCategory).filter(matchesQuery)), [afterStatus, category, q]);
  const runnableCount = cards.filter(tool => tool.verification.status === "runnable").length;
  const hiddenCount = cards.filter(tool => !tool.verification.listedByDefault).length;
  const backendOptions = BACKENDS.map(b => b.label).filter(label => counts[label] > 0 || label === backend);
  const empty = visible.length ? null : emptyState({
    total: cards.length, afterStatus: afterStatus.length, afterBackend: afterBackend.length, afterCategory: afterCategory.length,
    afterQuery: visible.length, showAll: showAll || !verified, backend, category, query, servers,
  });

  return <>
    <div className="tools-filters" role="search" aria-label="Filter tools">
      <input className="tools-filters__search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tools…" aria-label="Search tools" />
      <label className="tools-filters__category">
        <span>Category</span>
        <select value={category} onChange={event => setCategory(event.target.value)}>
          {["All", ...TOOL_CATEGORIES].map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <div className="tools-filters__chips" role="group" aria-label="Runs on">
        <button type="button" aria-pressed={backend === "Any"} onClick={() => setBackend("Any")}>Any <span className="tools-chip__count">{afterStatus.filter(matchesCategory).filter(matchesQuery).length.toLocaleString("en-US")}</span></button>
        {backendOptions.map(label => <button key={label} type="button" aria-pressed={backend === label} onClick={() => setBackend(label)}>
          {label} <span className="tools-chip__count">{(counts[label] || 0).toLocaleString("en-US")}</span>
        </button>)}
      </div>
      {verified && <div className="tools-filters__toggle" role="group" aria-label="Verification">
        <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)}>Runnable only</button>
        <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)}>Show all</button>
      </div>}
    </div>

    <p className="tools-status" role="status">{!verified
      ? `Showing ${visible.length.toLocaleString("en-US")} of ${cards.length.toLocaleString("en-US")} tools (verification status unavailable)`
      : showAll
        ? `Showing ${visible.length.toLocaleString("en-US")} of ${cards.length.toLocaleString("en-US")} tools (${runnableCount.toLocaleString("en-US")} runnable HTTP tools)`
        : `Showing ${visible.length.toLocaleString("en-US")} of ${(cards.length - hiddenCount).toLocaleString("en-US")} tools (${runnableCount.toLocaleString("en-US")} runnable HTTP tools; ${hiddenCount.toLocaleString("en-US")} not working, not yet tested or unavailable hidden)`}</p>

    {empty ? <div className="tools-empty" role="status">
      <strong>{empty.title}</strong>
      <span>{empty.hint}</span>
      {empty.action === "show-all" && <button type="button" onClick={() => setShowAll(true)}>Show all</button>}
      {empty.action === "clear-search" && <button type="button" onClick={() => setQuery("")}>Clear search</button>}
    </div> : <ul className="tool-card-grid">{visible.map(tool => <li key={tool.id}>
      <a className="tool-card" href={`/studio/tools/${tool.id}`} onClick={event => { if (event.metaKey || event.ctrlKey || event.button !== 0) return; event.preventDefault(); onOpen?.(tool.id); }}
        aria-label={`${tool.name}${verified && tool.verification.label ? `, ${tool.verification.label.toLowerCase()}` : ""}`}>
        <div className="tool-card__labels"><span className="tool-card__category">{tool.category}</span>
          {verified && tool.verification.label && <span className={`tool-card__badge ${tool.verification.className}`} title={tool.verification.title}>{tool.verification.label}</span>}</div>
        <h2>{tool.name}</h2>
        <p>{tool.description}</p>
        <div className="tool-card__footer"><span>{tool.backends.length ? tool.backends.join(" · ") : "No backend"}</span></div>
      </a>
    </li>)}</ul>}
  </>;
}
