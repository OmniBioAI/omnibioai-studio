import React, { useEffect, useMemo, useState } from "react";
import { logout } from "../lib/session";

export const ACCOUNT_SECTIONS = [
  { group: "Your account", items: [
    { id: "profile", label: "Profile", href: "/studio/account/profile" },
    { id: "security", label: "Security", href: "/studio/account/security" },
    { id: "preferences", label: "Preferences", href: "/studio/account/preferences" },
    { id: "privacy", label: "Privacy & data", href: "/studio/account/privacy-data" },
    { id: "membership", label: "Membership & storage", href: "/studio/account/membership-storage" },
  ] },
  { group: "Organization", items: [
    { id: "billing", label: "Billing", href: "/studio/account/organization/billing" },
    { id: "usage", label: "Usage", href: "/studio/account/organization/usage" },
    { id: "api-keys", label: "API keys", href: "/studio/account/organization/api-keys" },
    { id: "members-roles", label: "Members & roles", href: "/studio/account/organization/members-roles", permission: "manage_roles" },
  ] },
  { group: "Help", items: [{ id: "help", label: "Help & support", href: "/studio/account/help" }] },
];

function initialOrganizationId(currentUser) {
  const requested = new URLSearchParams(window.location.search).get("organization_id");
  return String(requested || currentUser?.orgId || "");
}

export default function AccountLayout({ activeSection, currentUser, identity, onNavigate, children }) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState(() => initialOrganizationId(currentUser));
  const organizations = identity?.organizations || [];
  useEffect(() => {
    if (!organizations.length || organizations.some(org => String(org.organization_id) === organizationId)) return;
    const preferred = organizations.find(org => String(org.organization_id) === String(currentUser?.orgId)) || organizations[0];
    setOrganizationId(String(preferred.organization_id));
  }, [organizations, organizationId, currentUser?.orgId]);
  const visibleSections = useMemo(() => ACCOUNT_SECTIONS.map(group => ({
    ...group, items: group.items.filter(item => !item.permission || currentUser?.permissions?.includes(item.permission)),
  })), [currentUser?.permissions]);
  const selectedOrganization = organizations.find(org => String(org.organization_id) === organizationId);
  function changeOrganization(next) {
    setOrganizationId(next);
    const url = new URL(window.location.href);
    url.searchParams.set("organization_id", next);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return (
    <section className="account-shell" aria-labelledby="account-heading">
      <header className="account-shell-header">
        <div><p className="account-shell-eyebrow">Settings</p><h1 id="account-heading">Account</h1></div>
        {organizations.length > 1 ? <div className="account-organization-switcher">
          <span>Organization</span>
          <button type="button" aria-haspopup="listbox" aria-expanded={switcherOpen} onClick={() => setSwitcherOpen(value => !value)}>
            {selectedOrganization?.organization_name || "Choose organization"}<span aria-hidden="true">⌄</span>
          </button>
          {switcherOpen && <ul role="listbox" aria-label="Organization">
            {organizations.map(org => <li key={org.organization_id} role="option" aria-selected={String(org.organization_id) === organizationId}>
              <button type="button" onClick={() => { changeOrganization(String(org.organization_id)); setSwitcherOpen(false); }}>{org.organization_name}</button>
            </li>)}
          </ul>}
        </div> : selectedOrganization?.organization_name ? <p className="account-organization-name">{selectedOrganization.organization_name}</p> : null}
      </header>
      <div className="account-shell-grid">
        <aside className="account-local-panel">
          <nav aria-label="Account settings">
            {visibleSections.map(group => <div className="account-nav-group" key={group.group}>
              <h2>{group.group}</h2>
              {group.items.map(item => <a key={item.id} href={item.href} aria-current={activeSection === item.id ? "page" : undefined}
                onClick={event => { event.preventDefault(); onNavigate(item.id); }}><span>{item.label}</span></a>)}
            </div>)}
          </nav>
          {currentUser && <button type="button" className="account-signout" onClick={logout}>Sign out</button>}
        </aside>
        <main className="account-content" id="account-content">
          {typeof children === "function" ? children({ organizationId, organization: selectedOrganization, organizations }) : children}
        </main>
      </div>
    </section>
  );
}
