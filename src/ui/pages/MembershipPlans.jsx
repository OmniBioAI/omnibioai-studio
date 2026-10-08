import React, { useEffect, useState } from "react";
import { Badge, Card } from "@omnibioai/ui";
import { MEMBERSHIP_FEATURES, MEMBERSHIP_PLANS, normalizeMembershipState } from "../lib/membershipCatalog";
import "./MembershipPlans.css";

function useCheckoutNotice() {
  const [notice] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("checkout") || params.get("subscription");
  });
  useEffect(() => {
    if (!notice) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    url.searchParams.delete("subscription");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [notice]);
  return notice;
}

function CurrentMembership({ state }) {
  if (state.status === "loading") return <div className="membership-current" role="status">Checking current membership…</div>;
  if (state.status === "error") return <div className="membership-current membership-current-error" role="alert">Individual billing is unavailable. Your membership has not been inferred.</div>;
  if (state.status === "unauthorized") return <div className="membership-current" role="status">Sign in to view your membership.</div>;
  if (state.status === "ready") return <div className="membership-current"><span>Current personal membership</span><Badge variant="success">{state.plan[0].toUpperCase() + state.plan.slice(1)}</Badge></div>;
  return <div className="membership-current" role="status"><span>Personal membership</span><Badge variant="neutral">Billing unavailable</Badge><span>No authoritative individual subscription endpoint is configured.</span></div>;
}

function CheckoutNotice({ notice }) {
  if (!notice) return null;
  if (["cancelled", "canceled"].includes(notice)) return <p className="membership-notice" role="status">Checkout was canceled. No membership change was made.</p>;
  if (notice === "success") return <p className="membership-notice" role="status">Checkout returned successfully. Membership remains unchanged until server-side billing confirmation is available.</p>;
  return <p className="membership-notice membership-notice-error" role="alert">Checkout could not be completed. No membership change was made.</p>;
}

function PlanAction({ plan, currentPlan }) {
  if (currentPlan === plan.id) return <button type="button" disabled aria-label={`${plan.name} is your current plan`}>Current plan</button>;
  if (plan.id === "free") return <button type="button" disabled>Included</button>;
  if (plan.id === "enterprise") return <p className="membership-action-note">Contact Sales is unavailable because no approved inquiry destination is configured.</p>;
  return <><button type="button" disabled aria-label={`Upgrade to ${plan.name} unavailable`}>Upgrade unavailable</button><p className="membership-action-note">Individual {plan.name} checkout is not configured.</p></>;
}

export default function MembershipPlans({ currentUser, membershipState, onBillingOverview }) {
  const [interval, setInterval] = useState("monthly");
  const notice = useCheckoutNotice();
  const state = normalizeMembershipState(membershipState || (currentUser ? { status: "unavailable" } : { status: "unauthorized" }));
  const currentPlan = state.status === "ready" ? state.plan : null;

  return <section className="membership-page" aria-labelledby="membership-heading">
    <header className="membership-header">
      <div><p className="membership-eyebrow">Billing</p><h1 id="membership-heading">Membership &amp; Plans</h1><p>Choose the right plan for your bioinformatics research.</p></div>
      {onBillingOverview && <button type="button" className="membership-link" onClick={onBillingOverview}>Billing overview</button>}
    </header>
    <CurrentMembership state={state} />
    <CheckoutNotice notice={notice} />

    <div className="membership-toggle" aria-label="Billing interval">
      <button type="button" aria-pressed={interval === "monthly"} onClick={() => setInterval("monthly")}>Monthly</button>
      <button type="button" aria-pressed={interval === "yearly"} onClick={() => setInterval("yearly")}>Yearly</button>
    </div>
    {interval === "yearly" && <p className="membership-annual" role="status">Yearly billing is coming soon. No annual Stripe prices are configured.</p>}

    <div className="membership-grid">
      {MEMBERSHIP_PLANS.map(plan => <article key={plan.id} className={`membership-card${plan.highlighted ? " membership-card-highlighted" : ""}`}>
        <div className="membership-card-heading"><h2>{plan.name}</h2>{plan.highlighted && <Badge variant="info">Advanced individual plan</Badge>}</div>
        <div className="membership-price">{interval === "yearly" ? <><strong>Unavailable</strong><span>annual billing</span></> : plan.monthlyPrice == null ? <><strong>Custom</strong><span>pricing</span></> : <><strong>${plan.monthlyPrice}</strong><span>/month</span></>}</div>
        <p>{plan.summary}</p>
        <ul>
          <li>{plan.storageGb == null ? "Organization-owned storage" : `${plan.storageGb} GB personal storage (planned allowance)`}</li>
          {plan.id === "enterprise" ? <>
            <li>Customer-owned AWS S3, Google Cloud Storage, Azure Blob, S3-compatible storage, or on-premises storage gateway (planned)</li>
            <li>Cloud, on-premises storage, and compute costs are not included unless specified in a contract.</li>
          </> : <li>Plan-specific limits are planned and are not currently enforced by this page.</li>}
        </ul>
        <div className="membership-card-action"><PlanAction plan={plan} currentPlan={currentPlan} /></div>
      </article>)}
    </div>

    <Card title="Compare plans">
      <div className="membership-table-wrap">
        <table className="membership-table">
          <thead><tr><th scope="col">Feature</th>{MEMBERSHIP_PLANS.map(plan => <th scope="col" key={plan.id}>{plan.name}</th>)}</tr></thead>
          <tbody>{MEMBERSHIP_FEATURES.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={`${row.label}-${MEMBERSHIP_PLANS[index].id}`}>{value}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </Card>

    <Card title="Storage and subscription boundaries">
      <div className="membership-boundaries">
        <p><strong>Personal managed storage:</strong> 1 GB, 20 GB, and 100 GB are proposed allowances. Studio does not currently receive an authoritative personal quota or enforcement state.</p>
        <p><strong>Organization storage:</strong> customer-owned storage is a separate ORGANIZATION scope and does not consume a user&rsquo;s personal managed-storage allowance by default.</p>
        <p><strong>Subscription ownership:</strong> a USER Pro membership never grants Enterprise or organization-administrator privileges. Organization access continues to come from IAM and authoritative organization billing records.</p>
      </div>
    </Card>
  </section>;
}
