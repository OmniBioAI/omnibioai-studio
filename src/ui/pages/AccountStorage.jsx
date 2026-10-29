import React, { useState } from "react";
import { Spinner } from "@omnibioai/ui";
import { useAccountDateTime } from "../components/PreferencesProvider";
import { useStorageUsage } from "../lib/useStorageUsage";
import { MEMBERSHIP_PLANS } from "../lib/membershipCatalog";
import { formatStorageBytes, storageSegments } from "../lib/storageDashboard";
import AccountState from "../components/AccountState";
import ManagedStorageFiles from "../components/ManagedStorageFiles";
import "./AccountStorage.css";

const ERROR_MESSAGES = {
  unauthorized: "Sign in again to view storage usage.",
  forbidden: "Access to storage usage was denied.",
  not_found: "Personal storage usage is not available from this service yet.",
  rate_limited: "Storage usage is temporarily rate limited. Please refresh later.",
};
const METRICS = [
  ["Used", "usedBytes", "Managed uploads and imports", "used"],
  ["Reserved", "reservedBytes", "Held for pending uploads and imports", "reserved"],
  ["Available", "availableBytes", "Remaining after used and reserved", "available"],
  ["Total", "quotaBytes", "Your effective personal allowance", "total"],
];

function StorageSummary({ value, onRetry }) {
  const formatDate = useAccountDateTime();
  const segments = storageSegments(value);
  const plan = MEMBERSHIP_PLANS.find(item => item.id === value.plan);
  const percentage = segments.percent === null ? null : `${Number(segments.percent.toFixed(1))}%`;

  return <section className="storage-dashboard__summary" aria-labelledby="storage-summary-heading">
    <div className="storage-dashboard__summary-heading">
      <div><span className="storage-dashboard__eyebrow">YOUR STORAGE AT A GLANCE</span>
        <h3 id="storage-summary-heading">Personal managed storage</h3>
        <p>One personal allowance for your managed uploads and imports.</p></div>
      {plan ? <span className="storage-dashboard__membership">Membership: {plan.name}</span>
        : <AccountState variant="error" title="Couldn’t load Membership" onRetry={onRetry}>The personal tier was not reported.</AccountState>}
    </div>
    <dl className="storage-dashboard__metrics">
      {METRICS.map(([label, key, hint, tone]) => <div key={key} className={`storage-dashboard__metric storage-dashboard__metric--${tone}`}>
        <dt><span className={`storage-dashboard__dot storage-dashboard__dot--${tone}`} aria-hidden="true" />{label}</dt>
        <dd>{formatStorageBytes(value[key])}</dd><dd className="storage-dashboard__metric-hint">{hint}</dd>
      </div>)}
    </dl>
    {value.quotaBytes === null ? <AccountState variant="error" title="Couldn’t load storage allowance" onRetry={onRetry}>Used and reserved bytes loaded, but total storage did not.</AccountState>
      : <div className="storage-dashboard__usage">
        <div className="storage-dashboard__usage-heading"><h4>Allowance usage</h4>
          <span>{percentage === null ? "No storage allowance allocated" : `${percentage} used or reserved`}</span></div>
        <div className="storage-dashboard__bar" role="img"
          aria-label={`Personal storage: ${formatStorageBytes(value.usedBytes)} used, ${formatStorageBytes(value.reservedBytes)} reserved, ${formatStorageBytes(value.availableBytes)} available, ${formatStorageBytes(value.quotaBytes)} total.${percentage === null ? " No percentage is defined for a zero-byte allowance." : ` ${percentage} used or reserved.`}`}>
          {segments.parts.map(part => <span key={part.name} className={`storage-dashboard__segment storage-dashboard__segment--${part.name}`}
            style={{ width: `${part.percent}%` }} />)}
        </div>
        <ul className="storage-dashboard__legend" aria-label="Usage legend">
          {["Used", "Reserved", "Available"].map(label => <li key={label}><span className={`storage-dashboard__dot storage-dashboard__dot--${label.toLowerCase()}`} aria-hidden="true" />{label}</li>)}
        </ul>
        <p className="storage-dashboard__hint">Reserved storage reduces your available allowance. 1 GB = 1,000,000,000 bytes.</p>
      </div>}
    {value.usedBytes === 0 && value.reservedBytes === 0 && <p className="storage-dashboard__notice">No managed usage is currently reported. These counters do not confirm that all existing files have been counted.</p>}
    {value.entitlementStatus !== "fresh" && <p role="status" className="storage-dashboard__notice">The current membership allowance could not be refreshed. {value.quotaBytes !== null ? "Showing the last allowance supplied by the service." : "No allowance has been assumed."}</p>}
    {value.quotaMode === "audit" && <p className="storage-dashboard__mode"><span aria-hidden="true">ⓘ</span> Quota accounting is in audit mode; enforcement is not active.</p>}
    {value.quotaMode === "off" && <p className="storage-dashboard__mode">Quota enforcement is off.</p>}
    {value.enforcementActive && <p className="storage-dashboard__mode">Quota enforced</p>}
    {value.quotaMode === "blocked" && <p role="alert" className="storage-dashboard__notice">Storage admission is blocked pending accounting verification.</p>}
    {value.overQuota && <p role="alert" className="storage-dashboard__notice">You are over your current storage allowance. {value.enforcementActive ? "New uploads that exceed your allowance are blocked." : value.quotaMode === "blocked" ? "Storage admission is currently blocked." : "Quota enforcement is not active."}</p>}
    {value.lastReconciledAt && <p className="storage-dashboard__hint">Last reconciliation check reported: <time dateTime={value.lastReconciledAt}>{formatDate(value.lastReconciledAt)}</time>. This timestamp alone does not confirm that all existing files have been counted.</p>}
  </section>;
}

