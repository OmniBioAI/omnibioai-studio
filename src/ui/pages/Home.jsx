import React, { useEffect, useMemo, useState } from "react";
import { tesApiFetch } from "../lib/tesApi";
import "./NavigationRedesign.css";

const START = [
  ["Getting started", "Learn the platform basics", { service: "/_svc/docs/user/getting-started/" }],
  ["Run a workflow", "Launch a reusable analysis", { nav: 19 }],
  ["Run a tool", "Browse the TES tool catalog", { nav: 37 }],
  ["Workbench", "Open the application catalog", { nav: 13 }],
  ["Import data", "Validate and register scientific data", { nav: 38 }],
  ["New project", "Organize a new research effort", { nav: 20 }],
];

function firstName(user) {
  const candidate = user?.given_name || user?.first_name || user?.name?.split(/\s+/)[0] || user?.email?.split("@")[0];
  return candidate || "there";
}

function navigate(destination) {
  if (destination.nav !== undefined) window.dispatchEvent(new CustomEvent("navigate", { detail: destination.nav }));
  else window.dispatchEvent(new CustomEvent("open-service", { detail: { url: destination.service, label: "Getting started" } }));
}

export default function Home({ currentUser }) {
  const [runs, setRuns] = useState([]);
  const [toolCount, setToolCount] = useState(null);
  const [jobsUnavailable, setJobsUnavailable] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    tesApiFetch("/api/runs", { signal: controller.signal }).then(value => setRuns(Array.isArray(value) ? value : []))
      .catch(() => { if (!controller.signal.aborted) setJobsUnavailable(true); });
    // Only tools that passed an end-to-end run count as runnable (TES /api/tools?status=runnable).
    tesApiFetch("/api/tools?status=runnable", { signal: controller.signal }).then(value => setToolCount(Array.isArray(value) ? value.length : null))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const recent = useMemo(() => [...runs].reverse().slice(0, 5), [runs]);
  function submitSearch(event) {
    event.preventDefault();
    const query = search.trim();
    window.history.replaceState(window.history.state, "", `/studio/tools${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    window.dispatchEvent(new CustomEvent("navigate", { detail: 37 }));
  }
  return <section className="studio-home">
    <header className="studio-home__hero"><div><span>OmniBioAI Studio</span><h1>Welcome back, {firstName(currentUser)}</h1><p>Continue your research or start something new.</p></div>
      <form role="search" onSubmit={submitSearch}><label htmlFor="global-search">Search tools, workflows, and data</label><div><input id="global-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tools, workflows, and data…" /><button type="submit">Search</button></div><small>Search currently opens the Tools catalog; no combined search endpoint is available.</small></form>
    </header>
    <section><div className="home-section-heading"><div><span>Quick actions</span><h2>Start here</h2></div></div><div className="start-card-grid">
      {START.map(([label, description, destination]) => <button key={label} type="button" onClick={() => navigate(destination)}><span>{label}</span><small>{description}</small>{label === "Run a tool" && <strong>{toolCount === null ? `${runs.length} recent runs` : `${toolCount.toLocaleString("en-US")} runnable HTTP ${toolCount === 1 ? "tool" : "tools"}`}</strong>}</button>)}
    </div></section>
    <section><div className="home-section-heading"><div><span>Your activity</span><h2>Recent jobs</h2></div><button type="button" onClick={() => navigate({ nav: 9 })}>View all</button></div>
      {jobsUnavailable ? <p role="alert">Recent jobs are unavailable.</p> : recent.length ? <div className="recent-jobs">{recent.map(run => <button type="button" key={run.run_id} onClick={() => navigate({ nav: 9 })}><span><strong>{run.tool_id || "Tool run"}</strong><small>{run.run_id}</small></span><em data-state={run.state}>{run.state || "Unknown"}</em></button>)}</div> : <p>No tool runs yet.</p>}
      <p className="home-job-note">TES tool runs are shown here. The existing workflow service has no compatible combined runs endpoint, so workflow history remains in Workflows.</p>
    </section>
    <button className="all-services-link" type="button" onClick={() => navigate({ nav: 40 })}>All services <span>Browse every Studio module</span> →</button>
  </section>;
}
