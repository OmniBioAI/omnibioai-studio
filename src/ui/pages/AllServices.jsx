import React from "react";
import { hasAnyPermission } from "../lib/adminNavigation";
import "./NavigationRedesign.css";

export const ALL_SERVICES = Object.freeze([
  { name: "Getting started", description: "Setup and platform guide", url: "/_svc/docs/user/getting-started/" },
  { name: "Video tutorials", description: "Tutorial videos and walkthroughs", url: "/_svc/videos" },
  { name: "LIMS", description: "Laboratory data management", url: "/_svc/lims/" },
  { name: "Model registry", description: "ML model versioning", url: "/_svc/modelregistry" },
  { name: "Dev Hub", description: "Knowledge graph and developer tools", url: "/_svc/devhub" },
  { name: "Billing", description: "Plans, usage, and status", nav: 12 },
  { name: "Membership and storage", description: "Personal storage and membership", nav: 32 },
  { name: "API keys", description: "Organization API credentials", nav: 14, permissions: ["manage_api_keys", "manage_org"] },
  { name: "Admin console", description: "Organization and platform administration", url: "https://admin.omnibioai.org/", permissions: ["platform.manage_infra"] },
  { name: "Control center", description: "Ecosystem operations", url: "/_svc/control/", permissions: ["platform.manage_infra"] },
  { name: "Platform health", description: "Platform service health", url: "https://control.omnibioai.org", permissions: ["platform.manage_infra"] },
  { name: "Metrics", description: "Grafana dashboards", url: "/_svc/monitor", permissions: ["platform.manage_infra"] },
  { name: "Tool images", description: "Tool image builds", url: "/_svc/toolimages", permissions: ["manage_config"] },
  { name: "Neo4j browser", description: "Knowledge graph console", url: "/neo4j/browser/", permissions: ["platform.manage_infra"] },
]);

function open(module) {
  if (module.nav !== undefined) window.dispatchEvent(new CustomEvent("navigate", { detail: module.nav }));
  else window.dispatchEvent(new CustomEvent("open-service", { detail: { url: module.url, label: module.name } }));
}

export default function AllServices({ currentUser }) {
  const visible = ALL_SERVICES.filter(module => !module.permissions || hasAnyPermission(currentUser, module.permissions));
  return <section className="all-services"><header><span>Directory</span><h1>All services</h1><p>Every module that is no longer featured on Home.</p></header>
    <div>{visible.map(module => <button key={module.name} type="button" onClick={() => open(module)}><strong>{module.name}</strong><span>{module.description}</span><em>Open →</em></button>)}</div>
  </section>;
}
