import React from "react";
import mark from "../../assets/brand/omnibioai-mark.svg";
import "./OmniBioAILogo.css";

const VARIANTS = new Set(["mark", "full", "wordmark"]);
const SIZES = new Set(["xs", "sm", "md", "lg"]);

export default function OmniBioAILogo({ variant = "full", size = "md", label, className = "" }) {
  const resolvedVariant = VARIANTS.has(variant) ? variant : "full";
  const resolvedSize = SIZES.has(size) ? size : "md";
  const accessibleLabel = typeof label === "string" ? label.trim() : "";

  return (
    <span
      className={`omnibioai-logo omnibioai-logo--${resolvedVariant} omnibioai-logo--${resolvedSize}${className ? ` ${className}` : ""}`}
      data-omnibioai-logo={resolvedVariant}
      {...(accessibleLabel
        ? { role: "img", "aria-label": accessibleLabel }
        : { "aria-hidden": "true" })}
    >
      {resolvedVariant !== "wordmark" && <img src={mark} alt="" aria-hidden="true" draggable="false" />}
      {resolvedVariant !== "mark" && <span className="omnibioai-logo__wordmark" aria-hidden="true">
        OmniBio<span>AI</span>
      </span>}
    </span>
  );
}
