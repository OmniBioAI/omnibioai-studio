import React from "react";
import AccountStorage from "./AccountStorage";
import MembershipPlans from "./MembershipPlans";

export default function AccountMembershipStorage({ currentUser }) {
  return <section className="membership-storage" aria-labelledby="membership-storage-heading">
    <header className="membership-storage-header">
      <h2 id="membership-storage-heading">Membership &amp; storage</h2>
      <p>Your personal storage tier, current usage and membership options.</p>
      <a href="/studio/account/organization/billing">Request limits and invoices belong to your organization</a>
    </header>
    <AccountStorage embedded />
    <MembershipPlans currentUser={currentUser} embedded />
  </section>;
}
