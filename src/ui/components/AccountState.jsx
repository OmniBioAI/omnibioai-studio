import React from "react";

const COPY = { setup: "Not set up yet", plan: "Not in your plan", error: "Couldn’t load" };

export default function AccountState({ variant, title, children, actor, includedIn, failed, href, linkLabel, onRetry }) {
  if (variant === "hidden") return null;
  return <div className={`account-state account-state--${variant}`} role={variant === "error" ? "alert" : "status"}>
    <strong>{title || COPY[variant]}</strong>
    <span>{children || (variant === "setup" ? `${actor || "An organization administrator"} can set this up.`
      : variant === "plan" ? `${includedIn || "A higher plan"} includes this.`
        : `${failed || "This information"} failed to load.`)}</span>
    {variant === "error" ? <button type="button" onClick={onRetry}>Retry</button>
      : href ? <a href={href}>{linkLabel || (variant === "plan" ? "Compare" : "Set up")}</a> : null}
  </div>;
}
