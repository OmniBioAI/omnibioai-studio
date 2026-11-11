import React, { useEffect, useMemo, useState } from "react";
import { hasAnyPermission } from "../lib/adminNavigation";
import { pathForStudioPage } from "../lib/studioRouter";
import { useStorageUsage } from "../lib/useStorageUsage";
import { formatStorageBytes, MIN_VISIBLE_SEGMENT_PX } from "../lib/storageDashboard";
import { HEALTH_ENDPOINTS, refreshServiceHealth, useServiceHealth } from "../lib/serviceHealth";
import * as billingApi from "../lib/billingApi";
import { SERVICE_ICONS } from "../components/NavIcons";
import "./AllServices.css";

export const SERVICE_GROUPS = Object.freeze([
  { id: "learn", label: "Learn", layout: "wide" },
  { id: "account", label: "Your account" },
  { id: "science", label: "Science and data" },
  { id: "operations", label: "Operations", pill: "Admins only" },
]);

// `nav` cards open a Studio page (href is that page's canonical path, so the
// admin cards resolve through the admin route registry and its permission
// gate); `url` cards open an embedded service. `permissions` is the card's
// visibility check, unchanged from the flat list this replaces.
const page = nav => ({ nav, href: pathForStudioPage(nav) });
const service = url => ({ url, href: url });

export const ALL_SERVICES = Object.freeze([
  { group: "learn", title: "Getting started", description: "Setup and platform guide", icon: "bookOpen", ...service("/_svc/docs/user/getting-started/") },
  { group: "learn", title: "Video tutorials", description: "Tutorial videos and walkthroughs", icon: "monitorPlay", ...service("/_svc/videos") },
  { group: "account", title: "Membership and storage", description: "Your files, storage and membership", icon: "hardDrive", statusKey: "storage", ...page(32) },
  { group: "account", title: "Billing", description: "Plans, usage, and status", icon: "creditCard", statusKey: "plan", ...page(12) },
  { group: "account", title: "API keys", description: "Organization API credentials", icon: "key", ...page(14), permissions: ["manage_api_keys", "manage_org"] },
  { group: "science", title: "LIMS", description: "Laboratory data management", icon: "flask", ...service("/_svc/lims/") },
  { group: "science", title: "Model registry", description: "ML model versioning", icon: "layers", ...service("/_svc/modelregistry") },
  { group: "science", title: "Dev Hub", description: "Knowledge graph and developer tools", icon: "code", ...service("/_svc/devhub") },
  { group: "operations", title: "Admin console", description: "Organization and platform administration", icon: "shield", ...page(-10), permissions: ["platform.manage_infra"] },
  { group: "operations", title: "Control center", description: "Ecosystem operations", icon: "sliders", ...page(-11), permissions: ["platform.manage_infra"] },
  { group: "operations", title: "Platform health", description: "Platform service health", icon: "activity", statusKey: "health", ...page(-12), permissions: ["platform.manage_infra"] },
  { group: "operations", title: "Metrics", description: "Grafana dashboards", icon: "barChart", ...page(-13), permissions: ["platform.manage_infra"] },
  { group: "operations", title: "Neo4j browser", description: "Knowledge graph console", icon: "share", ...page(-15), permissions: ["platform.manage_infra"] },
  { group: "operations", title: "Tool images", description: "Tool image builds", icon: "box", ...page(-14), permissions: ["manage_config"] },
]);

const HEALTH_KEYS = Object.keys(HEALTH_ENDPOINTS);

export function visibleServices(user) {
  return ALL_SERVICES.filter(card => !card.permissions || hasAnyPermission(user, card.permissions));
}

export function matchesQuery(card, query) {
  const needle = query.trim().toLowerCase();
  return !needle || `${card.title} ${card.description}`.toLowerCase().includes(needle);
}

// Plain left clicks keep Studio's in-app navigation; modified clicks fall
// through to the browser so the href opens in a new tab or window.
function openCard(event, card) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (card.nav !== undefined) window.dispatchEvent(new CustomEvent("navigate", { detail: card.nav }));
  else window.dispatchEvent(new CustomEvent("open-service", { detail: { url: card.url, label: card.title } }));
}

function usePlan(orgId) {
  const [state, setState] = useState({ status: orgId ? "loading" : "none", plan: null });
  useEffect(() => {
    if (!orgId) { setState({ status: "none", plan: null }); return undefined; }
    let active = true;
    setState({ status: "loading", plan: null });
    billingApi.getSubscription(orgId)
      .then(subscription => { if (active) setState({ status: "success", plan: subscription?.plan_name || null }); })
      .catch(() => { if (active) setState({ status: "error", plan: null }); });
    return () => { active = false; };
  }, [orgId]);
  return state;
}

