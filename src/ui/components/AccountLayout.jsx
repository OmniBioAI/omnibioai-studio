import React, { useState } from "react";

const IMPLEMENTED_SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "preferences", label: "Preferences" },
  { id: "appearance", label: "Appearance" },
  { id: "personalization", label: "Personalization" },
  { id: "notifications", label: "Notifications" },
  { id: "privacy", label: "Privacy & Data" },
  { id: "plan", label: "Plan" },
  { id: "help", label: "Help & Product" },
];

// Local-only filter over the exact section list this Account shell is
// already given — never a backend search, never a route this instance
// wasn't already told about. A section this Studio build doesn't offer
// (e.g. an older build without Plan) simply isn't in `sections`, so it can
// never appear as a search result either; availability is inherited, not
// re-derived.
function useSectionSearch(sections) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();
  const results = trimmed ? sections.filter(section => section.label.toLowerCase().includes(trimmed)) : sections;
  return { query, setQuery, results };
}

export default function AccountLayout({ activeSection, onNavigate, sections = IMPLEMENTED_SECTIONS, children }) {
  const { query, setQuery, results } = useSectionSearch(sections);
  function submitSearch(event) {
    event.preventDefault();
    if (results.length === 1) onNavigate(results[0].id);
  }
  return (
    <section className="account-shell" aria-labelledby="account-heading">
      <header className="account-shell-header">
        <h1 id="account-heading">Account</h1>
        <p>Manage your OmniBioAI account, preferences and security</p>
      </header>
      <div className="account-shell-grid">
        <aside className="account-local-panel">
          <h2>Account settings</h2>
          {sections.length > 6 && (
            <form role="search" onSubmit={submitSearch} className="account-search">
              <label htmlFor="account-settings-search" className="account-search-label">Search account settings</label>
              <input id="account-settings-search" type="search" value={query} onChange={event => setQuery(event.target.value)}
                placeholder="Search settings…" autoComplete="off" />
            </form>
          )}
          <nav aria-label="Account settings">
            {results.map(section => (
              <button key={section.id} type="button"
                aria-current={activeSection === section.id ? "page" : undefined}
                onClick={() => onNavigate(section.id)}>
                <span>{section.label}</span>
                {activeSection === section.id && <span className="account-local-active" aria-hidden="true" />}
              </button>
            ))}
            {query && results.length === 0 && <p role="status" className="account-search-empty">No matching settings.</p>}
          </nav>
        </aside>
        <main className="account-content" id="account-content">{children}</main>
      </div>
    </section>
  );
}
