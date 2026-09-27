import React from "react";

function Message({ kind, children, multiple = false }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  const items = multiple && Array.isArray(children) ? children : [children];
  return (
    <div className={`omni-page-message omni-page-message--${kind}`} role={kind === "error" ? "alert" : "status"}>
      {items.map((item, index) => <div key={index}>{item}</div>)}
    </div>
  );
}

/** Shared equivalent of Django's templates/shared/omni_page.html contract. */
export default function OmniPage({
  title,
  subtitle,
  meta,
  actions,
  error,
  errors,
  warning,
  warnings,
  success,
  info,
  children,
  className = "",
}) {
  return (
    <article className={`omni-page ${className}`.trim()}>
      <header className="omni-page-hero">
        <div className="omni-page-hero-copy">
          {title && <h1>{title}</h1>}
          {subtitle && <p>{subtitle}</p>}
          {meta && <div className="omni-page-meta">{meta}</div>}
        </div>
        {actions && <div className="omni-page-actions">{actions}</div>}
      </header>
      <div className="omni-page-messages" aria-live="polite">
        <Message kind="error">{error}</Message>
        <Message kind="error" multiple>{errors}</Message>
        <Message kind="warning">{warning}</Message>
        <Message kind="warning" multiple>{warnings}</Message>
        <Message kind="success">{success}</Message>
        <Message kind="info">{info}</Message>
      </div>
      <div className="omni-page-body">{children}</div>
    </article>
  );
}

export { Message };