function useHealthSummary(enabled) {
  const snapshot = useServiceHealth();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    refreshServiceHealth(HEALTH_KEYS).finally(() => { if (active) setChecked(true); });
    return () => { active = false; };
  }, [enabled]);
  if (!enabled) return { status: "none" };
  if (!checked) return { status: "loading" };
  const states = HEALTH_KEYS.map(key => snapshot[key]?.state).filter(state => state && state !== "unknown");
  if (!states.length) return { status: "none" };
  const down = states.filter(state => state === "down").length;
  const degraded = states.filter(state => state === "degraded").length;
  if (down) return { status: "success", tone: "down", label: `${down} ${down === 1 ? "service" : "services"} down` };
  if (degraded) return { status: "success", tone: "degraded", label: `${degraded} degraded` };
  return { status: "success", tone: "up", label: `All ${states.length} services up` };
}

function Skeleton() {
  return <span className="service-card__skeleton" aria-hidden="true" />;
}

function StorageStatus({ usage }) {
  if (usage.status === "loading") return <Skeleton />;
  const value = usage.data;
  if (usage.status !== "success" || !value || !(value.quotaBytes > 0)) return null;
  const share = Math.min(1, value.usedBytes / value.quotaBytes);
  const label = `${formatStorageBytes(value.usedBytes)} of ${formatStorageBytes(value.quotaBytes)} used`;
  return <span className="service-card__usage">
    <span className="service-card__bar" aria-hidden="true">
      <span style={{ width: `${share * 100}%`, minWidth: value.usedBytes > 0 ? MIN_VISIBLE_SEGMENT_PX : 0 }} />
    </span>
    <span>{label}</span>
  </span>;
}

function PlanStatus({ plan }) {
  if (plan.status === "loading") return <Skeleton />;
  if (plan.status !== "success" || !plan.plan) return null;
  return <span className="service-card__pill">{plan.plan} (organization)</span>;
}

function HealthStatus({ health }) {
  if (health.status === "loading") return <Skeleton />;
  if (health.status !== "success") return null;
  return <span className="service-card__health" data-tone={health.tone}><span aria-hidden="true" />{health.label}</span>;
}

function ServiceCard({ card, status }) {
  const Icon = SERVICE_ICONS[card.icon];
  const Arrow = SERVICE_ICONS.arrowUpRight;
  return <a className="service-card" href={card.href} onClick={event => openCard(event, card)}>
    <span className="service-card__icon"><Icon width={20} height={20} /></span>
    <span className="service-card__body">
      <strong>{card.title}</strong>
      <span className="service-card__description">{card.description}</span>
      {status && <span className="service-card__status">{status}</span>}
    </span>
    <Arrow className="service-card__arrow" />
  </a>;
}

export default function AllServices({ currentUser }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => visibleServices(currentUser), [currentUser]);
  const canSeeHealth = visible.some(card => card.statusKey === "health");
  // Status fetches start once per page view and never gate the cards.
  const usage = useStorageUsage();
  const plan = usePlan(currentUser?.orgId);
  const health = useHealthSummary(canSeeHealth);
  const statuses = {
    storage: <StorageStatus usage={usage} />,
    plan: <PlanStatus plan={plan} />,
    health: <HealthStatus health={health} />,
  };
  const groups = SERVICE_GROUPS
    .map(group => ({ ...group, cards: visible.filter(card => card.group === group.id && matchesQuery(card, query)) }))
    .filter(group => group.cards.length);

  return <section className="all-services">
    <header className="all-services__header">
      <div>
        <span className="all-services__eyebrow">Directory</span>
        <h1>All services</h1>
        <p>Every OmniBioAI module in one place.</p>
      </div>
      <div className="all-services__search" role="search">
        <label htmlFor="all-services-search" className="studio-visually-hidden">Search services</label>
        <input id="all-services-search" type="search" value={query} placeholder="Search services"
          onChange={event => setQuery(event.target.value)} />
      </div>
    </header>
    {groups.map(group => <section key={group.id} className={`service-group service-group--${group.id}`}
      data-layout={group.layout} aria-labelledby={`service-group-${group.id}`}>
      <h2 id={`service-group-${group.id}`}>
        <span className="service-group__marker" aria-hidden="true" />{group.label}
        {group.pill && <span className="service-group__pill">{group.pill}</span>}
      </h2>
      <div className="service-group__grid">
        {group.cards.map(card => <ServiceCard key={card.title} card={card} status={card.statusKey && statuses[card.statusKey]} />)}
      </div>
    </section>)}
    {!groups.length && <p className="all-services__empty" role="status">No services match &ldquo;{query.trim()}&rdquo;</p>}
  </section>;
}
