import React from "react";

const IMPLEMENTED_SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "preferences", label: "Preferences" },
  { id: "personalization", label: "Personalization" },
  { id: "notifications", label: "Notifications" },
];

export default function AccountLayout({ activeSection, onNavigate, sections = IMPLEMENTED_SECTIONS, children }) {
  return (
    <section className="account-shell" aria-labelledby="account-heading">
      <header className="account-shell-header">
        <h1 id="account-heading">Account</h1>
        <p>Manage your OmniBioAI account, preferences and security</p>
      </header>
      <div className="account-shell-grid">
        <aside className="account-local-panel">
          <h2>Account settings</h2>
          <nav aria-label="Account settings">
            {sections.map(section => (
              <button key={section.id} type="button"
                aria-current={activeSection === section.id ? "page" : undefined}
                onClick={() => onNavigate(section.id)}>
                <span>{section.label}</span>
                {activeSection === section.id && <span className="account-local-active" aria-hidden="true" />}
              </button>
            ))}
          </nav>
        </aside>
        <main className="account-content" id="account-content">{children}</main>
      </div>
    </section>
  );
}
