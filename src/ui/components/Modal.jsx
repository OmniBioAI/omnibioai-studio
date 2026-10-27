import React, { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = [
  "button:not(:disabled)", "[href]", "input:not(:disabled)",
  "select:not(:disabled)", "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export default function Modal({ children, className = "", titleId, descriptionId, onClose, initialFocusRef, returnFocusRef, fallbackFocusRef, ...dialogProps }) {
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const portalRef = useRef(null);
  if (!portalRef.current && typeof document !== "undefined") {
    portalRef.current = document.createElement("div");
    portalRef.current.className = "studio-modal-portal";
  }

  useLayoutEffect(() => {
    const portal = portalRef.current;
    const dialog = dialogRef.current;
    triggerRef.current = document.activeElement;
    document.body.appendChild(portal);

    const background = [...document.body.children].filter(element => element !== portal);
    const previous = background.map(element => ({ element, inert: element.hasAttribute("inert") }));
    background.forEach(element => element.setAttribute("inert", ""));

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    const initial = initialFocusRef?.current || dialog.querySelector("[data-modal-initial-focus]") || dialog.querySelector(FOCUSABLE);
    initial?.focus();

    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      previous.forEach(({ element, inert }) => { if (!inert) element.removeAttribute("inert"); });
      portal.remove();
      const preferredTarget = returnFocusRef?.current || triggerRef.current;
      if (preferredTarget?.isConnected && !preferredTarget.disabled) preferredTarget.focus();
      else {
        fallbackFocusRef?.current?.focus();
        if (preferredTarget?.isConnected) requestAnimationFrame(() => {
          if (preferredTarget.isConnected && !preferredTarget.disabled) preferredTarget.focus();
        });
      }
    };
  }, [initialFocusRef]);

  function handleKeyDown(event) {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll("button, [href], input, select, textarea, [tabindex]")]
      .filter(element => !element.disabled && element.tabIndex >= 0);
    if (!controls.length) { event.preventDefault(); event.currentTarget.focus(); return; }
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  if (!portalRef.current) return null;
  return createPortal(
    <dialog ref={dialogRef} className={`studio-modal ${className}`.trim()} aria-modal="true" {...dialogProps}
      aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={handleKeyDown}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      {children}
    </dialog>,
    portalRef.current,
  );
}
