import React, { useMemo, useState } from "react";
import { BACKENDS, TOOL_CATEGORIES, backendCounts, backendKeyForServer, emptyState } from "./toolModel";

// Catalog view modelled on the v0.8.1 TES "Tool Documentation" page: header with
// the tool count and a strip of backend count chips, one compact row (search,
// backend pills, category, Runnable only, "N / total"), a dense grid of
// clickable cards, and a side panel with run views, backend status and Submit Run.
const RUN_VIEWS = [
  ["All", () => true, ""],
  ["Running", run => run.state === "RUNNING", "running"],
  ["Submitted", run => ["CREATED", "VALIDATED", "QUEUED"].includes(run.state), "submitted"],
  ["Failed", run => run.state === "FAILED" || run.state === "TIMED_OUT", "failed"],
  ["Completed", run => run.state === "COMPLETED", "completed"],
];

function backendAvailability(servers) {
  // label -> "available" | "unavailable" | "unknown" (no server of that kind configured)
  const state = {};
  for (const srv of Array.isArray(servers) ? servers : []) {
    const key = backendKeyForServer(srv);
    if (!key) continue;
    const label = BACKENDS.find(b => b.key === key)?.label;
    if (srv.available !== false) state[label] = "available";
    else if (!state[label]) state[label] = "unavailable";
  }
  return state;
}

