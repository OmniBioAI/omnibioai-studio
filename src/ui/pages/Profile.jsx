import React, { useEffect, useState, useSyncExternalStore } from "react";
import { Badge, Button, Card, Spinner } from "@omnibioai/ui";
import Login from "../components/Login";
import { getIdentity, getSessionVersion, getToken, onSessionChange } from "../lib/session";
import { getSubscription } from "../lib/billingApi";

export default function Profile({ currentUser }) {
  const version = useSyncExternalStore(onSessionChange, getSessionVersion);
  if (!currentUser || !getToken()) {
    return <Login title="Sign in required" description="Sign in to view your profile. Your session may have expired." />;
  }
  // Remount every session generation, including refresh and re-login with the
  // same token. Old identity and billing state disappear before new requests.
  return <ProfileSession key={`${version}:${currentUser.userId}`} orgId={currentUser.orgId} />;
}

function ProfileSession({ orgId }) {
  const [identity, setIdentity] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setIdentity(null);
    setFailed(false);
    getIdentity({ signal: controller.signal }).then(data => {
      if (active) setIdentity(data);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; controller.abort(); };
  }, [attempt]);

  return (
    <div className="profile-page">
      <header><h1>Profile</h1><p className="profile-muted">Your OmniBioAI account</p></header>
      {failed ? (
        <Card>
          <p role="alert">Your profile is unavailable. Please try again.</p>
          <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Retry profile</Button>
        </Card>
      ) : !identity ? (
        <div role="status" className="profile-loading"><Spinner size="sm" /> Loading profile…</div>
      ) : <IdentityDetails identity={identity} orgId={orgId} />}
    </div>
  );
}

function memberSince(value) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function Roles({ roles }) {
  return roles.length ? <div className="profile-roles">{roles.map(role => <Badge key={role}>{role}</Badge>)}</div>
    : <p className="profile-muted">None assigned</p>;
}

function IdentityDetails({ identity, orgId }) {
  const { user, organizations = [], global_roles = [] } = identity;
  const [selectedId, setSelectedId] = useState(() => {
    const relevant = organizations.find(org => String(org.organization_id) === String(orgId)) || organizations[0];
    return relevant ? String(relevant.organization_id) : "";
  });
  const selected = organizations.find(org => String(org.organization_id) === selectedId);
  const initials = user.email.split("@")[0].replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase();

  return (
    <>
      <Card elevated>
        <div className="profile-identity">
          <div className="profile-avatar" role="img" aria-label="Initials avatar">{initials}</div>
          <div className="profile-identity-text">
            <h2>{user.email}</h2>
            <p className="profile-muted">Member since <span className="profile-value">{memberSince(user.created_at)}</span></p>
          </div>
        </div>
      </Card>
      <Card>
        <h2>Account information</h2>
        <dl className="profile-facts"><div><dt>User ID</dt><dd>{user.id}</dd></div></dl>
      </Card>
      <Card>
        <h2>Organizations</h2>
        {!organizations.length ? <p className="profile-muted">No organization memberships.</p> : (
          <>
            <ul className="profile-organizations">
              {organizations.map(org => (
                <li key={org.organization_id}>
                  <h3>{org.organization_name}</h3>
                  <p className="profile-muted">Organization ID: {org.organization_id}</p>
                  <h4>Organization roles</h4>
                  <Roles roles={org.roles || []} />
                </li>
              ))}
            </ul>
            <div className="profile-plan">
              <h3>Organization plan</h3>
              {organizations.length > 1 && (
                <label className="profile-org-select">View plan for
                  <select className="studio-field" value={selectedId} onChange={event => setSelectedId(event.target.value)}>
                    {organizations.map(org => <option key={org.organization_id} value={org.organization_id}>{org.organization_name}</option>)}
                  </select>
                </label>
              )}
              <p className="profile-muted">Subscription for {selected.organization_name}</p>
              <OrganizationPlan key={selectedId} orgId={selected.organization_id} />
            </div>
          </>
        )}
      </Card>
      <Card>
        <h2>Global roles</h2>
        <Roles roles={global_roles.map(role => role.name)} />
      </Card>
    </>
  );
}

function OrganizationPlan({ orgId }) {
  const [plan, setPlan] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setPlan(null);
    getSubscription(orgId).then(subscription => {
      if (active) setPlan({ name: subscription.plan_name || "Unavailable" });
    }).catch(error => {
      if (active) setPlan({ error: true, name: error.status === 404 ? "No active subscription" : "Unavailable" });
    });
    return () => { active = false; };
  }, [orgId, attempt]);

  if (!plan) return <div role="status" className="profile-loading"><Spinner size="sm" /> Loading organization plan…</div>;
  return <div className="profile-plan-result"><Badge variant={plan.error ? "neutral" : "info"}>{plan.name}</Badge>
    {plan.error && <Button variant="ghost" size="sm" onClick={() => setAttempt(value => value + 1)}>Retry plan</Button>}
  </div>;
}
