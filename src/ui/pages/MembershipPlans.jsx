import React, { useEffect, useState } from "react";
import { Badge, Card } from "@omnibioai/ui";
import { MEMBERSHIP_FEATURES, MEMBERSHIP_PLANS, normalizeMembershipState } from "../lib/membershipCatalog";
import * as billingApi from "../lib/billingApi";
import { openStripeUrl } from "../lib/stripePortal";
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
  if (state.status === "ready") return <div className="membership-current"><span>Current personal membership</span><Badge variant="success">{state.plan[0].toUpperCase() + state.plan.slice(1)}</Badge><span>Status: {state.subscription_status}</span><span>Storage allowance: {state.storage_quota_bytes / 1_000_000_000} GB</span>{state.cancel_at_period_end && <span>Cancellation scheduled</span>}</div>;
  return <div className="membership-current" role="status"><span>Personal membership</span><Badge variant="neutral">Billing unavailable</Badge><span>No authoritative individual subscription endpoint is configured.</span></div>;
}

function CheckoutNotice({ notice }) {
  if (!notice) return null;
  if (["cancelled", "canceled"].includes(notice)) return <p className="membership-notice" role="status">Checkout was canceled. No membership change was made.</p>;
  if (notice === "success") return <p className="membership-notice" role="status">Checkout returned successfully. Membership changes only after server-side billing confirmation is received.</p>;
  return <p className="membership-notice membership-notice-error" role="alert">Checkout could not be completed. No membership change was made.</p>;
}

function PlanAction({ plan, currentPlan, eligiblePlans, busyPlan, interval, onUpgrade }) {
  if (currentPlan === plan.id) return <button type="button" disabled aria-label={`${plan.name} is your current plan`}>Current plan</button>;
  if (plan.id === "free") return <button type="button" disabled>Included</button>;
  if (plan.id === "enterprise") return <p className="membership-action-note">Contact Sales is unavailable because no approved inquiry destination is configured.</p>;
  if (interval === "yearly") return <button type="button" disabled aria-label={`${plan.name} annual billing unavailable`}>Annual billing coming soon</button>;
  if (eligiblePlans.includes(plan.id)) return <button type="button" disabled={!!busyPlan} onClick={() => onUpgrade(plan.id)}>{busyPlan === plan.id ? "Opening checkout…" : `Upgrade to ${plan.name}`}</button>;
  return <><button type="button" disabled aria-label={`Upgrade to ${plan.name} unavailable`}>Upgrade unavailable</button><p className="membership-action-note">Individual {plan.name} checkout is not configured or this transition is unavailable.</p></>;
}

export default function MembershipPlans({ currentUser, membershipState, onBillingOverview }) {
  const [interval, setInterval] = useState("monthly");
  const [loadedState, setLoadedState] = useState(() => membershipState || (currentUser ? { status: "loading" } : { status: "unauthorized" }));
  const [busyPlan, setBusyPlan] = useState("");
  const [actionError, setActionError] = useState("");
  const notice = useCheckoutNotice();
  useEffect(() => {
    if (membershipState) { setLoadedState(membershipState); return undefined; }
    if (!currentUser) { setLoadedState({ status: "unauthorized" }); return undefined; }
    let active = true;
    setLoadedState({ status: "loading" });
    billingApi.getCurrentMembership().then(value => {
      if (active) setLoadedState({ ...value, status: "ready", scope: value.owner_type });
    }).catch(error => {
      if (active) setLoadedState({ status: error?.status === 401 ? "unauthorized" : "error" });
    });
    return () => { active = false; };
  }, [currentUser?.userId, membershipState]);
  const state = normalizeMembershipState(loadedState);
  const currentPlan = state.status === "ready" ? state.plan : null;
  const eligiblePlans = state.status === "ready" ? (state.checkout_eligible_plans || []) : [];

  async function openSession(call, busy) {
    setBusyPlan(busy);
    setActionError("");
    try {
      const { url } = await call();
      openStripeUrl(url);
    } catch (error) {
      setActionError(error?.message || "Billing could not start that action. Please try again.");
    } finally {
      setBusyPlan("");
    }
  }

  return <section className="membership-page" aria-labelledby="membership-heading">
    <header className="membership-header">
      <div><p className="membership-eyebrow">Billing</p><h1 id="membership-heading">Membership &amp; Plans</h1><p>Choose the right plan for your bioinformatics research.</p></div>
      {onBillingOverview && <button type="button" className="membership-link" onClick={onBillingOverview}>Billing overview</button>}
    </header>
    <CurrentMembership state={state} />
    <CheckoutNotice notice={notice} />
    {actionError && <p className="membership-notice membership-notice-error" role="alert">{actionError}</p>}
    {state.status === "ready" && state.portal_available && <div className="membership-manage"><button type="button" disabled={!!busyPlan} onClick={() => openSession(billingApi.createUserMembershipPortal, "portal")}>{busyPlan === "portal" ? "Opening billing portal…" : "Manage personal subscription"}</button></div>}

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
          <li>{plan.storageGb == null ? "Organization-owned storage" : `${plan.storageGb} GB personal storage allowance (not yet enforced)`}</li>
          {plan.id === "enterprise" ? <>
            <li>Customer-owned AWS S3, Google Cloud Storage, Azure Blob, S3-compatible storage, or on-premises storage gateway (planned)</li>
            <li>Cloud, on-premises storage, and compute costs are not included unless specified in a contract.</li>
          </> : <li>Plan-specific limits are planned and are not currently enforced by this page.</li>}
        </ul>
        <div className="membership-card-action"><PlanAction plan={plan} currentPlan={currentPlan} eligiblePlans={eligiblePlans} busyPlan={busyPlan} interval={interval} onUpgrade={planId => openSession(() => billingApi.createUserMembershipCheckout(planId), planId)} /></div>
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
        <p><strong>Personal managed storage:</strong> Billing authoritatively reports the 1 GB, 20 GB, or 100 GB allowance. Storage enforcement remains a separate future workstream.</p>
        <p><strong>Organization storage:</strong> customer-owned storage is a separate ORGANIZATION scope and does not consume a user&rsquo;s personal managed-storage allowance by default.</p>
        <p><strong>Subscription ownership:</strong> a USER Pro membership never grants Enterprise or organization-administrator privileges. Organization access continues to come from IAM and authoritative organization billing records.</p>
      </div>
    </Card>
  </section>;
}
