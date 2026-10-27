import React, { useEffect, useState, useSyncExternalStore } from "react";
import { Badge, Card, Spinner } from "@omnibioai/ui";
import Login from "../components/Login";
import AccountState from "../components/AccountState";
import { getIdentity, getSessionVersion, getToken, onSessionChange } from "../lib/session";

export default function Profile({ currentUser, onOrganizationPlan }) {
  const version = useSyncExternalStore(onSessionChange, getSessionVersion);
  if (!currentUser || !getToken()) {
    return <Login title="Sign in required" description="Sign in to view your profile. Your session may have expired." />;
  }
  // Remount every session generation, including refresh and re-login with the
  // same token. Old identity and billing state disappear before new requests.
  return <ProfileSession key={`${version}:${currentUser.userId}`} orgId={currentUser.orgId} onOrganizationPlan={onOrganizationPlan} />;
}

function ProfileSession({ orgId, onOrganizationPlan }) {
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
      <header><h2>Profile</h2><p className="profile-muted">Your OmniBioAI account</p></header>
      {failed ? (
        <Card>
          <AccountState variant="error" title="Couldn’t load profile" onRetry={() => setAttempt(value => value + 1)}>Your account details failed to load.</AccountState>
        </Card>
      ) : !identity ? (
        <div role="status" className="profile-loading"><Spinner size="sm" /> Loading profile…</div>
      ) : <IdentityDetails identity={identity} orgId={orgId} onOrganizationPlan={onOrganizationPlan} />}
    </div>
  );
}

function memberSince(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function Roles({ roles }) {
  return roles.length ? <div className="profile-roles">{roles.map(role => <Badge key={role}>{role}</Badge>)}</div>
    : <p className="profile-muted">None assigned</p>;
}

function IdentityDetails({ identity, orgId, onOrganizationPlan }) {
  const { user, organizations = [], global_roles = [] } = identity;
  const selected = organizations.find(org => String(org.organization_id) === String(orgId)) || organizations[0];
  const initials = user.email.split("@")[0].replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase();
  const joined = memberSince(user.created_at);

  return (
    <>
      <Card elevated>
        <div className="profile-identity">
          <div className="profile-avatar" role="img" aria-label="Initials avatar">{initials}</div>
          <div className="profile-identity-text">
            <h2>{user.email}</h2>
            {joined && <p className="profile-muted">Member since <span className="profile-value">{joined}</span></p>}
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
            <p className="profile-plan-summary">Organization plan for {selected?.organization_name || "your organization"} is managed in Billing. <a href="/studio/account/organization/billing" onClick={event => { if (onOrganizationPlan) { event.preventDefault(); onOrganizationPlan(); } }}>View Organization plan</a></p>
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