export default function ToolsList({ cards, verified, servers = [], runs = [], initialQuery = "", onOpen, onOpenJobs }) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("All");
  const [backend, setBackend] = useState("Any");
  const [showAll, setShowAll] = useState(false);

  const q = query.trim().toLowerCase();
  const matchesQuery = tool => !q || `${tool.name} ${tool.id} ${tool.description} ${tool.tags.join(" ")}`.toLowerCase().includes(q);
  const matchesStatus = tool => !verified || showAll || tool.verification.listedByDefault;
  const matchesBackend = tool => backend === "Any" || tool.backends.includes(backend);
  const matchesCategory = tool => category === "All" || tool.category === category;

  const afterStatus = useMemo(() => cards.filter(matchesStatus), [cards, verified, showAll]);
  const afterBackend = useMemo(() => afterStatus.filter(matchesBackend), [afterStatus, backend]);
  const afterCategory = useMemo(() => afterBackend.filter(matchesCategory), [afterBackend, category]);
  const visible = useMemo(() => afterCategory.filter(matchesQuery), [afterCategory, q]);
  const totalCounts = useMemo(() => backendCounts(cards), [cards]);
  const availability = useMemo(() => backendAvailability(servers), [servers]);
  const runnableCount = cards.filter(tool => tool.verification.status === "runnable").length;
  const hiddenCount = cards.filter(tool => !tool.verification.listedByDefault).length;
  const empty = visible.length ? null : emptyState({
    total: cards.length, afterStatus: afterStatus.length, afterBackend: afterBackend.length, afterCategory: afterCategory.length,
    afterQuery: visible.length, showAll: showAll || !verified, backend, category, query, servers,
  });
  const runningCount = runs.filter(run => run.state === "RUNNING").length;

  return <div className="tools-docs">
    <div className="tools-docs__main">
      <header className="tools-docs__header">
        <div>
          <h2>Tools</h2>
          <p>{cards.length.toLocaleString("en-US")} tools{verified ? ` · ${runnableCount.toLocaleString("en-US")} runnable HTTP tools` : ""}</p>
        </div>
      </header>

      <div className="tools-docs__stats" role="list" aria-label="Tools per backend">
        {BACKENDS.map(b => {
          const state = availability[b.label] || "unknown";
          return <div key={b.key} role="listitem" className={`tools-docs__stat tools-docs__stat--${state}`}
            title={state === "unavailable" ? `${b.label} backend unavailable` : state === "available" ? `${b.label} backend available` : `No ${b.label} backend configured`}>
            <span className={`backend-badge backend-badge--${b.key}`}>{b.label}</span>{" "}
            <strong>{(totalCounts[b.label] || 0).toLocaleString("en-US")}</strong>
            {state === "unavailable" && <>{" "}<span className="tools-docs__stat-state">unavailable</span></>}
          </div>;
        })}
      </div>

      <div className="tools-docs__filters" role="search" aria-label="Filter tools">
        <input className="tools-docs__search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tools…" aria-label="Search tools" />
        <div className="tools-docs__pills" role="group" aria-label="Runs on">
          <button type="button" aria-pressed={backend === "Any"} onClick={() => setBackend("Any")}>All</button>
          {BACKENDS.filter(b => totalCounts[b.label] > 0).map(b => <button key={b.key} type="button" aria-pressed={backend === b.label} onClick={() => setBackend(b.label)}>{b.label}</button>)}
        </div>
        <label className="tools-docs__category">
          <span className="tools-docs__sr-only">Category</span>
          <select value={category} onChange={event => setCategory(event.target.value)} aria-label="Category">
            {["All", ...TOOL_CATEGORIES].map(value => <option key={value} value={value}>{value === "All" ? "All categories" : value}</option>)}
          </select>
        </label>
        {verified && <label className="tools-docs__toggle">
          <input type="checkbox" checked={!showAll} onChange={event => setShowAll(!event.target.checked)} />
          <span>Runnable only</span>
        </label>}
        <span className="tools-docs__count" role="status" aria-label="Tools shown">{visible.length.toLocaleString("en-US")} / {cards.length.toLocaleString("en-US")}</span>
      </div>
      <p className="tools-docs__sr-only" role="status">{!verified
        ? `Showing ${visible.length} of ${cards.length} tools (verification status unavailable)`
        : showAll
          ? `Showing ${visible.length} of ${cards.length} tools (${runnableCount} runnable HTTP tools)`
          : `Showing ${visible.length} of ${cards.length - hiddenCount} tools (${runnableCount} runnable HTTP tools; ${hiddenCount} not working, not yet tested or unavailable hidden)`}</p>

      {empty ? <div className="tools-empty" role="status">
        <strong>{empty.title}</strong>
        <span>{empty.hint}</span>
        {empty.action === "show-all" && <button type="button" onClick={() => setShowAll(true)}>Show all</button>}
        {empty.action === "clear-search" && <button type="button" onClick={() => setQuery("")}>Clear search</button>}
      </div> : <ul className="tools-docs__grid">{visible.map(tool => <li key={tool.id}>
        <a className="tool-card" href={`/studio/tools/${tool.id}`} onClick={event => { if (event.metaKey || event.ctrlKey || event.button !== 0) return; event.preventDefault(); onOpen?.(tool.id); }}
          aria-label={`${tool.name}${verified && tool.verification.label ? `, ${tool.verification.label.toLowerCase()}` : ""}`}>
          <div className="tool-card__top">
            <div className="tool-card__text">
              <span className="tool-card__name">{tool.id}</span>
              <span className="tool-card__description">{tool.description}</span>
            </div>
            <span className="tool-card__chevron" aria-hidden="true">›</span>
          </div>
          <div className="tool-card__tags">
            <span className="tool-card__category">{tool.category}</span>
            {tool.backendKeys.map(key => <span key={key} className={`backend-badge backend-badge--${key}`}>{BACKENDS.find(b => b.key === key)?.label}</span>)}
            {verified && tool.verification.label && <span className={`tool-card__badge ${tool.verification.className}`} title={tool.verification.title}>{tool.verification.label}</span>}
          </div>
        </a>
      </li>)}</ul>}
    </div>

    <aside className="tools-docs__side" aria-label="Runs and backends">
      <section>
        <h3>Views</h3>
        <ul className="tools-docs__views">{RUN_VIEWS.map(([label, matches, state]) => <li key={label}>
          <a href={`/studio/jobs${state ? `?state=${state}` : ""}`} onClick={event => { if (event.metaKey || event.ctrlKey || event.button !== 0) return; event.preventDefault(); onOpenJobs?.(state ? `?state=${state}` : ""); }}>
            <span>{label}</span><span className="tools-docs__pill-count">{runs.filter(matches).length.toLocaleString("en-US")}</span>
          </a>
        </li>)}</ul>
      </section>
      <section>
        <h3>Backends</h3>
        {servers.length === 0 ? <p className="tools-docs__muted">No backends reported.</p> : <ul className="tools-docs__servers">{servers.map(srv => {
          const key = backendKeyForServer(srv);
          const label = BACKENDS.find(b => b.key === key)?.label || srv.adapter_type;
          const online = srv.available !== false;
          return <li key={srv.server_id} className={online ? "is-online" : "is-unavailable"} title={online ? undefined : srv.unavailable_reason || "unavailable"}>
            <span className="tools-docs__dot" aria-hidden="true" />
            <span className="tools-docs__server-name">{srv.display_name || srv.server_id}</span>
            <span className="tools-docs__server-meta"><span className={`backend-badge backend-badge--${key || "local"}`}>{label}</span><span className="tools-docs__server-state">{online ? "online" : "unavailable"}</span></span>
          </li>;
        })}</ul>}
      </section>
      <section className="tools-docs__submit">
        <button type="button" className="tools-docs__submit-button" onClick={() => onOpenJobs?.("?submit=1")}>+ Submit Run</button>
        <span className="tools-docs__muted">{runningCount.toLocaleString("en-US")} running</span>
      </section>
    </aside>
  </div>;
}
