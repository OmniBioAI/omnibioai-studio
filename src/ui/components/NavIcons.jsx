import React from "react";

// One shared semantic icon per nav destination -- kept monochrome
// (stroke="currentColor") so Sidebar/MobileNav's existing active/inactive
// row color still drives icon color, same as the dot marker it replaces.
const base = {
  width: 16, height: 16, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round",
  "aria-hidden": "true", focusable: "false",
};

const IconHome        = p => <svg {...base} {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9a1 1 0 0 0 1 1H9.5v-5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5h3a1 1 0 0 0 1-1v-9" /></svg>;
const IconSparkles     = p => <svg {...base} {...p}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M5 17l.8 2.2L8 20l-2.2.8L5 23l-.8-2.2L2 20l2.2-.8L5 17z" /></svg>;
const IconFolder       = p => <svg {...base} {...p}><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8A1.5 1.5 0 0 1 20.5 9v8A1.5 1.5 0 0 1 19 18.5H4.5A1.5 1.5 0 0 1 3 17z" /></svg>;
const IconCode         = p => <svg {...base} {...p}><path d="M9 7 4 12l5 5" /><path d="M15 7l5 5-5 5" /></svg>;
const IconGitBranch    = p => <svg {...base} {...p}><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="8" r="2" /><path d="M6 7v10" /><path d="M6 10c0 4 4 4 8 4h2" /><path d="M18 10V8" /></svg>;
const IconActivity     = p => <svg {...base} {...p}><path d="M3 12h4l2.5 7L14 5l2.5 7H21" /></svg>;
const IconPackage      = p => <svg {...base} {...p}><path d="M21 8 12 3 3 8l9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>;
const IconCompass      = p => <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M14.8 9.2 13 13l-3.8 1.8L11 11l3.8-1.8z" /></svg>;
const IconSliders      = p => <svg {...base} {...p}><path d="M4 7h7" /><path d="M15 7h5" /><circle cx="11" cy="7" r="2" /><path d="M4 17h4" /><path d="M12 17h8" /><circle cx="8" cy="17" r="2" /></svg>;
const IconBrain        = p => <svg {...base} {...p}><path d="M9 4.5a2.5 2.5 0 0 0-2.5 2.5v.3A2.7 2.7 0 0 0 5 9.8v1.4a2.7 2.7 0 0 0 1.2 2.2v1A2.6 2.6 0 0 0 9 17v1a2.5 2.5 0 0 0 5 0V7a2.5 2.5 0 0 0-5 0" /><path d="M15 4.5a2.5 2.5 0 0 1 2.5 2.5v.3A2.7 2.7 0 0 1 19 9.8v1.4a2.7 2.7 0 0 1-1.2 2.2v1A2.6 2.6 0 0 1 15 17" /></svg>;
const IconCloud        = p => <svg {...base} {...p}><path d="M6.5 18a4 4 0 1 1 .6-7.95A5 5 0 0 1 17 11a3.5 3.5 0 0 1 .5 7z" /></svg>;
const IconServer       = p => <svg {...base} {...p}><rect x="3" y="4" width="18" height="6" rx="1.2" /><rect x="3" y="14" width="18" height="6" rx="1.2" /><path d="M7 7h.01" /><path d="M7 17h.01" /></svg>;
const IconRocket       = p => <svg {...base} {...p}><path d="M12 3c2.5 1.5 4 4.3 4 8 0 2-.7 3.8-1.8 5.2L12 18l-2.2-1.8C8.7 14.8 8 13 8 11c0-3.7 1.5-6.5 4-8z" /><path d="M9.5 16 7 18.5" /><path d="M14.5 16 17 18.5" /><circle cx="12" cy="10" r="1.3" /></svg>;
const IconBoxes        = p => <svg {...base} {...p}><path d="M12 3 7 6v5l5 3 5-3V6z" /><path d="M7 11 3 13.5v5L8 21l4-2.5" /><path d="M17 11l4 2.5v5L16 21l-4-2.5" /></svg>;
const IconTerminal     = p => <svg {...base} {...p}><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M7 9l3 3-3 3" /><path d="M12 15h5" /></svg>;
const IconScrollText   = p => <svg {...base} {...p}><path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 1 1-4 0V6" /><path d="M6 4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9" /><path d="M8 9h7" /><path d="M8 13h5" /></svg>;
const IconCreditCard   = p => <svg {...base} {...p}><rect x="2.5" y="5.5" width="19" height="13" rx="1.8" /><path d="M2.5 9.5h19" /><path d="M6 14.5h4" /></svg>;
const IconWrench       = p => <svg {...base} {...p}><path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2z" /></svg>;
const IconShield       = p => <svg {...base} {...p}><path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z" /></svg>;
const IconPlug         = p => <svg {...base} {...p}><path d="M9 2v5" /><path d="M15 2v5" /><path d="M6 8h12v4a6 6 0 0 1-12 0z" /><path d="M12 18v4" /></svg>;
const IconSettings     = p => <svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.4-2-3.4-2.2.7a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.4a7.6 7.6 0 0 0-2.6 1.5l-2.2-.7-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3L2.7 15l2 3.4 2.2-.7a7.6 7.6 0 0 0 2.6 1.5l.5 2.4h4l.5-2.4a7.6 7.6 0 0 0 2.6-1.5l2.2.7 2-3.4z" /></svg>;

// Keyed by the exact nav-item `name` used throughout App.jsx/Sidebar/MobileNav
// -- shared by both desktop and mobile so there is exactly one icon mapping.
export const NAV_ICONS = {
  "Studio":        IconHome,
  "Ask OmniBioAI": IconSparkles,
  "Projects":      IconFolder,
  "Code":          IconCode,
  "Workflows":     IconGitBranch,
  "Jobs":          IconActivity,
  "Artifacts":     IconPackage,
  "Explore":       IconCompass,
  "Mode":          IconSliders,
  "LLM":           IconBrain,
  "Cloud":         IconCloud,
  "HPC":           IconServer,
  "Launch":        IconRocket,
  "Services":      IconBoxes,
  "IDE Services":  IconTerminal,
  "Logs":          IconScrollText,
  "Billing":       IconCreditCard,
  "Developer":     IconWrench,
  "Roles":         IconShield,
  "Connections":   IconPlug,
  "Settings":      IconSettings,
};
