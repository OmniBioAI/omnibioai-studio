import React from "react";
import { Card } from "@omnibioai/ui";
import { openExternal } from "../lib/externalLink";
import "./AccountHelp.css";

// Every destination here is one already verified to exist in this codebase
// (see Settings.jsx's existing "About" panel, which links the same three)
// or a well-established path on one of them (GitHub's own /releases
// convention for the same repository). No Download-apps or Support
// destination exists anywhere in this codebase or its sibling repos today,
// so neither is invented or guessed at here — they're simply omitted
// rather than shown as a disabled placeholder, since nothing here promises
// they're coming.
const LINKS = [
  { label: "Documentation", description: "Guides and reference for OmniBioAI Studio.", url: "https://docs.omnibioai.org" },
  { label: "Release notes", description: "What's changed in recent OmniBioAI Studio releases.", url: "https://github.com/OmniBioAI/omnibioai-studio/releases" },
  { label: "Source code", description: "OmniBioAI Studio on GitHub.", url: "https://github.com/OmniBioAI/omnibioai-studio" },
  { label: "OmniBioAI", description: "The OmniBioAI product website.", url: "https://omnibioai.org" },
];

export default function AccountHelp() {
  return (
    <section className="account-help" aria-labelledby="help-heading">
      <header>
        <h2 id="help-heading">Help &amp; Product</h2>
        <p>Documentation, release notes and other OmniBioAI destinations.</p>
      </header>
      <Card title="Resources">
        <ul className="help-links">
          {LINKS.map(link => (
            <li key={link.url}>
              <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" aria-label={`${link.label} (opens in your browser)`} onClick={() => openExternal(link.url)}>
                {link.label} <span aria-hidden="true">↗</span>
              </button>
              <p>{link.description}</p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