function StoragePlans({ currentPlan }) {
  return <section className="storage-dashboard__plans" aria-labelledby="storage-plans-heading">
    <div className="storage-dashboard__section-heading"><div><h3 id="storage-plans-heading">Storage for every stage</h3>
      <p>Compare personal storage allowances.</p></div>
      <a className="storage-dashboard__link" href="#compare-membership">Compare Membership tiers <span aria-hidden="true">↓</span></a></div>
    <div className="storage-dashboard__plan-grid">
      {MEMBERSHIP_PLANS.filter(plan => ["free", "plus", "pro"].includes(plan.id)).map(plan => <article key={plan.id}
        aria-label={`${plan.name} storage plan`} className={`storage-dashboard__plan${currentPlan === plan.id ? " storage-dashboard__plan--current" : ""}`}>
        <div className="storage-dashboard__plan-heading"><h4>{plan.name}</h4>{currentPlan === plan.id && <span>Current plan</span>}</div>
        <p className="storage-dashboard__plan-quota">{plan.storageGb} <span>GB</span></p>
        <p>Personal managed storage</p>
      </article>)}
    </div>
    <p className="storage-dashboard__hint">Standard plan allowances are shown for comparison. Your effective quota above is supplied by the storage service.</p>
  </section>;
}

export default function AccountStorage({ embedded = false }) {
  const [reload, setReload] = useState(0);
  const state = useStorageUsage(reload);
  const loading = state.status === "loading";

  return <section className="storage-dashboard" aria-labelledby="account-storage-heading">
    <header className="storage-dashboard__header">
      <div>{embedded ? <h3 id="account-storage-heading">Storage</h3> : <h2 id="account-storage-heading">Storage</h2>}<p>A clear view of your personal storage.</p></div>
      <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm"
        disabled={loading} onClick={() => setReload(value => value + 1)}>
        <span aria-hidden="true">↻</span> {loading ? "Refreshing usage…" : "Refresh usage"}</button>
    </header>
    {loading ? <section className="storage-dashboard__summary storage-dashboard__pending" aria-busy="true">
      <p role="status"><Spinner size="sm" /> Loading personal storage usage…</p>
      <div className="storage-dashboard__skeleton" aria-hidden="true">{METRICS.map(([label]) => <span key={label} />)}</div>
    </section> : state.status === "error" ? <section className="storage-dashboard__summary">
      <AccountState variant="error" title="Couldn’t load personal storage" onRetry={() => setReload(value => value + 1)}>{ERROR_MESSAGES[state.error] || "Storage usage failed to load."} No usage value has been assumed.</AccountState>
    </section> : <StorageSummary value={state.data} onRetry={() => setReload(value => value + 1)} />}
    <StoragePlans currentPlan={state.status === "success" ? state.data.plan : null} />
    <ManagedStorageFiles onChanged={() => setReload(value => value + 1)} />
    <section className="storage-dashboard__scope" aria-labelledby="storage-scope-heading">
      <h3 id="storage-scope-heading">What counts toward your storage?</h3>
      <div className="storage-dashboard__scope-grid">
        <div><h4>Personal managed storage</h4><p>Managed uploads and imports count toward your personal allowance. Pending uploads and imports reserve space until they are completed or released.</p></div>
        <div><h4>Workflow &amp; platform storage</h4><p>Workflow outputs and platform storage are excluded from this personal allowance. Organization-owned storage is a separate scope.</p></div>
      </div>
    </section>
  </section>;
}
