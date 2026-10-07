import React from "react";
import { Card } from "@omnibioai/ui";
import { ToggleRow } from "../components/UI";
import { useAppearance } from "../components/AppearanceProvider";
import OmniBioAILogo from "../components/brand/OmniBioAILogo";

const MODE_OPTIONS = [
  { value: "system", label: "System", ariaLabel: "System — follow OS appearance" },
  { value: "light", label: "Light", ariaLabel: "Light" },
  { value: "dark", label: "Dark", ariaLabel: "Dark" },
];

const ACCENT_OPTIONS = [
  { value: "teal", ariaLabel: "Teal (default)", className: "appearance-swatch appearance-swatch--teal" },
  { value: "blue", ariaLabel: "Blue", className: "appearance-swatch appearance-swatch--blue" },
  { value: "purple", ariaLabel: "Purple", className: "appearance-swatch appearance-swatch--purple" },
  { value: "orange", ariaLabel: "Orange", className: "appearance-swatch appearance-swatch--orange" },
];

const DENSITY_OPTIONS = [
  { value: "comfortable", label: "Comfortable", hint: "More breathing room between controls.", ariaLabel: "Comfortable — more breathing room between controls" },
  { value: "compact", label: "Compact", hint: "Tighter spacing, more on screen.", ariaLabel: "Compact — tighter spacing, more on screen" },
];

// Shared WAI-ARIA radiogroup pattern (roving tabindex, arrow-key navigation)
// behind every Appearance choice — color mode, accent and density all pick
// exactly one of a small fixed set, so they share one accessible control.
function RadioGroup({ legend, options, value, onChange, className, renderOption }) {
  function handleKeyDown(event) {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const index = options.findIndex(option => option.value === value);
    const nextIndex = (index + delta + options.length) % options.length;
    onChange(options[nextIndex].value);
    event.currentTarget.children[nextIndex]?.focus();
  }

  return (
    <div className={className} role="radiogroup" aria-label={legend} onKeyDown={handleKeyDown}>
      {options.map(option => (
        <button key={option.value} type="button" role="radio" aria-checked={option.value === value}
          aria-label={option.ariaLabel} tabIndex={option.value === value ? 0 : -1}
          className={option.className} onClick={() => onChange(option.value)}>
          {renderOption(option)}
        </button>
      ))}
    </div>
  );
}

function LivePreview({ accent }) {
  return (
    <>
      <div className="appearance-preview" aria-hidden="true">
        <div className="appearance-preview-frame">
          <div className="appearance-preview-sidebar">
            <div className="appearance-preview-brand">
              <OmniBioAILogo variant="full" size="xs" />
            </div>
            <div className="appearance-preview-nav-item appearance-preview-nav-item--active">Studio</div>
            <div className="appearance-preview-nav-item">Jobs</div>
            <div className="appearance-preview-nav-item">Code</div>
            <div className="appearance-preview-nav-item">Workflows</div>
          </div>
          <div className="appearance-preview-main">
            <div className="appearance-preview-title">RNA-seq workflow</div>
            <div className="appearance-preview-badge">Running</div>
            <div className="appearance-preview-terminal">
              <div>$ run rna-seq --sample demo</div>
              <div>[2/4] aligning reads…</div>
              <div>[3/4] calling variants…</div>
            </div>
          </div>
        </div>
      </div>
      <p className="appearance-preview-caption">
        Preview only — a sample Studio layout shown in the {accent} accent, with no real job data.
      </p>
    </>
  );
}

export default function AccountAppearance() {
  const { mode, accent, density, reducedMotion, setMode, setAccent, setDensity, setReducedMotion } = useAppearance();

  return (
    <section className="appearance-page" aria-labelledby="appearance-heading">
      <header>
        <h1 id="appearance-heading">Appearance</h1>
        <p>Control how OmniBioAI Studio looks on this device. These choices never change how the AI responds — see Personalization for that.</p>
      </header>

      <Card>
        <div className="appearance-section">
          <h2>Live preview</h2>
          <LivePreview accent={accent} />
        </div>
      </Card>

      <Card>
        <div className="appearance-section">
          <h2>Color mode</h2>
          <p className="appearance-section-hint">System follows your OS or browser setting and updates Studio immediately if it changes.</p>
          <RadioGroup legend="Color mode" className="appearance-segmented" value={mode} onChange={setMode} options={MODE_OPTIONS}
            renderOption={option => (
              <>
                <span className="appearance-segmented-mark" aria-hidden="true">✓</span>
                {option.label}
              </>
            )} />
        </div>
      </Card>

      <Card>
        <div className="appearance-section">
          <h2>Accent</h2>
          <p className="appearance-section-hint">A curated, accessible accent palette. Teal is the OmniBioAI default.</p>
          <RadioGroup legend="Accent color" className="appearance-accent-row" value={accent} onChange={setAccent} options={ACCENT_OPTIONS}
            renderOption={() => <span className="appearance-swatch-check" aria-hidden="true">✓</span>} />
        </div>
      </Card>

      <Card>
        <div className="appearance-section">
          <h2>Workspace density</h2>
          <p className="appearance-section-hint">Applies to the Account area and this preview today; full Studio-wide density is planned separately.</p>
          <RadioGroup legend="Workspace density" className="appearance-density-row" value={density} onChange={setDensity} options={DENSITY_OPTIONS}
            renderOption={option => (
              <>
                <strong>{option.label}</strong>
                <span>{option.hint}</span>
              </>
            )} />
        </div>
      </Card>

      <Card>
        <div className="appearance-section">
          <h2>Motion</h2>
          <ToggleRow label="Reduce motion" sub="Minimizes animations and transitions across Studio."
            value={reducedMotion === "reduce"} onChange={reduce => setReducedMotion(reduce ? "reduce" : "system")} />
        </div>
      </Card>
    </section>
  );
}
