import React, { useEffect, useRef, useState } from "react";
import { logout } from "../lib/session";

function initialsFor(email = "") {
  const localPart = email.split("@")[0];
  const letters = localPart.replace(/[^\p{L}\p{N}]/gu, "");
  return (letters || email).slice(0, 2).toUpperCase();
}

export default function AccountMenu({ currentUser, onProfileClick, onSecurityClick, onPreferencesClick, onAppearanceClick = () => {}, onPersonalizationClick, isPersonalizationActive = false, onNotificationsClick = () => {}, onAfterAction, isProfileActive = false, isSecurityActive = false, isPreferencesActive = false, isAppearanceActive = false, isNotificationsActive = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const firstItemRef = useRef(null);
  const accountKey = currentUser ? `${currentUser.userId ?? ""}:${currentUser.email}` : "signed-out";

  useEffect(() => {
    setOpen(false);
  }, [accountKey]);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const onPointerDown = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = event => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!currentUser) return null;

  const chooseProfile = () => {
    setOpen(false);
    onProfileClick();
    onAfterAction?.();
  };

  const chooseSecurity = () => {
    setOpen(false);
    onSecurityClick();
    onAfterAction?.();
  };

  const signOut = () => {
    setOpen(false);
    onAfterAction?.();
    logout();
  };

  return (
    <div className="account-menu" ref={rootRef}>
      {open && (
        <div className="account-menu-popover" role="menu" aria-label="Account">
          <div className="account-menu-identity">
            <span className="account-avatar account-avatar--small" aria-hidden="true">{initialsFor(currentUser.email)}</span>
            <span className="account-menu-email">{currentUser.email}</span>
          </div>
          <div className="account-menu-separator" />
          <button ref={firstItemRef} type="button" role="menuitem"
            aria-current={isProfileActive ? "page" : undefined} onClick={chooseProfile}>
            <span>Profile</span><span aria-hidden="true">›</span>
          </button>
          <button type="button" role="menuitem"
            aria-current={isSecurityActive ? "page" : undefined} onClick={chooseSecurity}>
            <span>Security</span><span aria-hidden="true">›</span>
          </button>
          <button type="button" role="menuitem" aria-current={isPreferencesActive ? "page" : undefined}
            onClick={() => { setOpen(false); onPreferencesClick(); onAfterAction?.(); }}>Preferences<span aria-hidden="true"> ›</span></button>
          <button type="button" role="menuitem" aria-current={isAppearanceActive ? "page" : undefined}
            onClick={() => { setOpen(false); onAppearanceClick(); onAfterAction?.(); }}>Appearance<span aria-hidden="true"> ›</span></button>
          <button type="button" role="menuitem" aria-current={isPersonalizationActive ? "page" : undefined}
            onClick={() => { setOpen(false); onPersonalizationClick(); onAfterAction?.(); }}>Personalization<span aria-hidden="true"> ›</span></button>
          <button type="button" role="menuitem" aria-current={isNotificationsActive ? "page" : undefined}
            onClick={() => { setOpen(false); onNotificationsClick(); onAfterAction?.(); }}>Notifications<span aria-hidden="true"> ›</span></button>
          <div className="account-menu-separator" />
          <button type="button" role="menuitem" className="account-menu-signout" onClick={signOut}>Sign out</button>
        </div>
      )}
      <button ref={triggerRef} type="button" className="account-menu-trigger"
        aria-label="Account menu" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(value => !value)}>
        <span className="account-avatar" aria-hidden="true">{initialsFor(currentUser.email)}</span>
        <span className="account-trigger-copy">
          <span className="account-trigger-label">Account</span>
          <span className="account-trigger-email">{currentUser.email}</span>
        </span>
        <span className="account-trigger-chevron" aria-hidden="true">›</span>
      </button>
    </div>
  );
}
