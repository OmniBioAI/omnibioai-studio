import React from "react";
import "./StudioFooter.css";
import { STUDIO_VERSION_LABEL } from "../lib/appVersion";

const CURRENT_YEAR = new Date().getFullYear();

export default function StudioFooter({ onHelpClick, onPrivacyClick }) {
  return (
    <footer className="studio-footer" aria-label="Studio footer">
      <span className="studio-footer-brand">OmniBioAI Studio</span>
      <span className="studio-footer-version">{STUDIO_VERSION_LABEL}</span>
      <span className="studio-footer-copyright">© {CURRENT_YEAR} OmniBioAI</span>
      <nav className="studio-footer-links" aria-label="Footer links">
        <a href="https://docs.omnibioai.org" target="_blank" rel="noopener noreferrer">Documentation <span aria-hidden="true">↗</span></a>
        <a href="/studio/account/help" onClick={event => { event.preventDefault(); onHelpClick?.(); }}>Help &amp; support</a>
        <a href="/studio/account/privacy-data" onClick={event => { event.preventDefault(); onPrivacyClick?.(); }}>Privacy</a>
        <a href="https://github.com/OmniBioAI/omnibioai-studio" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>
      </nav>
    </footer>
  );
}
