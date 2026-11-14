import React, { useState } from "react";
import PluginPage from "./PluginPage";
import BioRepository from "../components/biorepo/BioRepository";
import { hasPermission } from "../lib/session";
import "./NavigationRedesign.css";

// [label, plugin slug or null for a native view, admin only]
const TABS = [
  ["Repository", null, false], ["Catalog", "dataset_catalog", false], ["Data manager", "data_manager", false],
  ["Ingest", "dataset_ingest", false], ["Capacity", null, true],
];

export default function DataHub() {
  const linked = new URLSearchParams(window.location.search).has("dataset");
  const [active, setActive] = useState(linked ? "Repository" : "Catalog");
  const tabs = TABS.filter(([, , admin]) => !admin || hasPermission("biorepo.admin"));
  const [, slug] = tabs.find(([label]) => label === active) || tabs[0];
  return <section className="data-hub"><header><h1>Data</h1><p>Find, manage, and import governed datasets.</p></header>
    <div role="tablist" aria-label="Data sections">{tabs.map(([label]) => <button key={label} type="button" role="tab" aria-selected={active === label} onClick={() => setActive(label)}>{label}</button>)}</div>
    <div role="tabpanel" aria-label={active}>{slug
      ? <PluginPage key={slug} slug={slug} label={active} hideBack />
      : <BioRepository key={active} view={active === "Capacity" ? "capacity" : "browse"} />}</div>
  </section>;
}
