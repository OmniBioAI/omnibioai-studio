import React from "react";

function initialsFor(email = "") {
  const localPart = email.split("@")[0];
  const letters = localPart.replace(/[^\p{L}\p{N}]/gu, "");
  return (letters || email).slice(0, 2).toUpperCase();
}

export default function AccountMenuButton({ currentUser, onProfileClick, onAfterAction, isProfileActive = false }) {
  if (!currentUser) return null;
  return <button type="button" className="account-menu-trigger" aria-label="Open Account"
    aria-current={isProfileActive ? "page" : undefined}
    onClick={() => { onProfileClick(); onAfterAction?.(); }}>
    <span className="account-avatar" aria-hidden="true">{initialsFor(currentUser.email)}</span>
    <span className="account-trigger-copy">
      <span className="account-trigger-label">Account</span>
      <span className="account-trigger-email">{currentUser.email}</span>
    </span>
    <span className="account-trigger-chevron" aria-hidden="true">›</span>
  </button>;
}
