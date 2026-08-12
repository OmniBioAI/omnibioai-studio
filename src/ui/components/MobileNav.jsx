import React, { useEffect, useRef } from "react";
import { logout } from "../lib/session";

// Mobile drawer nav. Deliberately takes the exact same `nav`/`step`/`setStep`
// data App.jsx already builds via buildNav() and passes to the desktop
// <Sidebar> — permission filtering (manage_roles) and active-route logic
// stay in perfect sync with desktop because nothing nav-related is
// duplicated here, only re-rendered as a drawer instead of a fixed rail.
export default function MobileNav({ nav, step, setStep, currentUser, open, onClose }) {
  const closeBtnRef = useRef(null);
  const stepRef = useRef(step);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Close whenever the active page changes — covers Workbench tiles' own
  // "navigate" custom-event dispatch (App.jsx's window "navigate" listener),
  // not just taps on a link inside this drawer.
  useEffect(() => {
    if (open && stepRef.current !== step) onClose();
    stepRef.current = step;
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll behind the open drawer
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Focus the close button when opened (basic focus management)
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  const go = (idx) => { setStep(idx); onClose(); };

  return (
    <>
      {/* Backdrop — click outside to close */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.6)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease",
        }}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        aria-hidden={!open}
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0,
          width: "min(82vw, 280px)",
          background: "var(--bg2)",
          borderRight: "1px solid var(--border)",
          zIndex: 1001,
          display: "flex", flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease",
          boxShadow: open ? "4px 0 24px rgba(0,0,0,0.4)" : "none",
        }}
      >
        {/* Header — close button always visible, >=44px target */}
        <div style={{
          padding: "10px 8px 10px 16px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 22, height: 22, flexShrink: 0,
              background: "linear-gradient(135deg, var(--accent), #0094ff)",
              clipPath: "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
            }} />
            <span style={{ fontSize: "var(--font-size-base)", fontWeight: 700, letterSpacing: "0.04em", color: "#fff" }}>
              OmniBioAI
            </span>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close navigation"
            style={{
              width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none", color: "var(--color-text-muted)",
              fontSize: 18, cursor: "pointer", flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Nav items — same sections/items/active-state as desktop Sidebar */}
        <nav style={{ padding: 8, flex: 1, overflowY: "auto" }}>
          {nav.map(({ section, items }) => (
            <div key={section}>
              <div style={{
                fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)", color: "var(--color-text-muted)",
                letterSpacing: "0.12em", textTransform: "uppercase",
                padding: "10px 8px 6px", marginTop: 4,
              }}>
                {section}
              </div>
              {items.map(({ name, idx }) => {
                const isActive = step === idx;
                return (
                  <div
                    key={name}
                    onClick={() => go(idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(idx); } }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      minHeight: 44, padding: "10px", borderRadius: "var(--radius-sm)",
                      cursor: "pointer", fontSize: "var(--font-size-md)", marginBottom: 2,
                      color: isActive ? "var(--accent)" : "var(--text)",
                      background: isActive ? "rgba(0,229,160,0.08)" : "transparent",
                      border: isActive ? "1px solid rgba(0,229,160,0.15)" : "1px solid transparent",
                    }}
                  >
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: "currentColor", opacity: isActive ? 1 : 0.4, flexShrink: 0,
                    }} />
                    {name}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Signed-in user + sign out — mirrors desktop Sidebar */}
        {currentUser && (
          <div style={{
            padding: "12px 16px", borderTop: "1px solid var(--border)", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          }}>
            <div style={{
              fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)",
              color: "var(--color-text-muted)", overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={currentUser.email}>
              {currentUser.email}
            </div>
            <div
              onClick={() => { logout(); onClose(); }}
              style={{
                minHeight: 44, display: "flex", alignItems: "center",
                fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)", fontWeight: 600,
                color: "var(--color-text-muted)", cursor: "pointer", flexShrink: 0,
              }}
            >
              Sign out
            </div>
          </div>
        )}
      </div>
    </>
  );
}
