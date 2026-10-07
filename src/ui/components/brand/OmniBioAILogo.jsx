import React from "react";
import mark from "../../assets/brand/omnibioai-mark.svg";
import logo from "../../assets/brand/omnibioai-logo.svg";
import wordmark from "../../assets/brand/omnibioai-wordmark.svg";
import "./OmniBioAILogo.css";

const ASSETS = Object.freeze({ mark, full: logo, wordmark });
const SIZES = new Set(["xs", "sm", "md", "lg"]);

export default function OmniBioAILogo({ variant = "full", size = "md", label, className = "" }) {
  const resolvedVariant = Object.hasOwn(ASSETS, variant) ? variant : "full";
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
      <img src={ASSETS[resolvedVariant]} alt="" aria-hidden="true" draggable="false" />
    </span>
  );
}
