import React, { useState } from "react";
import PluginPage from "./PluginPage";
import "./NavigationRedesign.css";

const TABS = [
  ["Catalog", "dataset_catalog"], ["Data manager", "data_manager"], ["Ingest", "dataset_ingest"],
];

export default function DataHub() {
  const [active, setActive] = useState("Catalog");
  const slug = TABS.find(([label]) => label === active)[1];
  return <section className="data-hub"><header><h1>Data</h1><p>Find, manage, and import governed datasets.</p></header>
    <div role="tablist" aria-label="Data sections">{TABS.map(([label]) => <button key={label} type="button" role="tab" aria-selected={active === label} onClick={() => setActive(label)}>{label}</button>)}</div>
    <div role="tabpanel" aria-label={active}><PluginPage key={slug} slug={slug} label={active} hideBack /></div>
  </section>;
}
