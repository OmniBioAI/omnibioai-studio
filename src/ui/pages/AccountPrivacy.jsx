import React from "react";
import { Card } from "@omnibioai/ui";
import "./AccountPrivacy.css";

// No canonical Auth API exists today for exporting or deleting account data
// (verified against omnibioai-auth's routes: no /me export, no account-
// deletion lifecycle, no consent/telemetry preference fields on the User
// model). Every row below is honestly disabled rather than wired to a
// backend that doesn't exist — see each row's own description. Do not wire
// these to a fake handler; add the real action only once a canonical API
// ships, the same contract Connections' "allowed_actions" and Billing's
// "can_manage" already follow for *real* capabilities.
function PrivacyRow({ title, description }) {
  return (
    <div className="privacy-row">
      <div className="privacy-row-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" disabled aria-disabled="true">
        Not available yet
      </button>
    </div>
  );
}

export default function AccountPrivacy() {
  return (
    <section className="account-privacy" aria-labelledby="privacy-heading">
      <header>
        <h2 id="privacy-heading">Privacy &amp; Data</h2>
        <p>Review what you can control about your account data today. Capabilities below that aren&rsquo;t available yet are shown disabled rather than hidden, so you always know what&rsquo;s planned.</p>
      </header>
      <Card title="Account data">
        <PrivacyRow
          title="Export your data"
          description="A self-service export of your account data is not available yet. This page will be updated once that capability ships."
        />
        <PrivacyRow
          title="Delete account"
          description="Account deletion is not available yet. No action on this page can delete your account or its data."
        />
      </Card>
      <p className="privacy-footnote">
        Your organization&rsquo;s AI provider connections, security settings (including active sessions and MFA), and personal API keys are managed from their own Account sections, not here.
      </p>
    </section>
  );
}
